"""OTel init shim for astra Python apps — traces + metrics + logs → the SigNoz collector.

Standing principle (CLAUDE.md): *telemetry from day one*. The logging handler is attached to
the ``astra`` logger namespace, so ``logging.getLogger("astra.<sub>")`` records export to
SigNoz (third-party log noise is left out).

Two entry points, both export to the same collector:

* ``with run("astra.<sub>"):`` — for a CLI's ``main()``. It initialises telemetry, runs the
  body, and always flushes and shuts down on the way out: on return, on an exception, and on
  SIGTERM (turned into ``SystemExit(143)`` so the ``finally`` runs).
* ``init_telemetry("astra.<sub>")`` — for a long-lived process that never shuts down on
  purpose (the Dagster code location, ``dagster/definitions.py``). Idempotent; the SDK's
  ``atexit`` hook flushes on a normal exit.

The process decides where it exports, not the caller:

* ``ASTRA_RUNTIME=container`` (set by ``dagster/Dockerfile``) → ``telemetry.otlp-endpoint``,
  the in-cluster collector name. Unset → the host: ``telemetry.host-otlp-endpoint``.
* Every signal carries ``deployment.environment``: ``test`` under pytest, ``production`` in a
  container or when the code runs from the deploy checkout (``$ASTRA_DEPLOY_ROOT``, default
  ``/ruby/data/astra-deploy``), else ``development``.
* Under pytest nothing leaves the process: ``init_telemetry`` is a no-op there. Tests that
  assert on telemetry use ``astra_observe.testing`` (the ``telemetry_capture`` fixture).
"""

from __future__ import annotations

import logging
import os
import signal
import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from opentelemetry import metrics, trace
from opentelemetry._logs import set_logger_provider
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import (
    BatchLogRecordProcessor,
    LogRecordExporter,
    SimpleLogRecordProcessor,
)
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import MetricReader
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor, SpanExporter

#: The logger namespace whose records are exported to SigNoz (app logs, not lib noise).
LOG_NAMESPACE = "astra"

#: Runtime marker: ``container`` inside an astra image; unset (or ``host``) on the host.
RUNTIME_VAR = "ASTRA_RUNTIME"
#: The production checkout on the host (the same variable and default as the justfile).
DEPLOY_ROOT_VAR = "ASTRA_DEPLOY_ROOT"
DEFAULT_DEPLOY_ROOT = "/ruby/data/astra-deploy"
#: The resource attribute SigNoz filters environments on.
DEPLOYMENT_ENVIRONMENT = "deployment.environment"

_log = logging.getLogger(__name__)  # not under `astra`: observe's own warnings stay local


@dataclass
class _State:
    service_name: str
    tracer_provider: TracerProvider
    meter_provider: MeterProvider
    logger_provider: LoggerProvider
    handler: logging.Handler
    #: True when `astra_observe.testing.capture` installed it; `shutdown()` then only flushes.
    captured: bool


_state: _State | None = None


def in_container() -> bool:
    """Whether this process runs inside an astra container (``ASTRA_RUNTIME=container``)."""
    runtime = os.environ.get(RUNTIME_VAR, "host")
    if runtime not in ("host", "container"):
        raise ValueError(f"{RUNTIME_VAR}={runtime!r}: expected 'container' or unset")
    return runtime == "container"


def deployment_environment() -> str:
    """``test`` under pytest, ``production`` in a container or the deploy checkout, else
    ``development``."""
    if "PYTEST_VERSION" in os.environ:  # pytest >= 8.2 sets it for the whole session
        return "test"
    if in_container():
        return "production"
    from astra_config import find_repo_root

    deploy_root = Path(os.environ.get(DEPLOY_ROOT_VAR, DEFAULT_DEPLOY_ROOT)).resolve()
    try:
        checkout = find_repo_root()
    except FileNotFoundError:  # installed outside a checkout: not the deploy tree
        return "development"
    return "production" if checkout == deploy_root else "development"


def otlp_endpoint() -> str:
    """The collector's OTLP/HTTP base URL as this process can reach it (from ``config.kdl``).

    Imported lazily so ``import astra_observe`` (which every app does first) stays config-free.
    """
    from astra_config import load_config

    telemetry = load_config().telemetry
    return telemetry.otlp_endpoint if in_container() else telemetry.host_otlp_endpoint


def telemetry_resource(service_name: str, environment: str | None = None) -> Resource:
    """The resource every signal of this process carries: service and deployment environment."""
    env = environment if environment is not None else deployment_environment()
    return Resource.create({SERVICE_NAME: service_name, DEPLOYMENT_ENVIRONMENT: env})


def _otlp_exporters(endpoint: str) -> tuple[SpanExporter, MetricReader, LogRecordExporter]:
    from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

    base = endpoint.rstrip("/")
    return (
        OTLPSpanExporter(endpoint=f"{base}/v1/traces"),
        PeriodicExportingMetricReader(OTLPMetricExporter(endpoint=f"{base}/v1/metrics")),
        OTLPLogExporter(endpoint=f"{base}/v1/logs"),
    )


