"""Tests for the scribe→linguist trigger — the pure `new_sessions` detector + the sensor.

The sensor reads `ingest_saved_dir` from config; the detection core is pure (mirrors
scribe). The sensor itself is exercised with an ephemeral Dagster instance + a patched
config, so the run-request + dynamic-partition wiring is covered without external state.
"""

from __future__ import annotations

from pathlib import Path

import astra_linguist.assets as assets
import dagster as dg
import pytest
from astra_linguist.sensor import new_sessions


def _session(root: Path, date: str, *, with_script: bool = True) -> None:
    d = root / date
    d.mkdir()
    if with_script:
        (d / "script.json").write_text("[]", encoding="utf-8")


def test_new_sessions_needs_script_and_skips_known(tmp_path: Path) -> None:
    _session(tmp_path, "2026-6-1")
    _session(tmp_path, "2026-6-8")
    _session(tmp_path, "2026-6-9", with_script=False)  # scribe mid-write → not yet ready
    (tmp_path / "loose.txt").write_text("x")  # a non-dir is ignored
    assert new_sessions(tmp_path, existing_keys={"2026-6-1"}) == ["2026-6-8"]


def test_new_sessions_missing_dir() -> None:
    assert new_sessions("/no/such/dir", set()) == []


def test_correction_candidates_asset_registered() -> None:
    # the surfacer is wired as a partitioned asset; `defs` constructing at import validates
    # that the sensor's targets (session_transcripts + correction_candidates) resolve.
    asset = assets.correction_candidates
    assert asset.key.path == ["correction_candidates"]
    assert asset.partitions_def is assets.linguist_sessions
    assert assets.defs is not None


def test_scribe_output_sensor_emits_partition_and_run_request(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _session(tmp_path, "2026-6-8")
    monkeypatch.setattr(
        assets, "_linguist_config", lambda: type("C", (), {"ingest_saved_dir": str(tmp_path)})()
    )
    result = assets.scribe_output_sensor(
        dg.build_sensor_context(instance=dg.DagsterInstance.ephemeral())
    )
    assert isinstance(result, dg.SensorResult)
    assert [rr.partition_key for rr in result.run_requests or []] == ["2026-6-8"]
    assert result.dynamic_partitions_requests  # the partition is registered too


def test_scribe_output_sensor_quiet_without_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        assets, "_linguist_config", lambda: type("C", (), {"ingest_saved_dir": ""})()
    )
    result = assets.scribe_output_sensor(
        dg.build_sensor_context(instance=dg.DagsterInstance.ephemeral())
    )
    assert isinstance(result, dg.SensorResult)
    assert not result.run_requests
