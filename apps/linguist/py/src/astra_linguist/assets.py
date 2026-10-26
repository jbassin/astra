"""Dagster wiring — the linguist assets, their automation, and the timeline sensor.

One partition per session/date in the pipeline's shared ``sessions`` set.
`session_transcripts` depends on scribe's `session_transcript`: it reads that asset's
`script.json`, runs the pipeline, and writes the three outputs (`data/{date}.json`, the
campaign-matched `script/*.txt`, the canonical `transcripts/*.txt`). Its automation
condition (`LINGUIST_STAGE`, evaluated by `linguist_automation`) launches it, with
`session_episode_summary` in the same run, once scribe's transcript is materialized.

NOTE: the plan models three assets (formatted/context/canonical); v1 ships one
`session_transcripts` asset producing all three files (downstream consumers read
files, not asset boundaries). Splitting is a refinement. The combined session audio
is now served same-origin by akasha-frontend at `/audio/<date>.mp3` (off the
akasha-audio volume) — linguist composes that relative URL; akasha also normalizes it
at build time, so the 78 already-committed transcripts (which baked faerrin's old
absolute static-audio.iridi.cc URL) need no re-gen.
"""

import json
from pathlib import Path

import dagster as dg
from astra_lexicon import load_corrections
from astra_observe import get_logger, get_meter
from astra_ontology import load_being
from astra_ontology_being import BEING_KDL_PATH
from astra_pipeline_resources import (
    EXTERNAL_API_RETRY,
    AstraConfig,
    LlmResource,
    PipelinePaths,
    default_resources,
    loaded_config,
)
from astra_pipeline_resources.partitions import (
    SessionStage,
    follows,
    sessions,
    stage_automation,
    stage_sensor,
)
from astra_sessions import MIN_TRANSCRIPT_SEGMENTS, atomic_write_text

from .campaigns import campaign_filename, campaign_views
from .chronicle import (
    Chronicle,
    chronicle_inputs_hash,
    load_episode_entries,
    timeline_is_current,
)
from .models import RawLine, load_session
from .pipeline import process_session
from .roster import SpeakerResolver
from .sensor import has_script

_log = get_logger("astra.linguist")
_meter = get_meter("astra.linguist")
_sessions_counter = _meter.create_counter(
    "astra.linguist.sessions", description="sessions ingested"
)
_episodes_counter = _meter.create_counter(
    "astra.chronicle.episodes", description="chronicle episode summaries generated"
)

# Same-origin base: akasha-frontend serves the combined recording at /audio/<date>.mp3
# off its audio volume (akasha also build-time-normalizes, so the form is belt-and-
# suspenders). Replaces the old absolute faerrin static-audio.iridi.cc host.
AUDIO_BASE = "/audio"

#: scribe's transcript asset (`astra_scribe.assets.session_transcript`), by key: linguist
#: does not import scribe. ``dagster/tests/test_definitions.py`` pins the edge.
SCRIBE_TRANSCRIPT = dg.AssetKey("session_transcript")
#: scribe's blocking check on that transcript (`astra_scribe.assets.transcript_not_empty`).
#: linguist launches only once it passed; the test pins that it exists.
SCRIBE_TRANSCRIPT_CHECK = dg.AssetCheckKey(SCRIBE_TRANSCRIPT, "transcript_not_empty")


def _linguist_config():
    from astra_ontology_config import load as load_config

    return load_config().linguist


def _has_script(key: str) -> bool:
    saved = _linguist_config().ingest_saved_dir
    return bool(saved) and has_script(saved, key)


#: When linguist launches for a session (``dagster/migrate_sessions.py`` reads it too).
LINGUIST_STAGE = SessionStage(
    upstream=SCRIBE_TRANSCRIPT,
    stage=dg.AssetKey("session_transcripts"),
    keep=_has_script,
    gates=(SCRIBE_TRANSCRIPT_CHECK,),
)


