"""The watchdog's freshness checks (alert-notify.sh): backup snapshot age, restore-test age and
entity.kdl drift, run against a scratch backup root and lock dir. Nothing pages (ALERT_DRY_RUN).
"""

from __future__ import annotations

import fcntl
import json
import os
import subprocess
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "systemd" / "alert-notify.sh"


def _check(tmp_path: Path, fn: str, **env: str) -> subprocess.CompletedProcess[str]:
    """Source the alerter (its `test` command only logs under dry-run), then call one check."""
    base = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith(("ASTRA_", "WATCHDOG_", "XDG_STATE_HOME"))
    }
    locks = tmp_path / "locks"
    locks.mkdir(exist_ok=True)
    full = {
        **base,
        "ALERT_DRY_RUN": "1",
        "XDG_STATE_HOME": str(tmp_path / "state"),
        "ASTRA_BACKUP_ROOT": str(tmp_path / "backups"),
        "GIT_PUBLISH_LOCK": str(locks / "git-publish.lock"),
        "HOST_TOOLING_LOCK": str(locks / "host-tooling.lock"),
        **env,
    }
    return subprocess.run(
        ["bash", "-c", f'source "$0" test 2>/dev/null; {fn}', str(SCRIPT)],
        check=False,
        capture_output=True,
        text=True,
        env=full,
    )


def _snapshot(root: Path, age: timedelta, *, manifest: bool = True) -> str:
    name = (datetime.now(UTC) - age).strftime("%Y-%m-%dT%H%M%SZ")
    d = root / name
    d.mkdir(parents=True)
    if manifest:
        (d / "manifest.json").write_text("{}")
    return name


def test_backup_age_fails_without_any_snapshot(tmp_path: Path) -> None:
    r = _check(tmp_path, "check_backup_age")
    assert r.returncode == 1
    assert "no complete backup snapshot" in r.stdout


def test_backup_age_passes_for_a_fresh_snapshot(tmp_path: Path) -> None:
    _snapshot(tmp_path / "backups", timedelta(hours=40))
    _snapshot(tmp_path / "backups", timedelta(hours=2))
    assert _check(tmp_path, "check_backup_age").returncode == 0


def test_backup_age_fails_for_a_stale_snapshot_and_ignores_incomplete_ones(tmp_path: Path) -> None:
    name = _snapshot(tmp_path / "backups", timedelta(hours=40))
    _snapshot(tmp_path / "backups", timedelta(hours=1), manifest=False)
    r = _check(tmp_path, "check_backup_age")
    assert r.returncode == 1
    assert f"{name} is 40h old (limit 36h)" in r.stdout


def _stamp(root: Path, age: timedelta) -> None:
    root.mkdir(parents=True, exist_ok=True)
    epoch = int(time.time() - age.total_seconds())
    (root / ".restore-test-pass.json").write_text(
        json.dumps({"snapshot": "2026-10-20T073000Z", "finished_epoch": epoch})
    )


def test_restore_test_age_fails_when_it_never_passed(tmp_path: Path) -> None:
    r = _check(tmp_path, "check_restore_test_age")
    assert r.returncode == 1
    assert "never passed" in r.stdout


@pytest.mark.parametrize(("days", "rc"), [(3, 0), (10, 1)])
def test_restore_test_age_limit(tmp_path: Path, days: int, rc: int) -> None:
    _stamp(tmp_path / "backups", timedelta(days=days))
    r = _check(tmp_path, "check_restore_test_age")
    assert r.returncode == rc
    if rc:
        assert "is 10 days old (limit 9)" in r.stdout


@pytest.mark.parametrize(
    ("cmd", "rc", "text"),
    [
        ("exit 0", 0, ""),
        ("echo 'DRIFT: entity.kdl is stale' >&2; exit 1", 1, "has drifted from a fresh seed"),
        ("echo boom; exit 3", 1, "could not run (exit 3): boom"),
    ],
)
def test_entity_drift(tmp_path: Path, cmd: str, rc: int, text: str) -> None:
    r = _check(tmp_path, "check_entity_drift", WATCHDOG_ENTITY_CHECK_CMD=cmd)
    assert r.returncode == rc
    assert text in r.stdout


def test_entity_drift_skips_while_a_publisher_holds_the_lock(tmp_path: Path) -> None:
    (tmp_path / "locks").mkdir()
    with (tmp_path / "locks" / "git-publish.lock").open("w") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        r = _check(tmp_path, "check_entity_drift", WATCHDOG_ENTITY_CHECK_CMD="exit 1")
    assert r.returncode == 2
    assert "holds the git-publish" in r.stdout
