"""Dagster wiring — the Craig-drop sensor and the scribe assets.

One partition per session/date in the pipeline's shared ``sessions`` set
(`astra_pipeline_resources.partitions`). ``craig_drop_sensor`` is the only code that adds
keys to it: a partition + run request for each new Craig zip (Dagster's materialization
state replaces faerrin's disk ledger, N7).

scribe fans out (0021 Change A) so audio merge and transcription run in parallel:

    session_tracks      verify + extract + roster-filter → persist player tracks
       ├─► session_audio        merge_audio      → saved/<date>/audio.mp3
       └─► session_transcript   build_transcript → saved/<date>/script.json
                session_cleanup (fan-in)  rm -rf {tmp_path}/<date>/

`session_audio` + `session_transcript` depend only on the shared `session_tracks`,
so the multiprocess executor runs them concurrently — verify + extract happen once.
`session_cleanup` fans in on BOTH tails, so the persisted tracks are deleted only
after audio + transcript both succeed. Output paths are unchanged, so the linguist
sensor + the akasha-seed recipe keep working with no config/path change.
"""

import json
import shutil
import tempfile
from pathlib import Path

# No `from __future__ import annotations` here: Dagster introspects the `context`
# annotation at definition time and needs the real type, not a string.
import dagster as dg
from astra_observe import get_logger, get_meter, get_tracer
from astra_ontology_being import BEING_KDL_PATH
from astra_ontology_config import load as load_config
from astra_pipeline_resources import AstraConfig, PipelinePaths, default_resources
from astra_pipeline_resources.partitions import (
    SESSIONS_NAME,
    SKIP_PENDING,
    migration_pending,
    session_check,
    sessions,
)
from astra_sessions import atomic_write_text, recording_key

from .roster import Roster
from .sensor import (
    Recording,
    is_session_zip,
    new_sessions,
    real_recordings,
    session_recordings,
    stray_recordings,
)
from .session import build_transcript, extract_session_tracks, merge_audio
from .transcribe import TrackTranscriber

_log = get_logger("astra.scribe")
_tracer = get_tracer("astra.scribe")
_meter = get_meter("astra.scribe")
_sessions_counter = _meter.create_counter(
    "astra.scribe.sessions", description="sessions transcribed"
)


#: Run tag naming the Craig zip (its file name in ``scribe.incoming-path``) that
#: ``craig_drop_sensor`` chose for the session. ``session_tracks`` reads it, so the asset
#: processes the zip the sensor registered. A re-execution copies the tag.
ZIP_TAG = "astra/craig-zip"


def _find_zip(incoming: str, date_key: str) -> Path:
    """The zip the sensor's rule (`new_sessions`) picks for this session, for a run that
    carries no `ZIP_TAG` (a hand materialize or a run launched before the tag existed)."""
    found = new_sessions(Path(incoming).glob("*.zip"), set()).get(date_key)
    if found is None:
        raise FileNotFoundError(f"no Craig zip for session {date_key} in {incoming}")
    return Path(found)


def _session_zip(context: dg.AssetExecutionContext, incoming: str, date_key: str) -> Path:
    """The run's `ZIP_TAG` zip, or `_find_zip` when the run has no tag. A tagged zip that
    is gone or belongs to another date fails the run rather than picking another zip."""
    name = context.run.tags.get(ZIP_TAG)
    if not name:
        return _find_zip(incoming, date_key)
    zip_path = Path(incoming) / Path(name).name
    if recording_key(zip_path) != date_key or not is_session_zip(zip_path):
        raise FileNotFoundError(
            f"the Craig zip {name} that craig_drop_sensor chose for session {date_key} is "
            f"not a recording of that date in {incoming}"
        )
    return zip_path


def _tracks_dir(paths: PipelinePaths, date_key: str) -> Path:
    """The per-partition persisted-tracks dir (shared by the audio + transcript tails)."""
    return Path(paths.scribe_tmp) / date_key / "tracks"


@dg.asset(partitions_def=sessions, group_name="scribe")
def session_tracks(
    context: dg.AssetExecutionContext, pipeline_paths: PipelinePaths
) -> dg.MaterializeResult:
    """Root: verify + extract the Craig zip once → persist player tracks for both tails.

    The zip is the one `craig_drop_sensor` chose (the run's `ZIP_TAG`); the materialization
    records its name.

    C8 (re-run caveat): `session_cleanup` deletes these tracks, so to re-run a single
    tail (`session_audio`/`session_transcript`) materialize FROM this asset.
    """
    date_key = context.partition_key
    roster = Roster.from_being(BEING_KDL_PATH)
    zip_path = _session_zip(context, pipeline_paths.scribe_incoming, date_key)
    with _tracer.start_as_current_span("scribe.extract") as span:
        tracks = extract_session_tracks(zip_path, _tracks_dir(pipeline_paths, date_key), roster)
        span.set_attribute("scribe.tracks", len(tracks))
    _log.info("scribe extracted %d player tracks for %s from %s", len(tracks), date_key, zip_path)
    return dg.MaterializeResult(metadata={"tracks": len(tracks), "zip": zip_path.name})