def _install(
    service_name: str,
    resource: Resource,
    exporters: tuple[SpanExporter, MetricReader, LogRecordExporter],
    *,
    captured: bool = False,
) -> None:
    """Install global trace, metric and log providers. Batching unless ``captured``."""
    global _state  # noqa: PLW0603 -- the process-wide telemetry singleton
    span_exporter, metric_reader, log_exporter = exporters

    tracer_provider = TracerProvider(resource=resource)
    span_processor = (
        SimpleSpanProcessor(span_exporter) if captured else BatchSpanProcessor(span_exporter)
    )
    tracer_provider.add_span_processor(span_processor)
    trace.set_tracer_provider(tracer_provider)

    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)

    logger_provider = LoggerProvider(resource=resource)
    log_processor = (
        SimpleLogRecordProcessor(log_exporter)
        if captured
        else BatchLogRecordProcessor(log_exporter)
    )
    logger_provider.add_log_record_processor(log_processor)
    set_logger_provider(logger_provider)
    handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
    astra_log = logging.getLogger(LOG_NAMESPACE)
    astra_log.setLevel(logging.INFO)
    astra_log.addHandler(handler)

    _state = _State(
        service_name, tracer_provider, meter_provider, logger_provider, handler, captured
    )


def init_telemetry(service_name: str) -> None:
    """Install global trace + metric + log providers exporting to the SigNoz collector.

    Idempotent: a second call is a no-op (the first provider wins), so libraries and apps can
    both call it defensively; a second call with a different name warns. Under pytest it does
    nothing, so no test reaches the live collector. ``service_name`` is ``astra.<subsystem>``.
    """
    if _state is not None:
        if _state.service_name != service_name:
            _log.warning(
                "init_telemetry(%r) ignored: telemetry already runs as %r",
                service_name,
                _state.service_name,
            )
        return
    environment = deployment_environment()
    if environment == "test":
        return
    _install(
        service_name,
        telemetry_resource(service_name, environment),
        _otlp_exporters(otlp_endpoint()),
    )


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


#: The counter ``report_ignored`` adds to, by ``site`` (the same name in ``@astra/observe``).
IGNORED_ERRORS_METRIC = "astra.errors.ignored"
_OBSERVE_SCOPE = "astra.observe"


def report_ignored(site: str, exc: BaseException) -> None:
    """Record an exception the code deliberately ignores, instead of a bare ``except: pass``.

    Adds one to ``astra.errors.ignored{site}`` and logs at DEBUG on ``astra.observe`` (the
    ``astra`` logger exports from INFO, so the record stays local unless DEBUG is enabled).
    ``site`` is a short, stable name for the handler (``assay.cache-cleanup``), never a value
    with unbounded cardinality.
    """
    # Taken at call time, so the count lands in whichever provider is installed now.
    metrics.get_meter(_OBSERVE_SCOPE).create_counter(
        IGNORED_ERRORS_METRIC,
        description="Errors the code caught and deliberately ignored, by site",
    ).add(1, {"site": site})
    logging.getLogger(_OBSERVE_SCOPE).debug(
        "ignored error at %s: %s",
        site,
        exc,
        extra={"site": site, "exception.type": type(exc).__name__},
    )


def _teardown() -> None:
    global _state  # noqa: PLW0603 -- the process-wide telemetry singleton
    if _state is None:
        return
    logging.getLogger(LOG_NAMESPACE).removeHandler(_state.handler)
    _state.tracer_provider.shutdown()
    _state.meter_provider.shutdown()
    _state.logger_provider.shutdown()
    _state = None


def shutdown() -> None:
    """Force-flush and tear down the providers. ``run()`` calls it; call it yourself only in a
    short-lived process that uses ``init_telemetry`` directly.

    The global providers can be installed once per process, so telemetry stays off after this.
    Inside ``astra_observe.testing.capture`` it only flushes; the capture tears down itself.
    """
    if _state is not None and _state.captured:
        _state.tracer_provider.force_flush()
        _state.logger_provider.force_flush()
        return
    _teardown()


def _exit_on_sigterm() -> Callable[[], None]:
    """Make SIGTERM raise ``SystemExit(143)`` so ``finally`` blocks run; return the undo.

    Only from the main thread, and only when nothing else claimed SIGTERM.
    """
    if threading.current_thread() is not threading.main_thread():
        return lambda: None
    previous = signal.getsignal(signal.SIGTERM)
    if previous is not signal.SIG_DFL:
        return lambda: None

    def _raise(signum: int, _frame: Any) -> None:
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, _raise)

    def _restore() -> None:
        signal.signal(signal.SIGTERM, previous)

    return _restore


@contextmanager
def run(service_name: str) -> Iterator[None]:
    """Telemetry for one short-lived program: init, run the body, always flush and shut down.

    Use it as the body of a CLI's ``main()``::

        def main(argv=None) -> int:
            with astra_observe.run("astra.assay"):
                return cli(argv)

    Exceptions propagate after the flush. SIGTERM becomes ``SystemExit(143)`` while the body
    runs, so a ``kill`` or ``systemctl stop`` still flushes.
    """
    init_telemetry(service_name)
    restore = _exit_on_sigterm()
    try:
        yield
    finally:
        restore()
        shutdown()
