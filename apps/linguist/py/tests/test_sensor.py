"""Tests for the scribe→linguist trigger: the `script.json` check and the sensor.

The sensor reads `ingest_saved_dir` from config and the session state from the instance.
It is exercised with an ephemeral Dagster instance and a patched config, so the
run-request wiring is covered without external state.
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import astra_linguist.assets as assets
import dagster as dg
import pytest
from astra_linguist.sensor import has_script
from astra_pipeline_resources.partitions import sessions
from astra_pipeline_resources.testing import fail_partition, mark_materialized, sessions_instance


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


def _evaluate(instance: dg.DagsterInstance) -> dg.SensorResult:
    result = assets.scribe_output_sensor(dg.build_sensor_context(instance=instance))
    assert isinstance(result, dg.SensorResult)
    return result


def test_sensor_runs_sessions_scribe_finished_and_linguist_never_tried(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    for date in ("2026-6-1", "2026-6-8", "2026-6-15", "2026-6-22"):
        _session(tmp_path, date)
    monkeypatch.setattr(
        assets, "_linguist_config", lambda: SimpleNamespace(ingest_saved_dir=str(tmp_path))
    )
    instance = sessions_instance("2026-6-1", "2026-6-8", "2026-6-15", "2026-6-22", "2026-6-29")
    # Scribe finished all but 2026-6-29; linguist already ran 2026-6-1 and failed 2026-6-15.
    mark_materialized(instance, "session_transcript", "2026-6-1", "2026-6-8", "2026-6-15")
    mark_materialized(instance, "session_transcript", "2026-6-22")
    mark_materialized(instance, "session_transcripts", "2026-6-1")
    fail_partition(instance, "session_transcripts", "2026-6-15")

    result = _evaluate(instance)
    assert [rr.partition_key for rr in result.run_requests or []] == ["2026-6-22", "2026-6-8"]
    assert not result.dynamic_partitions_requests  # only craig_drop_sensor adds sessions


def test_sensor_skips_a_session_whose_script_is_gone(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _session(tmp_path, "2026-6-8", with_script=False)
    monkeypatch.setattr(
        assets, "_linguist_config", lambda: SimpleNamespace(ingest_saved_dir=str(tmp_path))
    )
    instance = sessions_instance("2026-6-8")
    mark_materialized(instance, "session_transcript", "2026-6-8")
    assert not _evaluate(instance).run_requests


def test_sensor_quiet_without_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(assets, "_linguist_config", lambda: SimpleNamespace(ingest_saved_dir=""))
    assert not _evaluate(dg.DagsterInstance.ephemeral()).run_requests


def test_sensor_waits_for_the_sessions_migration(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _session(tmp_path, "2026-6-8")
    monkeypatch.setattr(
        assets, "_linguist_config", lambda: SimpleNamespace(ingest_saved_dir=str(tmp_path))
    )
    instance = sessions_instance("2026-6-8")
    instance.add_dynamic_partitions("linguist_sessions", ["2026-6-1"])
    mark_materialized(instance, "session_transcript", "2026-6-8")
    result = _evaluate(instance)
    assert not result.run_requests
    assert result.skip_reason and "migration" in (result.skip_reason.skip_message or "")