@dg.asset(partitions_def=sessions, group_name="scribe", deps=[session_tracks])
def session_audio(
    context: dg.AssetExecutionContext, pipeline_paths: PipelinePaths
) -> dg.MaterializeResult:
    """Merge the persisted tracks → saved/<date>/audio.mp3 (parallel to the transcript)."""
    date_key = context.partition_key
    tracks = sorted(_tracks_dir(pipeline_paths, date_key).glob("*.aac"))
    out = Path(pipeline_paths.scribe_data) / "saved" / date_key
    out.mkdir(parents=True, exist_ok=True)
    with _tracer.start_as_current_span("scribe.merge") as span:
        merge_audio(tracks, out / "audio.mp3")
        span.set_attribute("scribe.tracks", len(tracks))
    _log.info("scribe merged audio for %s (%d tracks)", date_key, len(tracks))
    return dg.MaterializeResult(metadata={"tracks": len(tracks)})


@dg.asset(partitions_def=sessions, group_name="scribe", deps=[session_tracks])
def session_transcript(
    context: dg.AssetExecutionContext, astra_config: AstraConfig, pipeline_paths: PipelinePaths
) -> dg.MaterializeResult:
    """Transcribe the persisted tracks → saved/<date>/script.json (parallel to the audio).

    Writes script.json, which linguist's `session_transcripts` (its dependent) reads, and
    increments the session-transcribed counter (once per session).
    """
    date_key = context.partition_key
    cfg = astra_config.get().scribe
    roster = Roster.from_being(BEING_KDL_PATH)
    api_key = cfg.groq_api_key.require() if cfg.groq_api_key else None
    # Model from config (config-single-source) — not the TrackTranscriber constant default.
    transcriber = TrackTranscriber(api_key=api_key, model=cfg.model)
    tracks = sorted(_tracks_dir(pipeline_paths, date_key).glob("*.aac"))
    out = Path(pipeline_paths.scribe_data) / "saved" / date_key
    out.mkdir(parents=True, exist_ok=True)
    with (
        _tracer.start_as_current_span("scribe.transcribe") as span,
        tempfile.TemporaryDirectory() as work,
    ):
        script = build_transcript(tracks, roster, transcriber, Path(work) / "chunks")
        # A materialized partition means done, so the transcript appears whole or not at all:
        # write `.tmp` then rename.
        atomic_write_text(out / "script.json", json.dumps(script))
        span.set_attribute("scribe.segments", len(script))
    _sessions_counter.add(1)
    _log.info("scribe transcribed session %s (%d segments)", date_key, len(script))
    return dg.MaterializeResult(metadata={"segments": len(script)})


@dg.asset(
    partitions_def=sessions,
    group_name="scribe",
    deps=[session_audio, session_transcript],
)
def session_cleanup(
    context: dg.AssetExecutionContext, pipeline_paths: PipelinePaths
) -> dg.MaterializeResult:
    """Fan-in: rm -rf {tmp_path}/<date>/ once BOTH audio + transcript succeed.

    If either tail fails the run fails and the tracks dir is retained (a re-run
    reuses it / aids debugging). C8: re-run a tail by materializing `session_tracks`.
    """
    date_key = context.partition_key
    with _tracer.start_as_current_span("scribe.cleanup"):
        shutil.rmtree(Path(pipeline_paths.scribe_tmp) / date_key, ignore_errors=True)
    _log.info("scribe cleaned up tmp tracks for %s", date_key)
    return dg.MaterializeResult(metadata={"removed": True})


#: The scribe fan-out, in dependency order — the sensor target + the defs registration.
SCRIBE_ASSETS = [session_tracks, session_audio, session_transcript, session_cleanup]


# ── blocking checks ──────────────────────────────────────────────────────────
# A failed check fails the run, so `pipeline_failure_alert` pages with the session key, and
# skips the rest of the run: the tracks checks stop the Groq transcription, and the
# transcript check stops `session_cleanup` (the tracks stay for a rerun). linguist's sensor
# gates on the transcript check (`LINGUIST_STAGE.gates`), so no paid LLM stage launches.

#: A real session has thousands of segments (3635 was the fewest by 2026-10); one under
#: this floor is an empty or broken transcript, never a short session.
MIN_TRANSCRIPT_SEGMENTS = 100


def _recordings(pipeline_paths: PipelinePaths, key: str) -> list[Recording]:
    return session_recordings(Path(pipeline_paths.scribe_incoming).glob("*.zip"), key)


def _names(recordings: list[Recording]) -> list[str]:
    return [r.path.name for r in recordings]


@session_check(
    asset=session_tracks,
    name="single_recording",
    description=(
        "The session date has one Craig recording. With two, only the first zip in name "
        "order is transcribed and the other is lost."
    ),
)
def single_recording(
    context: dg.AssetCheckExecutionContext, pipeline_paths: PipelinePaths
) -> dg.AssetCheckResult:
    key = context.partition_key
    dated = [r for r in _recordings(pipeline_paths, key) if r.dated]
    ids = sorted({r.recording_id for r in dated})
    passed = len(ids) <= 1
    if not passed:
        _log.warning("scribe session %s has %d Craig recordings: %s", key, len(ids), _names(dated))
    return dg.AssetCheckResult(
        passed=passed,
        description=None
        if passed
        else (
            f"session {key} has {len(ids)} Craig recordings ({', '.join(_names(dated))}); "
            "only the first would be transcribed. Remove or merge the extra one, then "
            "re-execute the run."
        ),
        metadata={"session": key, "recordings": ids, "zips": _names(dated)},
    )


