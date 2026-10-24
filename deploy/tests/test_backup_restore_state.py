"""astra-backup.sh's restore-test state check (rt_state) against a scratch data root and
snapshot. Sources the script for its functions; nothing touches Docker or the real backup root.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "systemd" / "astra-backup.sh"


def _rig(tmp_path: Path, rel: str, files: dict[str, str]) -> tuple[Path, Path]:
    """A data root and a snapshot that both hold `files` under `rel`, with matching mtimes."""
    data, snap = tmp_path / "data", tmp_path / "backups" / "2026-10-23T073000Z"
    for root in (data / rel, snap / "state" / rel):
        for name, body in files.items():
            p = root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(body)
            os.utime(p, (1_790_000_000, 1_790_000_000))
    manifest = {"state": [{"path": rel, "files": len(files), "excludes": ["*.lock"]}]}
    (snap / "manifest.json").write_text(json.dumps(manifest))
    return data, snap


def _rt_state(tmp_path: Path, data: Path, snap: Path, rel: str) -> subprocess.CompletedProcess[str]:
    env = {k: v for k, v in os.environ.items() if not k.startswith("ASTRA_")}
    env |= {"ASTRA_DATA_ROOT": str(data), "ASTRA_BACKUP_ROOT": str(tmp_path / "backups")}
    return subprocess.run(
        [
            "bash",
            "-c",
            'source "$1"; rt_state "$2" "$3"; echo "fails=$RT_FAILS"',
            "rt-test",
            SCRIPT,
            snap,
            rel,
        ],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )


def _touch_all(root: Path) -> None:
    """Rewrite every file at the source, as a deploy does."""
    for p in root.rglob("*"):
        if p.is_file():
            p.write_text(p.read_text() + "\n")


def test_unchanged_files_are_checksummed(tmp_path: Path) -> None:
    data, snap = _rig(tmp_path, "heartwood", {"a.kdl": "a", "b/c.kdl": "c"})
    r = _rt_state(tmp_path, data, snap, "heartwood")
    assert "fails=0" in r.stdout, r.stderr
    assert "sha256 sample 2 of 2 unchanged matched" in r.stderr


def test_a_mostly_changed_dir_still_samples_its_unchanged_files(tmp_path: Path) -> None:
    files = {f"f{i}.json": str(i) for i in range(30)}
    data, snap = _rig(tmp_path, "heartwood", files)
    for i in range(29):
        (data / "heartwood" / f"f{i}.json").write_text("changed")
    r = _rt_state(tmp_path, data, snap, "heartwood")
    assert "fails=0" in r.stdout, r.stderr
    assert "sha256 sample 1 of 1 unchanged matched" in r.stderr


def test_a_checksum_mismatch_fails(tmp_path: Path) -> None:
    data, snap = _rig(tmp_path, "audio", {"x.flac": "good"})
    bad = snap / "state" / "audio" / "x.flac"
    bad.write_text("evil")  # same size, mtime restored: only the checksum can tell
    os.utime(bad, (1_790_000_000, 1_790_000_000))
    r = _rt_state(tmp_path, data, snap, "audio")
    assert "fails=1" in r.stdout
    assert "1 of 1 sampled files differ from the source" in r.stderr


def test_all_changed_in_a_volatile_dir_warns(tmp_path: Path) -> None:
    data, snap = _rig(tmp_path, "deploy", {"history.jsonl": "{}", "live/akasha": "sha"})
    _touch_all(data / "deploy")
    r = _rt_state(tmp_path, data, snap, "deploy")
    assert "fails=0" in r.stdout, r.stderr
    assert "warn: state deploy: all 2 files changed at the source" in r.stderr


def test_all_changed_in_a_stable_dir_fails(tmp_path: Path) -> None:
    data, snap = _rig(tmp_path, "audio", {"s1.flac": "1", "s2.flac": "2"})
    _touch_all(data / "audio")
    r = _rt_state(tmp_path, data, snap, "audio")
    assert "fails=1" in r.stdout
    assert "none of its 2 files is unchanged at the source" in r.stderr
