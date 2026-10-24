"""In-memory telemetry for tests: assert on spans, metrics and logs without a collector.

``capture(service_name)`` installs observe's real global providers with in-memory exporters
and synchronous processors, so code under test that calls ``get_tracer`` / ``get_meter`` /
``logging.getLogger("astra.<sub>")`` is recorded. While it is active, ``init_telemetry`` is a
no-op and ``shutdown()`` only flushes. On exit it tears down and resets the OTel globals, so
the next test starts with no provider.

The pytest fixture ``telemetry_capture`` (registered by the repo-root ``conftest.py`` through
``astra_observe.pytest_plugin``) wraps one test in ``capture("astra.test")``.

Caveat: a tracer or instrument bound to an earlier provider stays bound to it (OTel caches the
real tracer behind a proxy on first use). Code that fetches its tracer or instruments at call
time — the repo's ``tracer()`` / ``instruments()`` seams — is always captured; a module-scope
tracer is captured only in the first capture that uses it.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

from opentelemetry import trace
from opentelemetry._logs import _internal as logs_internal
from opentelemetry.metrics import _internal as metrics_internal
from opentelemetry.sdk._logs import ReadableLogRecord
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.util._once import Once

import astra_observe


@dataclass
class Captured:
    """What one ``capture`` recorded. Read it at any point inside or after the block."""

    resource: Resource
    span_exporter: InMemorySpanExporter
    metric_reader: InMemoryMetricReader
    log_exporter: InMemoryLogRecordExporter
    #: The last metric collection, taken as the capture closes (the reader is shut down then).
    final_metrics: Any = field(default=None, repr=False)

    def spans(self) -> list[ReadableSpan]:
        """Finished spans, oldest first."""
        return list(self.span_exporter.get_finished_spans())

    def span(self, name: str) -> ReadableSpan:
        """The one finished span called ``name`` (fails when there are none or several)."""
        (match,) = [s for s in self.spans() if s.name == name]
        return match

    def logs(self) -> list[ReadableLogRecord]:
        """Exported log records from the ``astra`` logger namespace, oldest first."""
        return list(self.log_exporter.get_finished_logs())

    def metric_points(self, name: str) -> list[Any]:
        """The current (cumulative) data points of metric ``name``; empty if never recorded."""
        data = self.final_metrics or self.metric_reader.get_metrics_data()
        if data is None:
            return []
        return [
            point
            for resource_metrics in data.resource_metrics
            for scope_metrics in resource_metrics.scope_metrics
            for metric in scope_metrics.metrics
            if metric.name == name
            for point in metric.data.data_points
        ]

    def metric_sum(self, name: str, **attributes: Any) -> float:
        """The total of counter ``name`` over the points whose attributes include ``attributes``."""
        return sum(
            point.value
            for point in self.metric_points(name)
            if all((point.attributes or {}).get(k) == v for k, v in attributes.items())
        )


def reset_globals() -> None:
    """Forget the installed OTel tracer, meter and logger providers (test-only).

    The OTel API lets a process set each provider once; this resets that guard the same way
    the OTel project's own test utilities do. It touches private API, so it lives here.
    """
    trace._TRACER_PROVIDER_SET_ONCE = Once()  # noqa: SLF001 -- see the docstring
    trace._TRACER_PROVIDER = None  # noqa: SLF001
    metrics_internal._METER_PROVIDER_SET_ONCE = Once()  # noqa: SLF001
    metrics_internal._METER_PROVIDER = None  # noqa: SLF001
    metrics_internal._PROXY_METER_PROVIDER = metrics_internal._ProxyMeterProvider()  # noqa: SLF001
    logs_internal._LOGGER_PROVIDER_SET_ONCE = Once()  # noqa: SLF001
    logs_internal._LOGGER_PROVIDER = None  # noqa: SLF001
    logs_internal._PROXY_LOGGER_PROVIDER = logs_internal.ProxyLoggerProvider()  # noqa: SLF001


@contextmanager
def capture(service_name: str = "astra.test") -> Iterator[Captured]:
    """Record every span, metric and ``astra.*`` log of the block in memory."""
    astra_observe._teardown()  # noqa: SLF001 -- start from no provider, ours is the one installed
    reset_globals()
    captured = Captured(
        resource=astra_observe.telemetry_resource(service_name, "test"),
        span_exporter=InMemorySpanExporter(),
        metric_reader=InMemoryMetricReader(),
        log_exporter=InMemoryLogRecordExporter(),
    )
    astra_observe._install(  # noqa: SLF001 -- the same wiring init_telemetry uses
        service_name,
        captured.resource,
        (captured.span_exporter, captured.metric_reader, captured.log_exporter),
        captured=True,
    )
    try:
        yield captured
    finally:
        captured.final_metrics = captured.metric_reader.get_metrics_data()
        astra_observe._teardown()  # noqa: SLF001
        reset_globals()
