"""Phase 0 telemetry smoke (Python) — emit one OTel span to the SigNoz collector.

Not a CI lane: run it manually against a live stack to prove the OTLP loop
end-to-end (this de-risks Phase 1's libs/py/observe). Deps are ephemeral via
`uv run --with`, so nothing leaks into the workspace lockfile:

    OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:10353 \
    uv run --with opentelemetry-sdk \
           --with opentelemetry-exporter-otlp-proto-http \
           python deploy/telemetry-smoke/py_span.py
"""

from __future__ import annotations

import os

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def main() -> None:
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:10353")
    provider = TracerProvider(resource=Resource.create({"service.name": "astra-smoke-py"}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces")))
    trace.set_tracer_provider(provider)

    tracer = trace.get_tracer("astra-smoke-py")
    with tracer.start_as_current_span("phase0-smoke-span") as span:
        span.set_attribute("astra.phase", 0)
        span.set_attribute("astra.lane", "py")

    provider.shutdown()  # force-flush the batch processor
    print(f"py span emitted to {endpoint}")


if __name__ == "__main__":
    main()
