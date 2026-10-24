"""Unit checks for the OTel shim. Nothing here reaches a collector.

Assertions read exported data from in-memory exporters (``astra_observe.testing``); the
end-to-end "a span lands in SigNoz" check is the substrate smoke.
"""

from __future__ import annotations

import logging
import os
import signal
import warnings
from collections.abc import Iterator

import astra_observe
import pytest
from astra_config import find_repo_root
from astra_observe.testing import Captured, capture, reset_globals
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

CHECKOUT = find_repo_root()


@pytest.fixture
def outside_pytest(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make observe believe it is not under pytest, from this checkout (a dev tree)."""
    monkeypatch.delenv("PYTEST_VERSION")
    monkeypatch.delenv(astra_observe.RUNTIME_VAR, raising=False)
    monkeypatch.setenv(astra_observe.DEPLOY_ROOT_VAR, "/nonexistent/astra-deploy")


@pytest.fixture
def exporting(
    outside_pytest: None, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[InMemorySpanExporter, InMemoryLogRecordExporter, list[str]]]:
    """The real ``init_telemetry`` path (batching processors) with in-memory exporters."""
    spans, logs, endpoints = InMemorySpanExporter(), InMemoryLogRecordExporter(), []

    def fake_otlp(endpoint: str):
        endpoints.append(endpoint)
        return spans, InMemoryMetricReader(), logs

    monkeypatch.setattr(astra_observe, "_otlp_exporters", fake_otlp)
    yield spans, logs, endpoints
    astra_observe._teardown()
    reset_globals()


# ── where a process exports, and how it labels itself ──


def test_environment_is_test_under_pytest() -> None:
    assert astra_observe.deployment_environment() == "test"


def test_host_run_from_a_dev_tree(outside_pytest: None) -> None:
    attrs = astra_observe.telemetry_resource("astra.assay").attributes
    assert attrs["service.name"] == "astra.assay"
    assert attrs["deployment.environment"] == "development"
    assert astra_observe.otlp_endpoint() == "http://localhost:10353"  # host-otlp-endpoint


def test_host_run_from_the_deploy_checkout(
    outside_pytest: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(astra_observe.DEPLOY_ROOT_VAR, str(CHECKOUT))
    attrs = astra_observe.telemetry_resource("astra.heartwood").attributes
    assert attrs["deployment.environment"] == "production"
    assert astra_observe.otlp_endpoint() == "http://localhost:10353"


def test_container_run(outside_pytest: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(astra_observe.RUNTIME_VAR, "container")
    attrs = astra_observe.telemetry_resource("astra.pipeline").attributes
    assert attrs["service.name"] == "astra.pipeline"
    assert attrs["deployment.environment"] == "production"
    assert astra_observe.otlp_endpoint() == "http://signoz-otel-collector:4318"


def test_unknown_runtime_marker_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(astra_observe.RUNTIME_VAR, "contianer")
    with pytest.raises(ValueError, match="ASTRA_RUNTIME"):
        astra_observe.in_container()


def test_init_under_pytest_installs_nothing() -> None:
    astra_observe.init_telemetry("astra.test")
    assert astra_observe._state is None  # so no test run reaches the live collector


# ── init_telemetry and run() ──


def test_init_exports_to_the_runtime_endpoint_and_is_idempotent(
    exporting, caplog: pytest.LogCaptureFixture
) -> None:
    spans, _, endpoints = exporting
    astra_observe.init_telemetry("astra.first")
    astra_observe.init_telemetry("astra.second")  # ignored, loudly
    assert endpoints == ["http://localhost:10353"]
    assert "already runs as 'astra.first'" in caplog.text
    with astra_observe.get_tracer("t").start_as_current_span("unit-span"):
        pass
    astra_observe.shutdown()
    (span,) = spans.get_finished_spans()
    assert span.resource.attributes["service.name"] == "astra.first"
    assert span.resource.attributes["deployment.environment"] == "development"


def test_run_flushes_on_an_exception(exporting) -> None:
    spans, logs, _ = exporting
    with pytest.raises(RuntimeError), astra_observe.run("astra.cli"):
        with astra_observe.get_tracer("t").start_as_current_span("work"):
            astra_observe.get_logger("astra.cli").info("about to fail")
        raise RuntimeError("boom")
    assert astra_observe._state is None
    assert [s.name for s in spans.get_finished_spans()] == ["work"]
    assert [str(r.log_record.body) for r in logs.get_finished_logs()] == ["about to fail"]


def test_run_turns_sigterm_into_a_flushing_exit(exporting) -> None:
    spans, _, _ = exporting
    before = signal.getsignal(signal.SIGTERM)
    with pytest.raises(SystemExit) as exit_info, astra_observe.run("astra.cli"):
        with astra_observe.get_tracer("t").start_as_current_span("interrupted"):
            pass
        os.kill(os.getpid(), signal.SIGTERM)
        signal.pause()  # the handler raises before this returns
    assert exit_info.value.code == 128 + signal.SIGTERM
    assert [s.name for s in spans.get_finished_spans()] == ["interrupted"]
    assert signal.getsignal(signal.SIGTERM) == before  # restored


# ── the in-memory capture ──


def test_capture_records_all_three_signals(telemetry_capture: Captured) -> None:
    # A module-scope-style instrument created before use, like an app's `instruments()`.
    counter = astra_observe.get_meter("astra.test").create_counter("astra.test.calls")
    with astra_observe.get_tracer("astra.test").start_as_current_span("unit-span") as span:
        span.set_attribute("astra.lane", "py")
        counter.add(2, {"kind": "a"})
        counter.add(1, {"kind": "b"})
        astra_observe.get_logger("astra.test").info("hello")
    logging.getLogger("thirdparty").info("not exported")  # outside the astra namespace

    assert telemetry_capture.span("unit-span").attributes == {"astra.lane": "py"}
    assert telemetry_capture.metric_sum("astra.test.calls") == 3
    assert telemetry_capture.metric_sum("astra.test.calls", kind="a") == 2
    (record,) = telemetry_capture.logs()
    assert str(record.log_record.body) == "hello"
    assert record.resource.attributes["deployment.environment"] == "test"


def test_capture_makes_init_a_noop_and_shutdown_a_flush() -> None:
    with capture("astra.pipeline") as captured:
        astra_observe.init_telemetry("astra.pipeline")  # e.g. definitions.py at import
        astra_observe.get_logger("astra.pipeline").error("page me")
        astra_observe.shutdown()
        assert astra_observe._state is not None  # still capturing
    assert astra_observe._state is None
    (record,) = captured.logs()
    assert record.log_record.severity_text == "ERROR"
    assert record.resource.attributes["service.name"] == "astra.pipeline"


def test_captures_do_not_leak_into_each_other() -> None:
    with capture() as first:
        astra_observe.get_meter("astra.test").create_counter("astra.test.n").add(1)
        with astra_observe.get_tracer("astra.test").start_as_current_span("one"):
            pass
    with capture() as second:
        astra_observe.get_meter("astra.test").create_counter("astra.test.n").add(5)
        with astra_observe.get_tracer("astra.test").start_as_current_span("two"):
            pass
    assert [s.name for s in first.spans()] == ["one"]
    assert [s.name for s in second.spans()] == ["two"]
    assert first.metric_sum("astra.test.n") == 1  # readable after the block
    assert second.metric_sum("astra.test.n") == 5


def test_log_records_keep_extras_code_and_exception_attributes(
    telemetry_capture: Captured,
) -> None:
    log = astra_observe.get_logger("astra.test")
    try:
        int("boom")
    except ValueError:
        log.exception("failed", extra={"astra.run_id": "r1"})
    (record,) = telemetry_capture.logs()
    attributes = record.log_record.attributes or {}
    assert attributes["astra.run_id"] == "r1"
    assert attributes["exception.type"] == "ValueError"
    assert attributes["code.function.name"] == (
        "test_log_records_keep_extras_code_and_exception_attributes"
    )


def test_installing_the_logs_handler_raises_no_deprecation_warning() -> None:
    with warnings.catch_warnings():
        warnings.simplefilter("error", DeprecationWarning)
        with capture():
            pass


def test_logs_handler_is_detached_after_teardown() -> None:
    from opentelemetry.instrumentation.logging.handler import LoggingHandler

    astra_log = logging.getLogger(astra_observe.LOG_NAMESPACE)
    with capture():
        assert any(isinstance(h, LoggingHandler) for h in astra_log.handlers)
    assert not any(isinstance(h, LoggingHandler) for h in astra_log.handlers)


def test_report_ignored_counts_by_site(telemetry_capture: Captured) -> None:
    astra_observe.report_ignored("test.cleanup", OSError("already closed"))
    astra_observe.report_ignored("test.cleanup", ValueError("bad"))
    astra_observe.report_ignored("test.other", ValueError("bad"))
    metric = astra_observe.IGNORED_ERRORS_METRIC
    assert telemetry_capture.metric_sum(metric, site="test.cleanup") == 2
    assert telemetry_capture.metric_sum(metric, site="test.other") == 1
    # DEBUG stays local: the `astra` namespace exports from INFO.
    assert telemetry_capture.logs() == []


def test_report_ignored_logs_at_debug(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.DEBUG, logger="astra.observe"):
        astra_observe.report_ignored("test.cleanup", OSError("already closed"))
    (record,) = caplog.records
    assert record.levelno == logging.DEBUG
    assert record.getMessage() == "ignored error at test.cleanup: already closed"
