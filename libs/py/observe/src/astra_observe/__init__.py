"""OTel init shim for astra Python apps — traces + metrics + logs → the SigNoz collector.

Standing principle (CLAUDE.md): *telemetry from day one*. Every app (and every Dagster
run process) calls ``init_telemetry("astra.<subsystem>")`` before anything else, so a
span / metric / log lands in SigNoz with no per-app wiring. The logging handler is
attached to the ``astra`` logger namespace, so ``logging.getLogger("astra.<sub>")``
records export to SigNoz (third-party log noise is left out).

Two ways to wire, both export to the same collector:

* **Programmatic (primary).** ``init_telemetry(service)`` installs global Tracer +
  Meter providers exporting OTLP/HTTP to the endpoint from ``config.kdl``
  (``telemetry.otlp-endpoint``, via astra_config; pass ``endpoint=`` to override).
  Idempotent — safe to call once at process start.
* **Auto-instrumentation (optional).** Install ``opentelemetry-distro`` in the app
  and launch via ``opentelemetry-instrument python -m app`` with ``OTEL_*`` env set;
  it layers library spans on top. Phase 1 ships the programmatic path.

Short-lived processes (scripts, the Dagster op, the substrate smoke) must call
``shutdown()`` at the end to force-flush the batch processor, or buffered spans are
dropped on exit — exactly the failure the Phase-0 smoke had to guard against.
"""

from __future__ import annotations

import logging

from opentelemetry import metrics, trace
from opentelemetry._logs import set_logger_provider
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# In-cluster SigNoz collector OTLP/HTTP (services run on signoz-net; :4318). Mirrors
# the `telemetry.otlp-endpoint` default in config.kdl — kept as a constant so
# `import astra_observe` stays config-free until `init_telemetry` actually runs.
DEFAULT_ENDPOINT = "http://signoz-otel-collector:4318"

#: The logger namespace whose records are exported to SigNoz (app logs, not lib noise).
LOG_NAMESPACE = "astra"

_state: tuple[TracerProvider, MeterProvider, LoggerProvider, logging.Handler] | None = None


def _config_endpoint() -> str:
    """The OTLP endpoint from `config.kdl` via astra_config (no ad-hoc env lookup).

    Imported lazily so `import astra_observe` (which every app does first) stays light
    and config-free; only `init_telemetry` pulls it in.
    """
    from astra_config import load_config

    return load_config().telemetry.otlp_endpoint


def init_telemetry(service_name: str, *, endpoint: str | None = None) -> None:
    """Install global trace + metric + log providers exporting to the SigNoz collector.

    Idempotent: a second call is a no-op (the first provider wins), so libraries
    and apps can both call it defensively. ``service_name`` should be
    ``astra.<subsystem>`` (e.g. ``astra.scribe``).
    """
    global _state
    if _state is not None:
        return

    endpoint = (endpoint or _config_endpoint()).rstrip("/")
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

    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(
        BatchLogRecordProcessor(OTLPLogExporter(endpoint=f"{endpoint}/v1/logs"))
    )
    set_logger_provider(logger_provider)
    handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
    astra_log = logging.getLogger(LOG_NAMESPACE)
    astra_log.setLevel(logging.INFO)
    astra_log.addHandler(handler)

    _state = (tracer_provider, meter_provider, logger_provider, handler)


def get_tracer(name: str) -> trace.Tracer:
    """A tracer from the installed provider (a no-op tracer if init wasn't called)."""
    return trace.get_tracer(name)


def get_meter(name: str) -> metrics.Meter:
    """A meter from the installed provider (a no-op meter if init wasn't called)."""
    return metrics.get_meter(name)


def get_logger(name: str) -> logging.Logger:
    """A stdlib logger under the `astra` namespace; its records export to SigNoz once
    `init_telemetry` ran (and print/handle locally regardless). Use `astra.<subsystem>`."""
    return logging.getLogger(name)


def shutdown() -> None:
    """Force-flush + tear down providers. Call before a short-lived process exits."""
    global _state
    if _state is None:
        return
    tracer_provider, meter_provider, logger_provider, handler = _state
    logging.getLogger(LOG_NAMESPACE).removeHandler(handler)
    tracer_provider.shutdown()
    meter_provider.shutdown()
    logger_provider.shutdown()
    _state = None
