"""Dagster wiring — the per-session partition + the linguist asset.

One partition per session/date. The asset reads scribe's `script.json`, runs the
pipeline, and writes the three outputs (`data/{date}.json`, the campaign-matched
`script/*.txt`, the canonical `transcripts/*.txt`) + `shibboleth.json`. The live
materialization runs once scribe has emitted a session.

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
from astra_lexicon import DEFS_PATH, build_lexicon, load_corrections
from astra_observe import get_logger, get_meter
from astra_ontology import load_being
from astra_ontology_being import BEING_KDL_PATH

from .campaigns import campaign_filename, campaign_views, to_shibboleth
from .chronicle import (
    EPISODES_DIR,
    SEASONS_PATH,
    TIMELINE_DIR,
    Chronicle,
    chronicle_inputs_hash,
    load_episode_entries,
)
from .models import RawLine
from .pipeline import process_session
from .roster import SpeakerResolver
from .sensor import new_sessions
from .surface.surface import load_session, surface_session_payload, write_candidates

_log = get_logger("astra.linguist")
_meter = get_meter("astra.linguist")
_sessions_counter = _meter.create_counter(
    "astra.linguist.sessions", description="sessions ingested"
)
_candidates_counter = _meter.create_counter(
    "astra.linguist.candidates", description="surfaced correction candidates"
)
_episodes_counter = _meter.create_counter(
    "astra.chronicle.episodes", description="chronicle episode summaries generated"
)

APP_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = APP_ROOT / "data"
SCRIPT_DIR = APP_ROOT / "script"
TRANSCRIPT_DIR = APP_ROOT / "transcripts"
SHIBBOLETH_PATH = APP_ROOT / "shibboleth.json"
# Same-origin base: akasha-frontend serves the combined recording at /audio/<date>.mp3
# off its audio volume (akasha also build-time-normalizes, so the form is belt-and-
# suspenders). Replaces the old absolute faerrin static-audio.iridi.cc host.
AUDIO_BASE = "/audio"

SESSIONS_NAME = "linguist_sessions"
linguist_sessions = dg.DynamicPartitionsDefinition(name=SESSIONS_NAME)


@dg.asset(partitions_def=linguist_sessions, group_name="linguist")
def session_transcripts(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Process one session: scribe script.json → formatted + context + canonical."""
    date = context.partition_key
    cfg = _linguist_config()
    being = load_being(BEING_KDL_PATH)

    raw_path = Path(cfg.ingest_saved_dir) / date / "script.json"
    raw = [RawLine(**line) for line in json.loads(raw_path.read_text(encoding="utf-8"))]

    artifacts = process_session(
        date,
        f"{AUDIO_BASE}/{date}.mp3",
        raw,
        replace=load_corrections(),
        resolver=SpeakerResolver.from_being(BEING_KDL_PATH),
        campaigns=campaign_views(being),
    )

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _atomic_write(DATA_DIR / f"{date}.json", _to_json(artifacts.transcript.model_dump()))
    _atomic_write(SHIBBOLETH_PATH, _to_json(to_shibboleth(campaign_views(being))))

    matched_name = "unmatched"
    if artifacts.matched is not None and artifacts.context is not None:
        stem = campaign_filename(artifacts.matched)
        matched_name = stem
        SCRIPT_DIR.mkdir(parents=True, exist_ok=True)
        TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)
        _atomic_write(SCRIPT_DIR / f"{stem}.{date}.txt", artifacts.context)
        if artifacts.canonical is not None:
            _atomic_write(TRANSCRIPT_DIR / f"{stem}.{date}.txt", artifacts.canonical)

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


