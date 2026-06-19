"""Unit checks for the OTel shim — no collector required.

These exercise wiring/idempotency against the real SDK providers (offline); the
end-to-end "a span lands in SigNoz" check is the substrate smoke (exit gate E).
"""

from __future__ import annotations

import astra_observe
from opentelemetry import trace


def teardown_function() -> None:
    # Reset module state between tests so each starts un-initialized.
    astra_observe.shutdown()


def test_init_is_idempotent_and_installs_a_real_provider() -> None:
    astra_observe.init_telemetry("astra.test", endpoint="http://localhost:10353")
    first = trace.get_tracer_provider()
    # Second call is a no-op: the same provider stays installed.
    astra_observe.init_telemetry("astra.test-again")
    assert trace.get_tracer_provider() is first


def test_get_tracer_and_meter_return_usable_handles() -> None:
    astra_observe.init_telemetry("astra.test", endpoint="http://localhost:10353")
    tracer = astra_observe.get_tracer("astra.test")
    with tracer.start_as_current_span("unit-span") as span:
        span.set_attribute("astra.lane", "py")
    # A meter handle is usable even with no reader scrape in a unit test.
    counter = astra_observe.get_meter("astra.test").create_counter("astra.test.calls")
    counter.add(1)


def test_shutdown_allows_reinit() -> None:
    astra_observe.init_telemetry("astra.first", endpoint="http://localhost:10353")
    astra_observe.shutdown()
    # After shutdown, init takes effect again (state was cleared).
    astra_observe.init_telemetry("astra.second", endpoint="http://localhost:10353")
    assert astra_observe.get_tracer("astra.second") is not None
