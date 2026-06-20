"""Dagster wiring — the per-session partition + the linguist asset.

One partition per session/date. The asset reads scribe's `script.json`, runs the
pipeline, and writes the three outputs (`data/{date}.json`, the campaign-matched
`script/*.txt`, the canonical `transcripts/*.txt`) + `shibboleth.json`. The live
materialization runs once scribe has emitted a session.

NOTE: the plan models three assets (formatted/context/canonical); v1 ships one
`session_transcripts` asset producing all three files (downstream consumers read
files, not asset boundaries). Splitting is a refinement. Static audio is external
(F4); linguist just composes the URL.
"""

import json
from pathlib import Path

import dagster as dg
from astra_ontology import load_being
from astra_ontology_being import BEING_KDL_PATH

from .campaigns import campaign_filename, campaign_views, to_shibboleth
from .corrections import load_corrections
from .models import RawLine
from .pipeline import process_session
from .roster import SpeakerResolver
from .sensor import new_sessions

APP_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = APP_ROOT / "data"
SCRIPT_DIR = APP_ROOT / "script"
TRANSCRIPT_DIR = APP_ROOT / "transcripts"
SHIBBOLETH_PATH = APP_ROOT / "shibboleth.json"
STATIC_AUDIO_BASE = "https://static-audio.iridi.cc"  # external host (F4)

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
        f"{STATIC_AUDIO_BASE}/{date}/audio.mp3",
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

    return dg.MaterializeResult(
        metadata={"lines": len(artifacts.transcript.script), "campaign": matched_name}
    )


@dg.sensor(target=session_transcripts, minimum_interval_seconds=30)
def scribe_output_sensor(context: dg.SensorEvaluationContext) -> dg.SensorResult:
    """Register a linguist partition + run request for each scribe session
    (`{date}/script.json` under `ingest_saved_dir`) not yet processed — the scribe→linguist
    trigger, so corrections apply automatically once a session is transcribed."""
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


defs = dg.Definitions(assets=[session_transcripts], sensors=[scribe_output_sensor])