@dg.asset(partitions_def=linguist_sessions, deps=[session_transcripts], group_name="linguist")
def correction_candidates(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Surface NEW correction candidates for a session: the Phase-1 phonetic filter + the
    compiled dspy judge → a reviewable `{date}.candidates.json` (triage with `review_tui
    --candidates`, then `apply.py` appends the accepted ones to `defs.yaml`).

    Runs automatically after `session_transcripts` (it reads that asset's `data/{date}.json`).
    **Live** — spends LLM tokens per session (GLM 5.2 judge; the borderline-escalation
    tier is inert while judge == escalate); the judge is skipped when nothing is flagged.
    *Discovery* is automatic; *applying* accepted corrections to `defs.yaml` stays a
    human-gated CLI step (we never auto-edit the SSOT)."""
    from .surface.judge import make_dspy_complete_fn  # lazy: pulls dspy + resolves the key

    date = context.partition_key
    transcript = load_session(DATA_DIR / f"{date}.json")
    lex = build_lexicon(DEFS_PATH)
    payload = surface_session_payload(
        transcript, lex, complete_fn=make_dspy_complete_fn(), date=date
    )
    write_candidates(payload, DATA_DIR / f"{date}.candidates.json")
    for verdict, n in payload["counts"].items():
        _candidates_counter.add(n, {"verdict": verdict})
    _log.info(
        "linguist surfaced %d candidate(s) for %s: flagged=%d %s",
        sum(payload["counts"].values()),
        date,
        payload["flagged_spans"],
        payload["counts"],
    )
    return dg.MaterializeResult(
        metadata={
            "flagged": payload["flagged_spans"],
            **{k: v for k, v in payload["counts"].items()},
        }
    )


@dg.asset(
    partitions_def=linguist_sessions,
    deps=[session_transcripts],
    group_name="chronicle",
)
def session_episode_summary(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Summarize one session into a Rich chronicle `EpisodeEntry` (NLSpec 0019).

    Runs automatically after `session_transcripts` (it reads that asset's
    `data/{date}.json`) and writes `timeline/episodes/{date}.json`. **Live** — spends
    GLM-5.2 tokens per session via `astra_llm` (`call_structured`); the cost is
    auto-traced (`astra.llm.cost_usd`)."""
    from .chronicle import show_for_date
    from .chronicle_llm import build_episode_entry  # lazy: pulls astra_llm/litellm

    date = context.partition_key
    if show_for_date(date) is None:
        # Not one of the chronicle shows (unmatched/excluded) — no episode summary.
        _log.info("chronicle skipping %s: not a chronicle show", date)
        return dg.MaterializeResult(metadata={"status": "skipped (unmatched)"})

    transcript = load_session(DATA_DIR / f"{date}.json")
    entry = build_episode_entry(date, transcript)
    EPISODES_DIR.mkdir(parents=True, exist_ok=True)
    _atomic_write(EPISODES_DIR / f"{date}.json", entry.model_dump_json(indent=2))
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
def campaign_timeline(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Group every episode summary into the Show → Season → Episode `Chronicle`.

    Reads all `timeline/episodes/*.json`, groups by show, orders shows main-first then
    by first-session date, and (per show) calls GLM-5.2 to assign contiguous seasons,
    writing `timeline/seasons.json`. **Skips the GLM calls when the episode inputs are
    unchanged** (C9) so the linguist-commit timer / schedule is a no-op until a new
    summary lands."""
    entries = load_episode_entries(EPISODES_DIR)
    if not entries:
        return dg.MaterializeResult(metadata={"shows": 0, "status": "no episodes yet"})

    new_hash = chronicle_inputs_hash(entries)
    if SEASONS_PATH.exists():
        existing = Chronicle.model_validate_json(SEASONS_PATH.read_text(encoding="utf-8"))
        if existing.inputs_hash == new_hash:
            _log.info("chronicle seasons unchanged (%d episodes) — skipping", len(entries))
            return dg.MaterializeResult(
                metadata={"shows": len(existing.shows), "status": "unchanged"}
            )

    from .chronicle_llm import build_chronicle  # lazy: pulls astra_llm/litellm

    chronicle = build_chronicle(entries)
    chronicle.inputs_hash = new_hash
    TIMELINE_DIR.mkdir(parents=True, exist_ok=True)
    _atomic_write(SEASONS_PATH, chronicle.model_dump_json(indent=2))
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
def campaign_timeline_schedule(
    context: dg.ScheduleEvaluationContext,
) -> dg.RunRequest:
    """Hourly regen of the chronicle seasons (a no-op until a new episode summary lands)."""
    return dg.RunRequest()


# Safe to run by default: the scribe `saved/` dir it scans is seed-free by construction —
# the migrated-at-rest history was loaded straight into linguist's transcript dir, never
# through scribe, so `saved/` only ever holds craig-produced sessions. (A session appears
# here only once scribe writes its `script.json`, so a mid-transcription session won't fire
# prematurely.) The downstream linguist→mouthpiece sweep is what needed adoption, not this.
@dg.sensor(
    target=[session_transcripts, correction_candidates, session_episode_summary],
    minimum_interval_seconds=30,
    default_status=dg.DefaultSensorStatus.RUNNING,
)
def scribe_output_sensor(context: dg.SensorEvaluationContext) -> dg.SensorResult:
    """Register a linguist partition + run request for each scribe session
    (`{date}/script.json` under `ingest_saved_dir`) not yet processed — the scribe→linguist
    trigger. Each run materializes `session_transcripts` (apply known corrections) then
    `correction_candidates` (surface new ones for review), so a session is fully processed."""
    saved = _linguist_config().ingest_saved_dir
    if not saved or not Path(saved).is_dir():
        return dg.SensorResult()
    existing = set(context.instance.get_dynamic_partitions(SESSIONS_NAME))
    found = new_sessions(saved, existing)
    adds = [linguist_sessions.build_add_request(found)] if found else []
    return dg.SensorResult(
        run_requests=[dg.RunRequest(partition_key=key) for key in found],
        dynamic_partitions_requests=adds,
    )


def _linguist_config():
    from astra_ontology_config import load as load_config

    return load_config().linguist


def _to_json(value: object) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False)


def _atomic_write(path: Path, text: str) -> None:
    """Write `.tmp`→rename so an output only appears whole (a partition = done)."""
    import os

    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


defs = dg.Definitions(
    assets=[
        session_transcripts,
        correction_candidates,
        session_episode_summary,
        campaign_timeline,
    ],
    sensors=[scribe_output_sensor],
    schedules=[campaign_timeline_schedule],
    jobs=[campaign_timeline_job],
)
