"""Tests for the scribe→linguist trigger: the `script.json` check and the automation.

The file check reads `ingest_saved_dir` from config and the condition reads the session
state from the instance. `linguist_automation` is ticked over an ephemeral Dagster instance
with a patched config, so the run-request wiring is covered without external state.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace

import astra_linguist.assets as assets
import dagster as dg
import pytest
from astra_linguist.sensor import has_script
from astra_pipeline_resources.partitions import sessions
from astra_pipeline_resources.testing import (
    automation_tick,
    fail_partition,
    mark_materialized,
    sessions_instance,
)


def _session(root: Path, date: str, *, with_script: bool = True) -> None:
    d = root / date
    d.mkdir()
    if with_script:
        (d / "script.json").write_text("[]", encoding="utf-8")


def test_has_script_needs_the_file(tmp_path: Path) -> None:
    _session(tmp_path, "2026-6-1")
    _session(tmp_path, "2026-6-9", with_script=False)  # scribe mid-write → not yet ready
    assert has_script(tmp_path, "2026-6-1")
    assert not has_script(tmp_path, "2026-6-9")
    assert not has_script("/no/such/dir", "2026-6-1")


def test_session_assets_use_the_shared_set_and_depend_on_scribe() -> None:
    asset = assets.session_transcripts
    assert asset.key.path == ["session_transcripts"]
    assert asset.partitions_def is sessions
    assert asset.dependency_keys == {dg.AssetKey("session_transcript")}
    assert assets.defs is not None


@dg.asset(name="session_transcript", partitions_def=sessions)
def _scribe_transcript() -> None:
    """Stands in for scribe's asset, which linguist does not import. Without it the upstream
    is an unpartitioned stub, and one update of it would count for every session."""


#: linguist's definitions inside the pipeline graph, as the code location loads them.
DEFS = dg.Definitions.merge(assets.defs, dg.Definitions(assets=[_scribe_transcript]))


def _automation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, instance: dg.DagsterInstance
) -> Callable[[], list[str | None]]:
    """Ticks `linguist_automation` over ``instance`` with ``tmp_path`` as the saved dir."""
    monkeypatch.setattr(
        assets, "_linguist_config", lambda: SimpleNamespace(ingest_saved_dir=str(tmp_path))
    )
    cursor: list[str | None] = [None]

    def tick() -> list[str | None]:
        requests, cursor[0] = automation_tick(DEFS, "linguist_automation", instance, cursor[0])
        for request in requests:
            selected = {k.to_user_string() for k in request.asset_selection or []}
            assert selected == {"session_transcripts", "session_episode_summary"}
        return [r.partition_key for r in requests]

    return tick


def test_automation_runs_new_sessions_scribe_finished_and_linguist_never_tried(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    for date in ("2026-6-1", "2026-6-8", "2026-6-15", "2026-6-22", "2026-6-29"):
        _session(tmp_path, date)
    instance = sessions_instance("2026-6-1", "2026-6-8", "2026-6-15", "2026-6-22")
    # Before the first tick: scribe finished all four; linguist ran 2026-6-1 and failed
    # 2026-6-15. 2026-6-8 and 2026-6-22 were never tried, but they predate the sensor.
    mark_materialized(instance, "session_transcript", "2026-6-1", "2026-6-8", "2026-6-15")
    mark_materialized(instance, "session_transcript", "2026-6-22")
    mark_materialized(instance, "session_transcripts", "2026-6-1")
    fail_partition(instance, "session_transcripts", "2026-6-15")
    tick = _automation(tmp_path, monkeypatch, instance)
    assert tick() == []

    instance.add_dynamic_partitions("sessions", ["2026-6-29"])
    mark_materialized(instance, "session_transcript", "2026-6-29", "2026-6-15", "2026-6-1")
    assert tick() == ["2026-6-29"]
    assert tick() == []


def test_automation_skips_a_session_whose_script_is_gone(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _session(tmp_path, "2026-6-8", with_script=False)
    instance = sessions_instance("2026-6-8")
    tick = _automation(tmp_path, monkeypatch, instance)
    tick()
    mark_materialized(instance, "session_transcript", "2026-6-8")
    assert tick() == []


def test_automation_quiet_without_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    instance = sessions_instance("2026-6-8")
    tick = _automation(Path("/no/such/dir"), monkeypatch, instance)
    monkeypatch.setattr(assets, "_linguist_config", lambda: SimpleNamespace(ingest_saved_dir=""))
    tick()
    mark_materialized(instance, "session_transcript", "2026-6-8")
    assert tick() == []


def test_automation_waits_for_the_sessions_migration(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _session(tmp_path, "2026-6-8")
    instance = sessions_instance("2026-6-8")
    instance.add_dynamic_partitions("linguist_sessions", ["2026-6-1"])
    tick = _automation(tmp_path, monkeypatch, instance)
    tick()
    mark_materialized(instance, "session_transcript", "2026-6-8")
    assert tick() == []
