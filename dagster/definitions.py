"""The astra Dagster code location — the Phase-3 asset graph lands here.

The full pipeline (one partition per session: scribe -> linguist -> akasha ->
mouthpiece) grows here per subsystem. First real member: akasha-backend's
corpus-snapshot asset (0007). The trivial Phase-0 smoke asset stays so the code
location is always non-empty/materializable.
"""

from typing import Any

import dagster as dg
from astra_akasha_backend.assets import akasha_corpus_snapshot
from astra_heartwood.assets import heartwood_sensor, session_wiki
from astra_linguist.assets import (
    campaign_timeline,
    campaign_timeline_job,
    campaign_timeline_schedule,
    correction_candidates,
    scribe_output_sensor,
    session_episode_summary,
    session_transcripts,
)
from astra_mouthpiece.assets import (
    episodes_index,
    linguist_output_sensor,
    session_audio_clips,
    session_brief,
    session_digest,
    session_episode,
    session_script,
)
from astra_observe import get_logger, init_telemetry
from astra_scribe.assets import (
    craig_drop_sensor,
    session_audio,
    session_cleanup,
    session_tracks,
    session_transcript,
)

# Telemetry from day one (CLAUDE.md): every process that loads this code location — the
# Dagster daemon and each run worker — installs the OTel providers here, so the pipeline's
# spans, metrics, and logs actually flow to SigNoz (without this, the assets' instrumentation
# is a no-op in the runtime). Idempotent; endpoint comes from config.kdl.
init_telemetry("astra.pipeline")


@dg.asset(group_name="smoke")
def hello_astra() -> str:
    """Trivial asset so the code location is non-empty and materializable."""
    return "astra pipeline online"


# Run-failure paging (0037 PIPE-2). Dagster reports step failures on its own `dagster`
# logger, which observe does not export, so a failed run used to leave no ERROR in SigNoz
# and the Class A rule "astra error/fatal logs" (severity ERROR/FATAL, grouped by
# service.name) never paged. This sensor logs exactly one ERROR per failed run on
# `astra.pipeline`: observe's OTLP handler sits on the `astra` namespace, and the code
# server's resource is service.name=astra.pipeline (the init_telemetry call above), so the
# record reaches SigNoz and the existing rule pages Discord.
#
# One page per failed run: Dagster's run-status cursor advances past each RUN_FAILURE event
# whether or not this function raises, and a sensor without a cursor starts at the newest
# event (no backfill of old failures on deploy). Step retries happen inside one run, so a
# retried-then-failed step still produces one RUN_FAILURE. The function must return None:
# returning a value makes the tick stop after the first failure it sees.
PIPELINE_LOG = get_logger("astra.pipeline")

#: Cap on each error string in the log body, so a long traceback-ish message stays readable.
ERROR_CHARS = 500


def _one_line(text: str | None) -> str:
    """Collapse whitespace and cap the length of an error message."""
    flat = " ".join((text or "").split())
    return flat if len(flat) <= ERROR_CHARS else flat[: ERROR_CHARS - 1] + "…"


def _user_error(error: Any) -> str:
    """The user's exception under Dagster's step wrappers, as one capped line.

    A step failure's error is a Dagster wrapper (``DagsterExecutionStepExecutionError``, or
    ``RetryRequestedFromPolicy`` once a RetryPolicy is exhausted) whose ``cause`` is the
    exception the asset raised. Exhausted retries keep their note: "X (Exceeded max_retries of 1)".
    """
    node, retry_note = error, ""
    while node.cause is not None and (
        (node.cls_name or "").startswith("Dagster") or node.cls_name == "RetryRequestedFromPolicy"
    ):
        if node.cls_name == "RetryRequestedFromPolicy":
            retry_note = f" ({_one_line(node.message)})"
        node = node.cause
    return _one_line(node.message) + retry_note


def _partition_of(run: dg.DagsterRun) -> str | None:
    """The run's partition key, or its partition range for a ranged backfill run."""
    tags = run.tags
    if key := tags.get("dagster/partition"):
        return key
    start = tags.get("dagster/asset_partition_range_start")
    end = tags.get("dagster/asset_partition_range_end")
    return f"{start}...{end}" if start and end else None


@dg.run_failure_sensor(
    description=(
        "Pages Discord (via the SigNoz rule 'astra error/fatal logs') once per failed run: "
        "logs one ERROR on astra.pipeline naming the job, run, partition, and failed steps."
    ),
    default_status=dg.DefaultSensorStatus.RUNNING,
)
def pipeline_failure_alert(context: dg.RunFailureSensorContext) -> None:
    """Log one ERROR record on ``astra.pipeline`` for the failed run in ``context``."""
    run = context.dagster_run
    failure = context.failure_event
    try:
        step_events = context.get_step_failure_events()
    except Exception:
        # The detail lookup is an event-log query; if it fails, still page with the
        # run-level message rather than losing the alert (the cursor advances regardless).
        step_events = []

    steps: list[str] = []
    step_errors: list[str] = []
    for event in step_events:
        step = event.step_key or "?"
        error = getattr(event.event_specific_data, "error", None)
        steps.append(step)
        step_errors.append(f"{step}: {_user_error(error) if error else _one_line(event.message)}")

    run_error = getattr(failure.event_specific_data, "error", None)
    reason = getattr(failure.event_specific_data, "failure_reason", None)
    error_text = (
        "; ".join(step_errors)
        if step_errors
        else (_user_error(run_error) if run_error else _one_line(failure.message))
    )
    partition = _partition_of(run)

    attributes: dict[str, str] = {
        "dagster.job_name": run.job_name,
        "dagster.run_id": run.run_id,
        "dagster.failed_steps": ",".join(steps),
        "dagster.error": error_text,
    }
    if partition:
        attributes["dagster.partition"] = partition
    if reason is not None:
        attributes["dagster.failure_reason"] = str(reason.value)

    PIPELINE_LOG.error(
        "Dagster run failed: job=%s run_id=%s partition=%s failed_steps=%s error=%s",
        run.job_name,
        run.run_id,
        partition or "-",
        ",".join(steps) or "-",
        error_text,
        extra=attributes,
    )


# The Phase-3 pipeline: scribe (audio→transcript) → linguist (processing) → akasha
# (corpus snapshot) → mouthpiece (digest → two-pass script → clips → episode). Each
# asset carries its DynamicPartitionsDefinition; the sensors chain it — craig zip →
# scribe, scribe's script.json → linguist, then linguist's transcript → mouthpiece.
defs = dg.Definitions(
    assets=[
        hello_astra,
        akasha_corpus_snapshot,
        session_tracks,
        session_audio,
        session_transcript,
        session_cleanup,
        session_transcripts,
        correction_candidates,
        session_episode_summary,
        campaign_timeline,
        session_digest,
        session_brief,
        session_script,
        session_audio_clips,
        session_episode,
        episodes_index,
        session_wiki,
    ],
    sensors=[
        craig_drop_sensor,
        scribe_output_sensor,
        linguist_output_sensor,
        heartwood_sensor,
        pipeline_failure_alert,
    ],
    schedules=[campaign_timeline_schedule],
    jobs=[campaign_timeline_job],
)