@dg.asset(
    partitions_def=sessions,
    automation_condition=stage_automation(LINGUIST_STAGE),
    group_name="linguist",
    deps=[SCRIBE_TRANSCRIPT],
)
def session_transcripts(
    context: dg.AssetExecutionContext, pipeline_paths: PipelinePaths
) -> dg.MaterializeResult:
    """Process one session: scribe script.json → formatted + context + canonical.

    Refuses, writing nothing, a ``script.json`` under ``MIN_TRANSCRIPT_SEGMENTS``: the
    automation never launches for one (scribe's ``transcript_not_empty`` gate), but a hand
    materialize, or a session from before the check, would publish an empty transcript."""
    date = context.partition_key
    being = load_being(BEING_KDL_PATH)
    data_dir = Path(pipeline_paths.linguist_data)
    script_dir = Path(pipeline_paths.linguist_script)
    transcript_dir = pipeline_paths.transcripts

    raw_path = Path(pipeline_paths.linguist_saved) / date / "script.json"
    raw = [RawLine(**line) for line in json.loads(raw_path.read_text(encoding="utf-8"))]
    if len(raw) < MIN_TRANSCRIPT_SEGMENTS:
        # Deterministic: a retry reads the same file. Fix scribe's output first.
        raise dg.Failure(
            description=(
                f"session {date} script.json has {len(raw)} segments (the floor is "
                f"{MIN_TRANSCRIPT_SEGMENTS}): an empty or broken transcript is not published. "
                "Re-transcribe the session (scribe README)."
            ),
            metadata={"segments": len(raw), "floor": MIN_TRANSCRIPT_SEGMENTS},
            allow_retries=False,
        )

    artifacts = process_session(
        date,
        f"{AUDIO_BASE}/{date}.mp3",
        raw,
        replace=load_corrections(),
        resolver=SpeakerResolver.from_being(BEING_KDL_PATH),
        campaigns=campaign_views(being),
    )

    data_dir.mkdir(parents=True, exist_ok=True)
    atomic_write_text(data_dir / f"{date}.json", _to_json(artifacts.transcript.model_dump()))

    matched_name = "unmatched"
    if artifacts.matched is not None and artifacts.context is not None:
        stem = campaign_filename(artifacts.matched)
        matched_name = stem
        script_dir.mkdir(parents=True, exist_ok=True)
        transcript_dir.mkdir(parents=True, exist_ok=True)
        atomic_write_text(script_dir / f"{stem}.{date}.txt", artifacts.context)
        if artifacts.canonical is not None:
            atomic_write_text(transcript_dir / f"{stem}.{date}.txt", artifacts.canonical)

    _sessions_counter.add(1)
    _log.info(
        "linguist ingested session %s: %d lines, campaign=%s",
        date,
        len(artifacts.transcript.script),
        matched_name,
    )
    return dg.MaterializeResult(
        metadata={"lines": len(artifacts.transcript.script), "campaign": matched_name}
    )


@dg.asset(
    partitions_def=sessions,
    automation_condition=follows(session_transcripts),
    deps=[session_transcripts],
    group_name="chronicle",
    retry_policy=EXTERNAL_API_RETRY,
)
def session_episode_summary(
    context: dg.AssetExecutionContext,
    astra_config: AstraConfig,
    pipeline_paths: PipelinePaths,
    llm: LlmResource,
) -> dg.MaterializeResult:
    """Summarize one session into a Rich chronicle `EpisodeEntry`.

    Runs in the same run as `session_transcripts` (it reads that asset's
    `data/{date}.json`) and writes `timeline/episodes/{date}.json`. **Live** — spends
    GLM-5.2 tokens per session via `astra_llm` (`call_structured`); the cost is
    metered as `astra.llm.cost_usd{caller="linguist.session_episode_summary"}`."""
    from .chronicle import show_for_date
    from .chronicle_llm import build_episode_entry  # lazy: pulls astra_llm/litellm

    date = context.partition_key
    transcript_dir = pipeline_paths.transcripts
    if show_for_date(date, transcript_dir=transcript_dir) is None:
        # Not one of the chronicle shows (unmatched/excluded) — no episode summary.
        _log.info("chronicle skipping %s: not a chronicle show", date)
        return dg.MaterializeResult(metadata={"status": "skipped (unmatched)"})

    transcript = load_session(Path(pipeline_paths.linguist_data) / f"{date}.json")
    entry = build_episode_entry(
        date,
        transcript,
        client=llm.client("linguist.session_episode_summary"),
        model=astra_config.get().llm.default_model,
        transcript_dir=transcript_dir,
    )
    episodes_dir = pipeline_paths.chronicle_episodes
    episodes_dir.mkdir(parents=True, exist_ok=True)
    atomic_write_text(episodes_dir / f"{date}.json", entry.model_dump_json(indent=2))
    _episodes_counter.add(1, {"show": entry.show})
    _log.info(
        "chronicle summarized episode %s (show=%s): %r, %d beats",
        date,
        entry.show,
        entry.summary.title,
        len(entry.summary.key_beats),
    )
    return dg.MaterializeResult(
        metadata={
            "show": entry.show,
            "title": entry.summary.title,
            "beats": len(entry.summary.key_beats),
        }
    )


