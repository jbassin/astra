"""Dagster wiring for heartwood (0036): ``session_wiki`` on the shared ``sessions``
partitions, after linguist's ``session_transcripts``, and the sensor that launches it for
each faerrin session.

``session_wiki`` does not run the agent (the dagster-code image has no node, git, push key
or docker). It files ``<requests-path>/<date>.request.json`` and waits for the
host ``heartwood-request`` unit to run ``just heartwood-agent <date>`` and write the
result (``requests.py``). A failed result logs ERROR on ``astra.heartwood`` — the SigNoz
Class A rule pages Discord — and fails the run without retry: a paid 15–55 min agent run
must never repeat on its own. Mouthpiece runs in parallel and does not wait.
"""

import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import dagster as dg
from astra_linguist.assets import session_transcripts
from astra_linguist.chronicle import TRANSCRIPT_DIR
from astra_observe import get_logger, get_meter, get_tracer
from astra_pipeline_resources import AstraConfig, PipelinePaths, default_resources
from astra_pipeline_resources.partitions import SessionStage, launch_ready, sessions

from . import requests as rq
from .agent.sessions import faerrin_session

#: Run tag capped at 1 concurrent run in dagster/dagster.yaml: a waiting
#: session_wiki holds a run slot, so two of them must never starve the pipeline.
CONCURRENCY_TAG = {"astra/heartwood": "session_wiki"}
POLL_SECONDS = 30

_log = get_logger("astra.heartwood")
_meter = get_meter("astra.heartwood")
_tracer = get_tracer("astra.heartwood")
_runs = _meter.create_counter(
    "astra.heartwood.session_wiki.runs", description="session_wiki outcomes"
)


class WikiFailure(Exception):
    """A non-published outcome or a timeout; the message is the page text."""


def wait_for_result(
    root: Path,
    date: str,
    request_id: str,
    *,
    timeout_s: float,
    poll_s: float = POLL_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> rq.Result | None:
    """Poll for this request's result; None after ``timeout_s``."""
    deadline = clock() + timeout_s
    while True:
        result = rq.read_result(root, date, request_id)
        if result is not None:
            return result
        if clock() >= deadline:
            return None
        sleep(poll_s)


def run_session_wiki(
    date: str,
    *,
    root: Path,
    timeout_min: int,
    dagster_run_id: str | None = None,
    wait: Callable[..., rq.Result | None] = wait_for_result,
) -> dict[str, Any]:
    """File the request, wait, and return materialization metadata — or raise WikiFailure."""
    req = rq.file_request(root, date, dagster_run_id=dagster_run_id)
    with _tracer.start_as_current_span("heartwood.session_wiki") as span:
        span.set_attribute("heartwood.date", date)
        span.set_attribute("heartwood.request_id", req.request_id)
        result = wait(root, date, req.request_id, timeout_s=timeout_min * 60)
        if result is None:
            _runs.add(1, {"outcome": "timeout"})
            msg = (
                f"heartwood {date}: no result in {timeout_min} min — is heartwood-request.path "
                f"active? The request is still pending at {rq.request_path(root, date)} and "
                "WILL run when the host picks it up"
            )
            _log.error(msg)
            span.set_attribute("heartwood.outcome", "timeout")
            raise WikiFailure(msg)
        for key, value in (
            ("outcome", result.outcome),
            ("exit_code", result.exit_code),
            ("cost_usd", result.cost_usd),
            ("run_id", result.run_id),
            ("commit", result.commit),
        ):
            if value is not None:
                span.set_attribute(f"heartwood.{key}", value)
        _runs.add(1, {"outcome": result.outcome})
        if result.outcome == "failed":
            msg = (
                f"heartwood {date} failed: exit {result.exit_code} ({result.meaning}) — "
                f"{rq.next_step(result.exit_code, date)} — log {result.log}"
            )
            _log.error(msg)
            raise WikiFailure(msg)
        if result.outcome == "already-published":
            _log.warning("heartwood %s was already published — nothing ran", date)
        else:
            _log.info("heartwood %s published (%s, $%s)", date, result.commit, result.cost_usd)
    meta: dict[str, Any] = {
        "outcome": result.outcome,
        "exit_code": result.exit_code,
        "request_id": result.request_id,
    }
    for key in ("cost_usd", "run_id", "commit", "status"):
        value = getattr(result, key)
        if value is not None:
            meta[key] = value
    for key, value in (result.counts or {}).items():
        if isinstance(value, int | float):
            meta[f"count_{key}"] = value
    return meta


@dg.asset(partitions_def=sessions, deps=[session_transcripts], group_name="heartwood")
def session_wiki(
    context: dg.AssetExecutionContext, astra_config: AstraConfig, pipeline_paths: PipelinePaths
) -> dg.MaterializeResult:
    """Request a heartwood run for this session from the host and wait for it.

    NO retry policy: the agent is a paid 15–55 min run."""
    try:
        meta = run_session_wiki(
            context.partition_key,
            root=Path(pipeline_paths.heartwood_requests),
            timeout_min=astra_config.get().heartwood.request_timeout_minutes,
            dagster_run_id=context.run_id,
        )
    except WikiFailure as exc:
        raise dg.Failure(description=str(exc), allow_retries=False) from exc
    return dg.MaterializeResult(metadata=meta)


def is_faerrin(date: str, transcript_dir: Path | None = None) -> bool:
    """True when this session's canonical transcript is a faerrin-world campaign."""
    transcript_dir = transcript_dir if transcript_dir is not None else TRANSCRIPT_DIR
    return faerrin_session(date, transcript_dir=transcript_dir) is not None


#: What `heartwood_sensor` launches, and when (``dagster/migrate_sessions.py`` reads it).
HEARTWOOD_STAGE = SessionStage(
    upstream=session_transcripts.key, stage=session_wiki.key, keep=is_faerrin
)


@dg.sensor(
    target=[session_wiki],
    minimum_interval_seconds=30,
    default_status=dg.DefaultSensorStatus.RUNNING,
)
def heartwood_sensor(context: dg.SensorEvaluationContext) -> dg.SensorResult:
    """Run ``session_wiki`` for each faerrin session whose ``session_transcripts`` is
    materialized and whose wiki was never tried.

    A linguist rewrite of a session that already has a wiki run never re-triggers, and a
    failed or canceled run is not retried (re-execute it). The sessions the old sensor
    adopted without running are marked materialized by the sessions migration (the
    paid-replay guard).
    The ledger is never read here: it lives in the astra-data clone, which the Dagster
    containers do not mount, and the host runner owns the published check."""
    return launch_ready(context, HEARTWOOD_STAGE, tags=CONCURRENCY_TAG)


defs = dg.Definitions(
    assets=[session_wiki], sensors=[heartwood_sensor], resources=default_resources()
)
