"""Dagster wiring — the per-session partition, the Craig-drop sensor, the assets.

One partition per session/date (a `DynamicPartitionsDefinition`); a sensor
registers a partition + run request for each new Craig zip (Dagster's
materialization state replaces faerrin's disk ledger, N7).

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
import os
import shutil
import tempfile
from pathlib import Path

# No `from __future__ import annotations` here: Dagster introspects the `context`
# annotation at definition time and needs the real type, not a string.
import dagster as dg
from astra_config import ScribeConfig
from astra_observe import get_logger, get_meter, get_tracer
from astra_ontology_being import BEING_KDL_PATH
from astra_ontology_config import load as load_config

from .ingest import session_id
from .roster import Roster
from .sensor import new_sessions
from .session import build_transcript, extract_session_tracks, merge_audio
from .transcribe import TrackTranscriber

#: One partition per session/date; the sensor adds keys as zips land.
SESSIONS_NAME = "scribe_sessions"
scribe_sessions = dg.DynamicPartitionsDefinition(name=SESSIONS_NAME)

_log = get_logger("astra.scribe")
_tracer = get_tracer("astra.scribe")
_meter = get_meter("astra.scribe")
_sessions_counter = _meter.create_counter(
    "astra.scribe.sessions", description="sessions transcribed"
)


def _find_zip(incoming: str, date_key: str) -> Path:
    """The dropped zip whose stem maps to this session/date partition."""
    for zip_path in sorted(Path(incoming).glob("*.zip")):
        if session_id(zip_path) == date_key:
            return zip_path
    raise FileNotFoundError(f"no Craig zip for session {date_key} in {incoming}")


def _tracks_dir(cfg: ScribeConfig, date_key: str) -> Path:
    """The per-partition persisted-tracks dir (shared by the audio + transcript tails)."""
    return Path(cfg.tmp_path) / date_key / "tracks"


@dg.asset(partitions_def=scribe_sessions, group_name="scribe")
def session_tracks(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Root: verify + extract the Craig zip once → persist player tracks for both tails.

    C8 (re-run caveat): `session_cleanup` deletes these tracks, so to re-run a single
    tail (`session_audio`/`session_transcript`) materialize FROM this asset.
    """
    date_key = context.partition_key
    cfg = load_config().scribe
    roster = Roster.from_being(BEING_KDL_PATH)
    zip_path = _find_zip(cfg.incoming_path, date_key)
    with _tracer.start_as_current_span("scribe.extract") as span:
        tracks = extract_session_tracks(zip_path, _tracks_dir(cfg, date_key), roster)
        span.set_attribute("scribe.tracks", len(tracks))
    _log.info("scribe extracted %d player tracks for %s", len(tracks), date_key)
    return dg.MaterializeResult(metadata={"tracks": len(tracks)})


@dg.asset(partitions_def=scribe_sessions, group_name="scribe", deps=[session_tracks])
def session_audio(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Merge the persisted tracks → saved/<date>/audio.mp3 (parallel to the transcript)."""
    date_key = context.partition_key
    cfg = load_config().scribe
    tracks = sorted(_tracks_dir(cfg, date_key).glob("*.aac"))
    out = Path(cfg.data_path) / "saved" / date_key
    out.mkdir(parents=True, exist_ok=True)
    with _tracer.start_as_current_span("scribe.merge") as span:
        merge_audio(tracks, out / "audio.mp3")
        span.set_attribute("scribe.tracks", len(tracks))
    _log.info("scribe merged audio for %s (%d tracks)", date_key, len(tracks))
    return dg.MaterializeResult(metadata={"tracks": len(tracks)})


@dg.asset(partitions_def=scribe_sessions, group_name="scribe", deps=[session_tracks])
def session_transcript(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Transcribe the persisted tracks → saved/<date>/script.json (parallel to the audio).

    Writes script.json — the surface linguist's `scribe_output_sensor` watches — and
    increments the session-transcribed counter (once per session).
    """
    date_key = context.partition_key
    cfg = load_config().scribe
    roster = Roster.from_being(BEING_KDL_PATH)
    api_key = cfg.groq_api_key.resolve() if cfg.groq_api_key else None
    # Model from config (config-single-source) — not the TrackTranscriber constant default.
    transcriber = TrackTranscriber(api_key=api_key, model=cfg.model)
    tracks = sorted(_tracks_dir(cfg, date_key).glob("*.aac"))
    out = Path(cfg.data_path) / "saved" / date_key
    out.mkdir(parents=True, exist_ok=True)
    with (
        _tracer.start_as_current_span("scribe.transcribe") as span,
        tempfile.TemporaryDirectory() as work,
    ):
        script = build_transcript(tracks, roster, transcriber, Path(work) / "chunks")
        # Atomic appearance for the transcript (N7): write `.tmp` then rename.
        script_path = out / "script.json"
        tmp = script_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(script), encoding="utf-8")
        os.replace(tmp, script_path)
        span.set_attribute("scribe.segments", len(script))
    _sessions_counter.add(1)
    _log.info("scribe transcribed session %s (%d segments)", date_key, len(script))
    return dg.MaterializeResult(metadata={"segments": len(script)})


@dg.asset(
    partitions_def=scribe_sessions,
    group_name="scribe",
    deps=[session_audio, session_transcript],
)
def session_cleanup(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Fan-in: rm -rf {tmp_path}/<date>/ once BOTH audio + transcript succeed.

    If either tail fails the run fails and the tracks dir is retained (a re-run
    reuses it / aids debugging). C8: re-run a tail by materializing `session_tracks`.
    """
    date_key = context.partition_key
    cfg = load_config().scribe
    with _tracer.start_as_current_span("scribe.cleanup"):
        shutil.rmtree(Path(cfg.tmp_path) / date_key, ignore_errors=True)
    _log.info("scribe cleaned up tmp tracks for %s", date_key)
    return dg.MaterializeResult(metadata={"removed": True})


#: The scribe fan-out, in dependency order — the sensor target + the defs registration.
SCRIBE_ASSETS = [session_tracks, session_audio, session_transcript, session_cleanup]


@dg.sensor(
    target=SCRIBE_ASSETS,
    minimum_interval_seconds=30,
    default_status=dg.DefaultSensorStatus.RUNNING,
)
def craig_drop_sensor(context: dg.SensorEvaluationContext) -> dg.SensorResult:
    """Register a partition + run request for each new Craig zip in `incoming_path`."""
    incoming = load_config().scribe.incoming_path
    if not incoming or not Path(incoming).is_dir():
        return dg.SensorResult()
    existing = set(context.instance.get_dynamic_partitions(SESSIONS_NAME))
    found = new_sessions(Path(incoming).glob("*.zip"), existing)
    adds = [scribe_sessions.build_add_request(list(found))] if found else []
    return dg.SensorResult(
        run_requests=[dg.RunRequest(partition_key=key) for key in found],
        dynamic_partitions_requests=adds,
    )


defs = dg.Definitions(assets=SCRIBE_ASSETS, sensors=[craig_drop_sensor])
