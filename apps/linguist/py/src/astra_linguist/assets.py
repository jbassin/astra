"""Dagster wiring — the linguist assets and the scribe→linguist sensor.

One partition per session/date in the pipeline's shared ``sessions`` set.
`session_transcripts` depends on scribe's `session_transcript`: it reads that asset's
`script.json`, runs the pipeline, and writes the three outputs (`data/{date}.json`, the
campaign-matched `script/*.txt`, the canonical `transcripts/*.txt`).
`scribe_output_sensor` launches it once scribe's transcript is materialized.

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
from astra_pipeline_resources import AstraConfig, LlmResource, PipelinePaths, default_resources
from astra_pipeline_resources.partitions import SessionStage, launch_ready, sessions
from astra_sessions import atomic_write_text

from .campaigns import campaign_filename, campaign_views
from .chronicle import Chronicle, chronicle_inputs_hash, load_episode_entries
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
#: The sensor launches linguist only once it passed; the test pins that it exists.
SCRIBE_TRANSCRIPT_CHECK = dg.AssetCheckKey(SCRIBE_TRANSCRIPT, "transcript_not_empty")


@dg.asset(partitions_def=sessions, group_name="linguist", deps=[SCRIBE_TRANSCRIPT])
def session_transcripts(
    context: dg.AssetExecutionContext, pipeline_paths: PipelinePaths
) -> dg.MaterializeResult:
    """Process one session: scribe script.json → formatted + context + canonical."""
    date = context.partition_key
    being = load_being(BEING_KDL_PATH)
    data_dir = Path(pipeline_paths.linguist_data)
    script_dir = Path(pipeline_paths.linguist_script)
    transcript_dir = pipeline_paths.transcripts

    raw_path = Path(pipeline_paths.linguist_saved) / date / "script.json"
    raw = [RawLine(**line) for line in json.loads(raw_path.read_text(encoding="utf-8"))]

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
    deps=[session_transcripts],
    group_name="chronicle",
)
def session_episode_summary(
    context: dg.AssetExecutionContext,
    astra_config: AstraConfig,
    pipeline_paths: PipelinePaths,
    llm: LlmResource,
) -> dg.MaterializeResult:
    """Summarize one session into a Rich chronicle `EpisodeEntry` (NLSpec 0019).

    Runs automatically after `session_transcripts` (it reads that asset's
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


@dg.asset(deps=[session_episode_summary], group_name="chronicle")
def campaign_timeline(
    astra_config: AstraConfig, pipeline_paths: PipelinePaths, llm: LlmResource
) -> dg.MaterializeResult:
    """Group every episode summary into the Show → Season → Episode `Chronicle`.

    Reads all `timeline/episodes/*.json`, groups by show, orders shows main-first then
    by first-session date, and (per show) calls GLM-5.2 to assign contiguous seasons,
    writing `timeline/seasons.json`. **Skips the GLM calls when the episode inputs are
    unchanged** (C9) so the linguist-commit timer / schedule is a no-op until a new
    summary lands."""
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


# The aggregate runs cheaply on a schedule (it skips the GLM calls when the episode
# inputs are unchanged), so a new session's seasons get regenerated automatically within
# the hour; the linguist-commit timer then commits + redeploys. Also materialized
# directly during the backfill.
campaign_timeline_job = dg.define_asset_job("campaign_timeline_job", selection=[campaign_timeline])


@dg.schedule(
    job=campaign_timeline_job,
    cron_schedule="0 * * * *",
    default_status=dg.DefaultScheduleStatus.RUNNING,
)
def campaign_timeline_schedule() -> dg.RunRequest:
    """Hourly regen of the chronicle seasons (a no-op until a new episode summary lands)."""
    return dg.RunRequest()


def _has_script(key: str) -> bool:
    saved = _linguist_config().ingest_saved_dir
    return bool(saved) and has_script(saved, key)


#: What `scribe_output_sensor` launches, and when (``dagster/migrate_sessions.py`` reads it).
LINGUIST_STAGE = SessionStage(
    upstream=SCRIBE_TRANSCRIPT,
    stage=session_transcripts.key,
    keep=_has_script,
    gates=(SCRIBE_TRANSCRIPT_CHECK,),
)


@dg.sensor(
    target=[session_transcripts, session_episode_summary],
    minimum_interval_seconds=30,
    default_status=dg.DefaultSensorStatus.RUNNING,
)
def scribe_output_sensor(context: dg.SensorEvaluationContext) -> dg.SensorResult:
    """Run linguist for each session whose scribe transcript is materialized, has passed
    scribe's `transcript_not_empty` check, and whose `session_transcripts` was never
    tried — the scribe→linguist trigger.

    Each run materializes `session_transcripts` (apply known corrections) then
    `session_episode_summary`, so a session is fully processed. A failed or canceled run is
    not retried here (re-execute it); a session whose `script.json` is gone is skipped."""
    return launch_ready(context, LINGUIST_STAGE)


def _linguist_config():
    from astra_ontology_config import load as load_config

    return load_config().linguist


def _to_json(value: object) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False)


defs = dg.Definitions(
    assets=[
        session_transcripts,
        session_episode_summary,
        campaign_timeline,
    ],
    sensors=[scribe_output_sensor],
    schedules=[campaign_timeline_schedule],
    jobs=[campaign_timeline_job],
    resources=default_resources(),
)
