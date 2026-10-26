"""The read-only pre-flight evaluates the real stage sensors and reports what they hold back."""

import importlib.util
from pathlib import Path
from types import ModuleType

import dagster as dg
import pytest
from astra_pipeline_resources.partitions import SessionStage
from astra_pipeline_resources.testing import (
    cancel_partition,
    fail_partition,
    mark_materialized,
    sessions_instance,
)

PREFLIGHT = Path(__file__).resolve().parents[1] / "automation_preflight.py"


@pytest.fixture
def preflight(monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    """The script as a module; its PGOPTIONS change is undone after the test."""
    monkeypatch.setenv("PGOPTIONS", "")  # records the old value, which teardown restores
    spec = importlib.util.spec_from_file_location("automation_preflight", PREFLIGHT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_preflight_reports_no_runs_for_existing_sessions(
    preflight: ModuleType, definitions: ModuleType
) -> None:
    instance = sessions_instance("2026-10-5", "2026-10-12", "2026-10-19", "2026-10-26")
    for key in ("2026-10-5", "2026-10-12", "2026-10-19", "2026-10-26"):
        mark_materialized(instance, "session_transcript", key)
        mark_materialized(instance, "session_transcripts", key)
        mark_materialized(instance, "session_episode_summary", key)
    mark_materialized(instance, "session_digest", "2026-10-5")
    fail_partition(instance, "session_digest", "2026-10-12")
    cancel_partition(instance, "session_digest", "2026-10-19")
    # The stages' own file checks read live paths; the report's stage list is a toy one.
    stages = [
        SessionStage(
            upstream=dg.AssetKey("session_episode_summary"),
            stage=dg.AssetKey("session_digest"),
            keep=lambda _key: True,
        )
    ]
    lines: list[str] = []
    total = preflight.preflight(definitions.defs, instance, lines.append, stages)
    assert total == 0
    assert [s.name for s in preflight.automation_sensors(definitions.defs)] == [
        "heartwood_automation",
        "linguist_automation",
        "mouthpiece_automation",
    ]
    assert "linguist_automation tick 1: 0 run(s) requested" in lines
    assert "mouthpiece_automation tick 2: 0 run(s) requested" in lines
    assert not [line for line in lines if "WOULD LAUNCH" in line]
    # 2026-10-26 was never tried: held back, and named, but not requested.
    assert any(line.startswith("session_digest: 1 old session") for line in lines)
    assert lines[-2].endswith(": 2026-10-26")
    assert lines[-1] == "total: 0 run(s) would be requested"