@session_check(
    asset=session_tracks,
    name="no_undated_recording",
    description=(
        "No undated Craig zip belongs to this session. An undated name is invisible to "
        "the pipeline, so its recording would be lost."
    ),
)
def no_undated_recording(
    context: dg.AssetCheckExecutionContext, pipeline_paths: PipelinePaths
) -> dg.AssetCheckResult:
    key = context.partition_key
    strays = stray_recordings(_recordings(pipeline_paths, key))
    if strays:
        _log.warning("scribe session %s has undated Craig zips: %s", key, _names(strays))
    return dg.AssetCheckResult(
        passed=not strays,
        description=None
        if not strays
        else (
            f"session {key} has an undated Craig zip ({', '.join(_names(strays))}) that is "
            "not the recording being processed. See the scribe README, 'Undated zip'."
        ),
        metadata={"session": key, "undated_zips": _names(strays)},
    )


@session_check(
    asset=session_transcript,
    name="transcript_not_empty",
    description=(
        f"script.json has at least {MIN_TRANSCRIPT_SEGMENTS} segments. Fewer means an empty "
        "or broken transcript, which linguist must not summarize."
    ),
)
def transcript_not_empty(
    context: dg.AssetCheckExecutionContext, pipeline_paths: PipelinePaths
) -> dg.AssetCheckResult:
    key = context.partition_key
    path = Path(pipeline_paths.scribe_data) / "saved" / key / "script.json"
    try:
        segments = len(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, ValueError, TypeError):
        segments = 0
    passed = segments >= MIN_TRANSCRIPT_SEGMENTS
    if not passed:
        _log.warning("scribe session %s transcript has %d segments", key, segments)
    return dg.AssetCheckResult(
        passed=passed,
        description=None
        if passed
        else (
            f"session {key} transcript has {segments} segments "
            f"(the floor is {MIN_TRANSCRIPT_SEGMENTS}): check the recording's tracks."
        ),
        metadata={"session": key, "segments": segments, "floor": MIN_TRANSCRIPT_SEGMENTS},
    )


SCRIBE_CHECKS = [single_recording, no_undated_recording, transcript_not_empty]


@dg.sensor(
    target=SCRIBE_ASSETS,
    minimum_interval_seconds=30,
    default_status=dg.DefaultSensorStatus.RUNNING,
)
def craig_drop_sensor(context: dg.SensorEvaluationContext) -> dg.SensorResult:
    """Register a ``sessions`` partition + run request for each new Craig zip in `incoming_path`.

    "New" means the zip's date is not a session yet. The sensor skips while the sessions
    migration is pending: an empty shared set would make every zip on disk look new.

    An undated zip that no dated name covers can't become a session. The sensor logs one
    WARN per such zip (the cursor remembers which) and names them in the skip reason."""
    incoming = load_config().scribe.incoming_path
    if not incoming or not Path(incoming).is_dir():
        return dg.SensorResult()
    if migration_pending(context.instance):
        return dg.SensorResult(skip_reason=SKIP_PENDING)
    zips = list(Path(incoming).glob("*.zip"))
    existing = set(context.instance.get_dynamic_partitions(SESSIONS_NAME))
    found = new_sessions(zips, existing)
    adds = [sessions.build_add_request(list(found))] if found else []
    strays = stray_recordings(real_recordings(zips))
    warned = _read_warned(context.cursor)
    for stray in strays:
        if stray.path.name not in warned:
            _log.warning(
                "scribe skips undated Craig zip %s (session %s per info.txt); hard-link it "
                "under a dated name (scribe README, 'Undated zip')",
                stray.path.name,
                stray.key or "unknown",
            )
    skip = (
        "undated Craig zips, not sessions: "
        + ", ".join(f"{s.path.name} ({s.key or 'no start time'})" for s in strays)
        if strays and not found
        else None
    )
    return dg.SensorResult(
        run_requests=[
            dg.RunRequest(partition_key=key, tags={ZIP_TAG: Path(zip_path).name})
            for key, zip_path in found.items()
        ],
        dynamic_partitions_requests=adds,
        skip_reason=skip,
        cursor=json.dumps({"warned": sorted(s.path.name for s in strays)}),
    )


def _read_warned(cursor: str | None) -> set[str]:
    """The undated zips already logged, from the cursor (an old or empty cursor: none)."""
    try:
        data = json.loads(cursor or "")
    except ValueError:
        return set()
    warned = data.get("warned") if isinstance(data, dict) else None
    return {str(name) for name in warned} if isinstance(warned, list) else set()


defs = dg.Definitions(
    assets=SCRIBE_ASSETS,
    asset_checks=SCRIBE_CHECKS,
    sensors=[craig_drop_sensor],
    resources=default_resources(),
)
