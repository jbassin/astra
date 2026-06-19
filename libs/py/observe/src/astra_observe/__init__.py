"""OTel init shim for astra Python apps — traces + metrics → the SigNoz collector.

Standing principle (CLAUDE.md): *telemetry from day one*. Every app calls
``init_telemetry("astra.<subsystem>")`` before anything else, so a span/metric
lands in SigNoz with no per-app wiring.

Two ways to wire, both export to the same collector:

* **Programmatic (primary).** ``init_telemetry(service)`` installs global Tracer +
  Meter providers exporting OTLP/HTTP to ``OTEL_EXPORTER_OTLP_ENDPOINT`` (default
  the local collector). Idempotent — safe to call once at process start.
* **Auto-instrumentation (optional).** Install ``opentelemetry-distro`` in the app
  and launch via ``opentelemetry-instrument python -m app`` with ``OTEL_*`` env set;
  it layers library spans on top. Phase 1 ships the programmatic path.

Short-lived processes (scripts, the Dagster op, the substrate smoke) must call
``shutdown()`` at the end to force-flush the batch processor, or buffered spans are
dropped on exit — exactly the failure the Phase-0 smoke had to guard against.
"""

from __future__ import annotations

import os

from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# The local collector's OTLP/HTTP receiver (deploy/ remaps it into the astra range).
DEFAULT_ENDPOINT = "http://localhost:10353"

_state: tuple[TracerProvider, MeterProvider] | None = None


def init_telemetry(service_name: str, *, endpoint: str | None = None) -> None:
    """Install global trace + metric providers exporting to the SigNoz collector.

    Idempotent: a second call is a no-op (the first provider wins), so libraries
    and apps can both call it defensively. ``service_name`` should be
    ``astra.<subsystem>`` (e.g. ``astra.scribe``).
    """
    global _state
    if _state is not None:
        return

    raw = endpoint or os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT") or DEFAULT_ENDPOINT
    endpoint = raw.rstrip("/")
    resource = Resource.create({SERVICE_NAME: service_name})

    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces"))
    )
    trace.set_tracer_provider(tracer_provider)

    meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[
            PeriodicExportingMetricReader(OTLPMetricExporter(endpoint=f"{endpoint}/v1/metrics"))
        ],
    )
    metrics.set_meter_provider(meter_provider)

    _state = (tracer_provider, meter_provider)


def get_tracer(name: str) -> trace.Tracer:
    """A tracer from the installed provider (a no-op tracer if init wasn't called)."""
    return trace.get_tracer(name)


def get_meter(name: str) -> metrics.Meter:
    """A meter from the installed provider (a no-op meter if init wasn't called)."""
    return metrics.get_meter(name)


def shutdown() -> None:
    """Force-flush + tear down providers. Call before a short-lived process exits."""
    global _state
    if _state is None:
        return
    tracer_provider, meter_provider = _state
    tracer_provider.shutdown()
    meter_provider.shutdown()
    _state = None
