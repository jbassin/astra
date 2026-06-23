"""Dagster wiring — the per-session partition, the Craig-drop sensor, the asset.

One partition per session/date (a `DynamicPartitionsDefinition`); a sensor
registers a partition + run request for each new Craig zip (Dagster's
materialization state replaces faerrin's disk ledger, N7). The asset runs the
session orchestration (session.py). The live materialization is deferred (G1) —
it needs a real zip + the Groq key; this layer is import- + sensor-unit-tested.

NOTE: the plan models `session_audio` + `session_transcript` as two assets; v1
ships one `session_outputs` asset (both files share one extraction). Splitting
them is a refinement to do alongside the deferred live run.
"""

import tempfile
from pathlib import Path

# No `from __future__ import annotations` here: Dagster introspects the `context`
# annotation at definition time and needs the real type, not a string.
import dagster as dg
from astra_observe import get_logger, get_meter
from astra_ontology_being import BEING_KDL_PATH
from astra_ontology_config import load as load_config

from .ingest import session_id
from .roster import Roster
from .sensor import new_sessions
from .session import process_session
from .transcribe import TrackTranscriber

#: One partition per session/date; the sensor adds keys as zips land.
SESSIONS_NAME = "scribe_sessions"
scribe_sessions = dg.DynamicPartitionsDefinition(name=SESSIONS_NAME)

_log = get_logger("astra.scribe")
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


@dg.asset(partitions_def=scribe_sessions, group_name="scribe")
def session_outputs(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Materialize one session: zip → audio.mp3 + script.json (Groq transcription)."""
    date_key = context.partition_key
    cfg = load_config().scribe
    roster = Roster.from_being(BEING_KDL_PATH)
    api_key = cfg.groq_api_key.resolve() if cfg.groq_api_key else None
    # Model from config (config-single-source) — not the TrackTranscriber constant default.
    transcriber = TrackTranscriber(api_key=api_key, model=cfg.model)

    zip_path = _find_zip(cfg.incoming_path, date_key)
    with tempfile.TemporaryDirectory() as work:
        counts = process_session(
            zip_path,
            out_dir=Path(cfg.data_path) / "saved" / date_key,
            work_dir=work,
            roster=roster,
            transcriber=transcriber,
        )
    _sessions_counter.add(1)
    _log.info("scribe transcribed session %s: %s", date_key, counts)
    return dg.MaterializeResult(metadata={k: v for k, v in counts.items()})


@dg.sensor(
    target=session_outputs,
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


defs = dg.Definitions(assets=[session_outputs], sensors=[craig_drop_sensor])
