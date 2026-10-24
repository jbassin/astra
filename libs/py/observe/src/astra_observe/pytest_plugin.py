"""pytest plugin: the ``telemetry_capture`` fixture (loaded by the repo-root ``conftest.py``)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from .testing import Captured, capture


@pytest.fixture
def telemetry_capture() -> Iterator[Captured]:
    """Record the test's spans, metrics and ``astra.*`` logs in memory (service ``astra.test``)."""
    with capture() as captured:
        yield captured
