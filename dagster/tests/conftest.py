"""Shared fixtures for the code-location tests: load ``definitions.py`` with telemetry kept local.

``definitions.py`` calls ``init_telemetry("astra.pipeline")`` at import. The ``exported``
fixture opens an in-memory capture as ``astra.pipeline`` first (``astra_observe.testing``), so
that call is a no-op and nothing reaches the live collector (an ERROR record in SigNoz pages
Discord).
"""

import importlib.util
from collections.abc import Iterator
from pathlib import Path
from types import ModuleType

import pytest
from astra_observe.testing import Captured, capture

DEFINITIONS = Path(__file__).resolve().parents[1] / "definitions.py"


@pytest.fixture
def exported() -> Iterator[Captured]:
    """observe's real providers with in-memory exporters, as service ``astra.pipeline``."""
    with capture("astra.pipeline") as captured:
        yield captured


@pytest.fixture
def definitions(exported: Captured) -> ModuleType:
    """The root code location module, loaded by path (it is not an importable package)."""
    spec = importlib.util.spec_from_file_location("astra_dagster_definitions", DEFINITIONS)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
