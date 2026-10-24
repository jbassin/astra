"""craig-sync replays the old recipe's children and exit codes (0037 ops-1b): every Drive mount
access is a bounded child (the listing ``bash -c`` and each ``cp``); the rest (mkdir, the
atomic rename, the count) happens in-process."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import pytest
from astra_ops import cli, craig
from astra_ops.context import Runner
from astra_ops.testing import Call, Step, make_ctx


def listing(tmp: Path, names: list[str], *, rc: int = 0, limit: float = 20) -> Call:
    drive = tmp / "drive"
    return Call(
        ["bash", "-c", craig.LIST_SH, "_", str(drive)],
        rc=rc,
        stdout="".join(f"{drive}/{n}\n" for n in names),
        limit=limit,
    )


def copy(tmp: Path, name: str, dest: Path, *, rc: int = 0, limit: float = 900) -> Call:
    final = dest / name

    def effect() -> None:
        if rc == 0:
            Path(f"{final}.X.partial").write_text(name)

    return Call(
        ["cp", f"{tmp}/drive/{name}", f"{final}.X.partial"], rc=rc, effect=effect, limit=limit
    )


@pytest.fixture
def fixed_partial(monkeypatch: pytest.MonkeyPatch) -> None:
    """``<name>.X.partial`` instead of a random name, so scripted argv lists are exact."""

    def unique(dest: str, base: str) -> Path:
        p = Path(dest, f"{base}.X.partial")
        p.touch()
        return p

    monkeypatch.setattr(craig, "_unique_partial", unique)


def setup(tmp: Path) -> tuple[Path, dict[str, str]]:
    dest = tmp / "state" / "scribe" / "incoming"
    return dest, {"scribe.incoming-path": str(dest)}


def test_copies_only_new_zips_via_partial_and_counts_the_total(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], fixed_partial: None
) -> None:
    dest, cfg = setup(tmp_path)
    dest.mkdir(parents=True)
    (dest / "old.zip").write_text("already here")
    steps: list[Step] = [
        listing(tmp_path, ["old.zip", "new 1.zip", "new2.zip"]),
        copy(tmp_path, "new 1.zip", dest),
        copy(tmp_path, "new2.zip", dest),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg)
    assert craig.craig_sync(ctx) == 0
    r.assert_done()
    assert sorted(p.name for p in dest.iterdir()) == ["new 1.zip", "new2.zip", "old.zip"]
    assert (dest / "new2.zip").read_text() == "new2.zip"
    assert capsys.readouterr().out == (
        "craig-sync: synced new 1.zip\ncraig-sync: synced new2.zip\n"
        "craig-sync: 2 new, 3 total in incoming\n"
    )


def test_empty_mount_makes_the_dest_and_reports_zero(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    dest, cfg = setup(tmp_path)
    ctx, r = make_ctx(tmp_path, [listing(tmp_path, [])], config=cfg)
    assert craig.craig_sync(ctx) == 0
    r.assert_done()
    assert dest.is_dir()
    assert capsys.readouterr().out == "craig-sync: 0 new, 0 total in incoming\n"


def test_unresponsive_mount_fails_the_unit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("CRAIG_SYNC_PROBE_TIMEOUT", "7")
    _, cfg = setup(tmp_path)
    ctx, r = make_ctx(tmp_path, [listing(tmp_path, [], rc=124, limit=7)], config=cfg)
    assert craig.craig_sync(ctx) == 1
    r.assert_done()
    assert f"Drive mount '{tmp_path}/drive' unresponsive (>7s)" in capsys.readouterr().err


def test_stalled_copy_drops_its_own_partial_and_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    fixed_partial: None,
) -> None:
    monkeypatch.setenv("CRAIG_SYNC_COPY_TIMEOUT", "")  # ${VAR:-900}: empty = the default
    dest, cfg = setup(tmp_path)
    dest.mkdir(parents=True)
    (dest / "a.zip.old.partial").write_text("an earlier run's leftover")
    steps: list[Step] = [
        listing(tmp_path, ["a.zip", "b.zip"]),
        copy(tmp_path, "a.zip", dest, rc=124),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg)
    assert craig.craig_sync(ctx) == 1
    r.assert_done()
    assert [p.name for p in dest.iterdir()] == ["a.zip.old.partial"]  # not ours: left alone
    assert "copy of a.zip timed out (>900s, mount stalled)" in capsys.readouterr().err


@pytest.mark.parametrize("value", ["", "relative/dir", "/"])
def test_a_bad_incoming_path_refuses_before_touching_the_mount(
    tmp_path: Path, value: str, capsys: pytest.CaptureFixture[str]
) -> None:
    ctx, r = make_ctx(tmp_path, [], config={"scribe.incoming-path": value})
    assert craig.craig_sync(ctx) == 1
    r.assert_done()
    assert "could not read scribe.incoming-path" in capsys.readouterr().err


def test_takes_no_arguments_and_asks_nothing(tmp_path: Path) -> None:
    _, cfg = setup(tmp_path)
    ctx, r = make_ctx(tmp_path, [listing(tmp_path, [])], config=cfg, tty=False)
    assert cli.dispatch(ctx, "craig-sync", []) == 0
    assert cli.dispatch(ctx, "craig-sync", ["--yes"]) == 64
    r.assert_done()


# --- the real bounded runner -----------------------------------------------------------------


def test_bounded_abandons_a_child_past_its_limit(tmp_path: Path) -> None:
    """Stands in for a D-state child: past the limit it is killed and NOT waited for."""
    started = time.monotonic()
    done = Runner().bounded([sys.executable, "-c", "import time; time.sleep(30)"], limit=0.5)
    assert done.returncode == 124
    assert time.monotonic() - started < 5


def test_bounded_returns_the_childs_code_and_stdout(tmp_path: Path) -> None:
    out = tmp_path / "out"
    code = "import sys; print('listed'); sys.exit(3)"
    assert Runner().bounded([sys.executable, "-c", code], limit=10, out_path=out).returncode == 3
    assert out.read_text() == "listed\n"
    assert Runner().bounded([str(tmp_path / "missing")], limit=1).returncode == 127


def test_real_run_over_a_scratch_mount(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """The real listing script and cp, end to end (names with spaces; a dotfile is skipped)."""
    drive = tmp_path / "drive"
    drive.mkdir()
    for name in ("2026-1-2 session.zip", "b.zip", ".hidden.zip", "notes.txt"):
        (drive / name).write_text(name)
    dest, cfg = setup(tmp_path)
    ctx, _ = make_ctx(tmp_path, [], config=cfg)
    ctx.runner = Runner()
    assert craig.craig_sync(ctx) == 0
    assert sorted(p.name for p in dest.iterdir()) == ["2026-1-2 session.zip", "b.zip"]
    assert craig.craig_sync(ctx) == 0  # idempotent
    out = capsys.readouterr().out
    assert out.endswith("craig-sync: 0 new, 2 total in incoming\n")
    assert "craig-sync: 2 new, 2 total in incoming\n" in out


def test_a_copy_abandoned_on_a_wedged_mount_never_writes_the_next_runs_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Run 1's cp stalls past its limit and is abandoned (SIGKILL cannot reap a D-state child,
    so here a detached writer outlives the kill); run 2 copies the zip; then run 1's copy
    wakes and writes. It lands only in run 1's own partial: the zip run 2 published is intact,
    and the leftover is not a *.zip, so scribe never reads it."""
    drive = tmp_path / "drive"
    drive.mkdir()
    (drive / "s.zip").write_text("the real recording")
    dest, cfg = setup(tmp_path)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "cp").write_text(
        '#!/bin/sh\n( sleep 1.5; printf "late bytes" > "$2" ) &\nexec sleep 30\n'
    )
    (bin_dir / "cp").chmod(0o755)
    real_path = os.environ["PATH"]
    monkeypatch.setenv("CRAIG_SYNC_COPY_TIMEOUT", "1")
    ctx, _ = make_ctx(tmp_path, [], config=cfg)
    ctx.runner = Runner()

    monkeypatch.setenv("PATH", f"{bin_dir}:{real_path}")
    assert craig.craig_sync(ctx) == 1  # run 1: the stalled copy
    monkeypatch.setenv("PATH", real_path)
    assert craig.craig_sync(ctx) == 0  # run 2: the mount recovered
    assert (dest / "s.zip").read_text() == "the real recording"

    time.sleep(2)  # run 1's copy wakes up and writes
    assert (dest / "s.zip").read_text() == "the real recording"
    leftovers = [p.name for p in dest.iterdir() if p.name != "s.zip"]
    assert all(n.startswith("s.zip.") and n.endswith(".partial") for n in leftovers), leftovers
    assert [p.name for p in dest.glob("*.zip")] == ["s.zip"]  # what scribe globs


def test_partials_get_the_mode_a_new_cp_file_would(tmp_path: Path) -> None:
    umask = os.umask(0o022)
    try:
        p = craig._unique_partial(str(tmp_path), "a.zip")
    finally:
        os.umask(umask)
    assert p.name.startswith("a.zip.") and p.name.endswith(".partial")
    assert p.stat().st_mode & 0o777 == 0o644
    assert craig._unique_partial(str(tmp_path), "a.zip") != p