@dg.asset(deps=[session_episode_summary], group_name="chronicle", retry_policy=EXTERNAL_API_RETRY)
def campaign_timeline(
    astra_config: AstraConfig, pipeline_paths: PipelinePaths, llm: LlmResource
) -> dg.MaterializeResult:
    """Group every episode summary into the Show → Season → Episode `Chronicle`.

    Reads all `timeline/episodes/*.json`, groups by show, orders shows main-first then
    by first-session date, and (per show) calls GLM-5.2 to assign contiguous seasons,
    writing `timeline/seasons.json`. `campaign_timeline_sensor` launches it after a new
    episode summary, and only when the inputs changed. **Skips the GLM calls when the
    episode inputs are unchanged**, so a hand materialize is a no-op too."""
    entries = load_episode_entries(pipeline_paths.chronicle_episodes)
    if not entries:
        return dg.MaterializeResult(metadata={"shows": 0, "status": "no episodes yet"})

    new_hash = chronicle_inputs_hash(entries)
    seasons_path = pipeline_paths.seasons
    if seasons_path.exists():
        existing = Chronicle.model_validate_json(seasons_path.read_text(encoding="utf-8"))
        if existing.inputs_hash == new_hash:
            _log.info("chronicle seasons unchanged (%d episodes) — skipping", len(entries))
            return dg.MaterializeResult(
                metadata={"shows": len(existing.shows), "status": "unchanged"}
            )

    from .chronicle_llm import build_chronicle  # lazy: pulls astra_llm/litellm

    chronicle = build_chronicle(
        entries,
        client=llm.client("linguist.campaign_timeline"),
        model=astra_config.get().llm.default_model,
    )
    chronicle.inputs_hash = new_hash
    seasons_path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(seasons_path, chronicle.model_dump_json(indent=2))
    total_seasons = sum(len(s.seasons) for s in chronicle.shows)
    _log.info(
        "chronicle grouped %d episodes into %d show(s), %d season(s)",
        len(entries),
        len(chronicle.shows),
        total_seasons,
    )
    return dg.MaterializeResult(
        metadata={
            "shows": len(chronicle.shows),
            "seasons": total_seasons,
            "episodes": len(entries),
            "status": "rebuilt",
        }
    )


#: Run statuses that count as "a campaign_timeline run is already going".
_IN_FLIGHT = (
    dg.DagsterRunStatus.QUEUED,
    dg.DagsterRunStatus.NOT_STARTED,
    dg.DagsterRunStatus.STARTING,
    dg.DagsterRunStatus.STARTED,
    dg.DagsterRunStatus.CANCELING,
)


def _latest_summary_id(instance: dg.DagsterInstance) -> int | None:
    """Storage id of the newest `session_episode_summary` materialization, any session."""
    records = instance.fetch_materializations(session_episode_summary.key, limit=1).records
    return records[0].storage_id if records else None


def _timeline_in_flight(instance: dg.DagsterInstance) -> bool:
    """True while any run that materializes `campaign_timeline` is queued or running
    (the sensor's own runs and hand-launched ones alike)."""
    runs = instance.get_runs(filters=dg.RunsFilter(statuses=list(_IN_FLIGHT)))
    return any(campaign_timeline.key in (run.asset_selection or set()) for run in runs)


def _timeline_paths() -> PipelinePaths:
    """Sensors read config directly (they get no resources)."""
    return PipelinePaths.from_config(loaded_config())


@dg.sensor(
    target=[campaign_timeline],
    minimum_interval_seconds=60,
    default_status=dg.DefaultSensorStatus.RUNNING,
)
def campaign_timeline_sensor(context: dg.SensorEvaluationContext) -> dg.SensorResult:
    """Rebuild the seasons after a new `session_episode_summary` materialization, and only
    when the episode inputs changed.

    The cursor is the storage id of the newest summary materialization seen. A newer one
    requests one run if `timeline_is_current` says `seasons.json` is stale, so an unchanged
    input set (a skipped, unmatched session) never starts a run. While a run that
    materializes `campaign_timeline` is in flight the sensor waits without moving its
    cursor. A failed rebuild is not retried: re-execute it, or materialize by hand."""
    latest = _latest_summary_id(context.instance)
    cursor = context.cursor or ""
    seen = int(cursor) if cursor.isdigit() else 0
    if latest is None or latest <= seen:
        return dg.SensorResult()
    if _timeline_in_flight(context.instance):
        return dg.SensorResult(skip_reason="a campaign_timeline run is in flight")
    paths = _timeline_paths()
    if timeline_is_current(paths.chronicle_episodes, paths.seasons):
        return dg.SensorResult(skip_reason="chronicle episode inputs unchanged", cursor=str(latest))
    return dg.SensorResult(
        run_requests=[dg.RunRequest(run_key=f"campaign_timeline:{latest}")],
        cursor=str(latest),
    )


linguist_automation = stage_sensor(
    "linguist_automation",
    [session_transcripts, session_episode_summary],
    description=(
        "Runs session_transcripts then session_episode_summary for each session whose scribe "
        "transcript was newly materialized, passed transcript_not_empty, has script.json, "
        "and was never tried by linguist. Stop it to pause linguist launches."
    ),
)


def _to_json(value: object) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False)


defs = dg.Definitions(
    assets=[
        session_transcripts,
        session_episode_summary,
        campaign_timeline,
    ],
    sensors=[linguist_automation, campaign_timeline_sensor],
    resources=default_resources(),
)
