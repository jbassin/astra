"""Shared fixtures for the code-location tests: load ``definitions.py`` with telemetry kept local.

``definitions.py`` calls ``init_telemetry("astra.pipeline")`` at import. The ``exported``
fixture installs observe's real providers first, with in-memory exporters, so that call is a
no-op and nothing reaches the live collector (an ERROR record in SigNoz pages Discord).
"""

import importlib.util
import io
from collections.abc import Iterator
from pathlib import Path
from types import ModuleType

import astra_observe
import pytest
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter
from opentelemetry.sdk.metrics.export import ConsoleMetricExporter
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

DEFINITIONS = Path(__file__).resolve().parents[1] / "definitions.py"


@pytest.fixture
def exported(monkeypatch: pytest.MonkeyPatch) -> Iterator[InMemoryLogRecordExporter]:
    """Install observe's real providers with in-memory exporters; yield the log exporter."""
    astra_observe.shutdown()  # start un-initialized, so our providers are the ones installed
    logs = InMemoryLogRecordExporter()
    monkeypatch.setattr(astra_observe, "OTLPLogExporter", lambda **_: logs)
    monkeypatch.setattr(astra_observe, "OTLPSpanExporter", lambda **_: InMemorySpanExporter())
    monkeypatch.setattr(
        astra_observe, "OTLPMetricExporter", lambda **_: ConsoleMetricExporter(out=io.StringIO())
    )
    astra_observe.init_telemetry("astra.pipeline", endpoint="http://127.0.0.1:9")
    yield logs
    astra_observe.shutdown()


@pytest.fixture
def definitions(exported: InMemoryLogRecordExporter) -> ModuleType:
    """The root code location module, loaded by path (it is not an importable package)."""
    spec = importlib.util.spec_from_file_location("astra_dagster_definitions", DEFINITIONS)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
