"""The run-failure paging sensor (0037 PIPE-2): one ERROR on ``astra.pipeline`` per failed run.

Telemetry stays network-free: the ``exported`` fixture (``conftest.py``) runs the real
``init_telemetry`` wiring with its OTLP exporters swapped for in-memory ones. Nothing here may
reach the live collector, because an ERROR record in SigNoz pages Discord.
"""

import logging
from types import ModuleType

import astra_observe
import dagster as dg
import pytest
from opentelemetry.sdk._logs import ReadableLogRecord
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter

SENSOR = "pipeline_failure_alert"
PARTITION = "2026-10-19"


@dg.asset(
    partitions_def=dg.StaticPartitionsDefinition([PARTITION]),
    retry_policy=dg.RetryPolicy(max_retries=1),
)
def doomed_step() -> None:
    raise RuntimeError("GLM returned an empty script")


def _alerts(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.name == "astra.pipeline"]


def _exported_alerts(exporter: InMemoryLogRecordExporter) -> list[ReadableLogRecord]:
    return [
        r
        for r in exporter.get_finished_logs()
        if str(r.log_record.body).startswith("Dagster run failed")
    ]


def _ticker(module: ModuleType, instance: dg.DagsterInstance):
    sensor = module.defs.get_sensor_def(SENSOR)

    def tick(cursor: str | None) -> str | None:
        context = dg.build_sensor_context(instance=instance, cursor=cursor)
        return sensor.evaluate_tick(context).cursor

    return tick


def test_sensor_is_registered_and_on_by_default(definitions: ModuleType) -> None:
    sensor = definitions.defs.get_sensor_def(SENSOR)
    assert isinstance(sensor, dg.RunStatusSensorDefinition)
    assert sensor.default_status == dg.DefaultSensorStatus.RUNNING


def test_one_error_per_failed_run_across_ticks(
    definitions: ModuleType,
    exported: InMemoryLogRecordExporter,
    caplog: pytest.LogCaptureFixture,
) -> None:
    instance = dg.DagsterInstance.ephemeral()
    tick = _ticker(definitions, instance)
    cursor = tick(None)  # the first tick only initializes the cursor (no backfill of history)
    assert _alerts(caplog) == []

    result = dg.materialize(
        [doomed_step], partition_key=PARTITION, instance=instance, raise_on_error=False
    )
    assert not result.success

    cursor = tick(cursor)  # sees the failure: one ERROR
    tick(cursor)  # the cursor moved past it: no second ERROR

    alerts = _alerts(caplog)
    assert len(alerts) == 1, [r.getMessage() for r in alerts]
    record = alerts[0]
    assert record.levelno == logging.ERROR
    fields = vars(record)
    assert fields["dagster.run_id"] == result.run_id
    assert fields["dagster.job_name"] == result.dagster_run.job_name
    assert fields["dagster.partition"] == PARTITION
    assert fields["dagster.failed_steps"] == "doomed_step"  # retried once, still one step
    assert fields["dagster.error"] == (
        "doomed_step: RuntimeError: GLM returned an empty script (Exceeded max_retries of 1)"
    )
    message = record.getMessage()
    for part in (result.run_id, PARTITION, "doomed_step", "GLM returned an empty script"):
        assert part in message

    # The same record leaves through observe's OTel pipeline with the attributes the
    # SigNoz rule needs: severity ERROR on service.name astra.pipeline.
    astra_observe.shutdown()  # flush the batch processor
    (otel,) = _exported_alerts(exported)
    assert otel.log_record.severity_text == "ERROR"
    assert otel.resource.attributes["service.name"] == "astra.pipeline"
    attributes = dict(otel.log_record.attributes or {})
    assert attributes["dagster.run_id"] == result.run_id
    assert attributes["dagster.partition"] == PARTITION
    assert attributes["dagster.failed_steps"] == "doomed_step"


@dg.asset
def chained_step() -> None:
    try:
        raise OSError("socket closed")  # noqa: TRY301 -- builds a chained exception on purpose
    except OSError as e:
        raise ValueError("TTS upload failed") from e


def test_plain_step_failure_names_the_user_exception(
    definitions: ModuleType, caplog: pytest.LogCaptureFixture
) -> None:
    # Without a RetryPolicy the step error is DagsterExecutionStepExecutionError wrapping the
    # asset's exception; the page names the asset's exception, not the wrapper. No partition.
    instance = dg.DagsterInstance.ephemeral()
    tick = _ticker(definitions, instance)
    cursor = tick(None)
    dg.materialize([chained_step], instance=instance, raise_on_error=False)
    tick(cursor)

    (record,) = _alerts(caplog)
    fields = vars(record)
    assert fields["dagster.error"] == "chained_step: ValueError: TTS upload failed"
    assert "dagster.partition" not in fields
    assert "partition=- " in record.getMessage()


def test_run_level_failure_without_steps_still_pages(
    definitions: ModuleType, caplog: pytest.LogCaptureFixture
) -> None:
    # A run that dies outside any step (worker restart, start timeout) has no STEP_FAILURE
    # events; the page falls back to the run failure message.
    instance = dg.DagsterInstance.ephemeral()
    tick = _ticker(definitions, instance)
    cursor = tick(None)

    run = instance.add_run(
        dg.DagsterRun(job_name="session_script_job", tags={"dagster/partition": "2026-10-12"})
    )
    instance.report_run_failed(run, message="Run worker restarted mid-run")
    tick(cursor)

    (record,) = _alerts(caplog)
    fields = vars(record)
    assert fields["dagster.run_id"] == run.run_id
    assert fields["dagster.job_name"] == "session_script_job"
    assert fields["dagster.partition"] == "2026-10-12"
    assert fields["dagster.failed_steps"] == ""
    assert fields["dagster.error"] == "Run worker restarted mid-run"
