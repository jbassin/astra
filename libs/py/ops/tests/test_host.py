"""units-install, alert-sudoers-install and portal-module-install replay the old install
recipes' children (0037 ops-1b): the old `_unit-link` dependency (link from the deploy
checkout, then daemon-reload), then each group's enable."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest
from astra_config import find_repo_root
from astra_ops import cli, host
from astra_ops.testing import Call, Step, deploy_call, make_ctx

REPO = find_repo_root()


def sc(*args: str, rc: int = 0, stdout: str = "") -> Call:
    return Call(["systemctl", "--user", *args], rc=rc, stdout=stdout)


#: The backfill check before a linguist-commit or heartwood-request group: not running.
NO_BACKFILL = sc("is-active", "--quiet", "heartwood-backfill.service", rc=3)


def world(tmp: Path) -> Path:
    """The real units.txt in the scratch repo, and every unit file in the deploy checkout."""
    (tmp / "repo" / "deploy" / "systemd").mkdir(parents=True)
    shutil.copy(REPO / "deploy/systemd/units.txt", tmp / "repo/deploy/systemd/units.txt")
    src = tmp / "deploy" / "deploy" / "systemd"
    src.mkdir(parents=True)
    for units in host.unit_groups(REPO).values():
        for u in units:
            (src / u).write_text("[Unit]\n")
    return src


def test_the_groups_are_the_old_install_recipes() -> None:
    assert host.unit_groups(REPO) == {
        "craig": ["craig-sync.service", "craig-sync.timer"],
        "linguist-commit": [
            "linguist-commit.service", "linguist-commit.timer", "linguist-commit.path",
        ],
        "alert": [
            "astra-alert@.service", "astra-watchdog.service", "astra-watchdog.timer",
            "craig-sync.service", "linguist-commit.service", "astra-metrics.service",
            "astra-metrics.timer", "astra-smoke.service", "astra-smoke.timer",
        ],
        "backup": [
            "astra-backup.service", "astra-backup.timer", "astra-restore-test.service",
            "astra-restore-test.timer",
        ],
        "heartwood-request": [
            "heartwood-request.service", "heartwood-request.path", "heartwood-request.timer",
        ],
    }  # fmt: skip


def test_link_replaces_copies_and_foreign_links_and_skips_good_ones(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    src = world(tmp_path)
    units = tmp_path / "home" / ".config" / "systemd" / "user"
    units.mkdir(parents=True)
    (units / "craig-sync.service").symlink_to(src / "craig-sync.service")  # already right
    (units / "craig-sync.timer").write_text("an old cp install")  # a copy
    steps: list[Step] = [
        sc("link", str(src / "craig-sync.timer")),
        sc("daemon-reload"),
        sc("enable", "--now", "craig-sync.timer"),
        sc("list-timers", "craig-sync.timer", "--no-pager"),
    ]
    ctx, r = make_ctx(tmp_path, steps)
    assert cli.dispatch(ctx, "units-install", ["craig"]) == 0
    r.assert_done()
    assert not (units / "craig-sync.timer").exists()  # removed so `systemctl link` can link
    assert f"unit-link: replaced old {units}/craig-sync.timer" in capsys.readouterr().out


def test_all_groups_in_order_with_artifacts_init_before_heartwood(tmp_path: Path) -> None:
    src = world(tmp_path)

    def linked(*names: str) -> list[Step]:
        return [sc("link", str(src / n)) for n in names]

    steps: list[Step] = [
        NO_BACKFILL,
        *linked("craig-sync.service", "craig-sync.timer"),
        sc("daemon-reload"),
        sc("enable", "--now", "craig-sync.timer"),
        sc("list-timers", "craig-sync.timer", "--no-pager"),
        *linked("linguist-commit.service", "linguist-commit.timer", "linguist-commit.path"),
        sc("daemon-reload"),
        sc("enable", "--now", "linguist-commit.timer", "linguist-commit.path"),
        sc("list-timers", "linguist-commit.timer", "--no-pager"),
        sc("is-active", "linguist-commit.path", stdout="active\n"),
        *linked(
            "astra-alert@.service", "astra-watchdog.service", "astra-watchdog.timer",
            "astra-metrics.service", "astra-metrics.timer", "astra-smoke.service",
            "astra-smoke.timer",
        ),
        sc("daemon-reload"),
        sc("enable", "--now", "astra-watchdog.timer", "astra-metrics.timer", "astra-smoke.timer"),
        sc(
            "list-timers", "astra-watchdog.timer", "astra-metrics.timer", "astra-smoke.timer",
            "--no-pager",
        ),
        *linked(
            "astra-backup.service", "astra-backup.timer", "astra-restore-test.service",
            "astra-restore-test.timer",
        ),
        sc("daemon-reload"),
        sc("enable", "--now", "astra-backup.timer", "astra-restore-test.timer"),
        sc("list-timers", "astra-backup.timer", "astra-restore-test.timer", "--no-pager"),
        deploy_call(tmp_path, "--init-artifacts"),
        *linked("heartwood-request.service", "heartwood-request.path", "heartwood-request.timer"),
        sc("daemon-reload"),
        sc("enable", "--now", "heartwood-request.path", "heartwood-request.timer"),
        sc("list-timers", "heartwood-request.timer", "--no-pager"),
        sc("is-active", "heartwood-request.path", stdout="active\n"),
    ]  # fmt: skip
    ctx, r = make_ctx(tmp_path, steps)

    # A link really lands, so a later group sees craig-sync.service already linked.
    real_run = r.run

    def run(argv, **kw):
        if list(argv[:3]) == ["systemctl", "--user", "link"]:
            dst = ctx.home / ".config/systemd/user" / Path(argv[3]).name
            dst.symlink_to(argv[3])
        return real_run(argv, **kw)

    r.run = run  # ty: ignore[invalid-assignment]
    assert cli.dispatch(ctx, "units-install", []) == 0
    r.assert_done()


def test_a_missing_unit_file_stops_before_linking(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    src = world(tmp_path)
    (src / "craig-sync.timer").unlink()
    steps: list[Step] = [sc("link", str(src / "craig-sync.service"))]
    ctx, r = make_ctx(tmp_path, steps)
    assert cli.dispatch(ctx, "units-install", ["craig"]) == 1
    r.assert_done()
    assert "craig-sync.timer missing — deploy a commit that has it first" in capsys.readouterr().err


def test_failed_artifacts_init_stops_the_heartwood_group(tmp_path: Path) -> None:
    world(tmp_path)
    ctx, r = make_ctx(tmp_path, [NO_BACKFILL, deploy_call(tmp_path, "--init-artifacts", rc=3)])
    assert cli.dispatch(ctx, "units-install", ["heartwood-request"]) == 3
    r.assert_done()


@pytest.mark.parametrize("groups", [[], ["linguist-commit"], ["craig", "heartwood-request"]])
def test_refuses_to_rearm_what_a_running_backfill_paused_lock_file(
    tmp_path: Path, groups: list[str], capsys: pytest.CaptureFixture[str]
) -> None:
    world(tmp_path)
    lock = tmp_path / "state" / "heartwood" / "backfill.lock"
    lock.parent.mkdir(parents=True)
    lock.touch()
    ctx, r = make_ctx(tmp_path, [])  # nothing runs, not even the craig group
    assert cli.dispatch(ctx, "units-install", groups) == 1
    r.assert_done()
    err = capsys.readouterr().err
    assert f"a heartwood backfill is running ({lock} exists)" in err
    assert "would re-arm the units it paused. Nothing done." in err


def test_refuses_while_the_backfill_unit_is_active(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    world(tmp_path)
    ctx, r = make_ctx(tmp_path, [sc("is-active", "--quiet", "heartwood-backfill.service")])
    assert cli.dispatch(ctx, "units-install", ["heartwood-request"]) == 1
    r.assert_done()
    assert "(heartwood-backfill.service is active)" in capsys.readouterr().err


def test_other_groups_install_during_a_backfill(tmp_path: Path) -> None:
    """craig, alert and backup don't touch what the backfill paused: no check, no refusal."""
    src = world(tmp_path)
    lock = tmp_path / "state" / "heartwood" / "backfill.lock"
    lock.parent.mkdir(parents=True)
    lock.touch()
    steps: list[Step] = [
        sc("link", str(src / "craig-sync.service")),
        sc("link", str(src / "craig-sync.timer")),
        sc("daemon-reload"),
        sc("enable", "--now", "craig-sync.timer"),
        sc("list-timers", "craig-sync.timer", "--no-pager"),
    ]
    ctx, r = make_ctx(tmp_path, steps)
    assert cli.dispatch(ctx, "units-install", ["craig"]) == 0
    r.assert_done()


def test_unknown_group_is_64(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    world(tmp_path)
    ctx, r = make_ctx(tmp_path, [])
    assert cli.dispatch(ctx, "units-install", ["craig", "nope"]) == 64
    r.assert_done()
    assert "unknown group(s) nope" in capsys.readouterr().err


# --- sudoers ---------------------------------------------------------------------------------


def sudoers_steps(*, last_rc: int = 0) -> list[Step]:
    steps: list[Step] = []
    for name in ("astra-gdrive", "astra-ethtool"):
        src = f"deploy/systemd/sudoers.d/{name}"
        steps += [
            Call(["sudo", "visudo", "-cf", src]),
            Call(
                [
                    "sudo",
                    "install",
                    "-o",
                    "root",
                    "-g",
                    "root",
                    "-m",
                    "0440",
                    src,
                    f"/etc/sudoers.d/{name}",
                ]
            ),
        ]
    steps += [
        Call(["sudo", "-n", "-l", "/usr/bin/systemctl", "restart", "gdrive.service"], out="null"),
        Call(["sudo", "-n", "-l", "/usr/sbin/ethtool", "-r", "enp4s0"], out="null"),
        Call(
            ["sudo", "-n", "-l", "/usr/sbin/ethtool", "-s", "enp4s0", "advertise", "0x008"],
            rc=last_rc,
            out="null",
        ),
    ]
    return steps


def test_sudoers_install_checks_each_file_before_installing(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    ctx, r = make_ctx(tmp_path, sudoers_steps())
    assert cli.dispatch(ctx, "alert-sudoers-install", []) == 0
    r.assert_done()
    assert (
        "  OK — NIC 100FD fallback — watchdog can now self-heal the link" in capsys.readouterr().out
    )


def test_sudoers_install_stops_on_a_bad_file(tmp_path: Path) -> None:
    ctx, r = make_ctx(
        tmp_path, [Call(["sudo", "visudo", "-cf", "deploy/systemd/sudoers.d/astra-gdrive"], rc=1)]
    )
    assert cli.dispatch(ctx, "alert-sudoers-install", []) == 1
    r.assert_done()


def test_sudoers_install_reports_a_command_still_not_allowed(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    ctx, r = make_ctx(tmp_path, sudoers_steps(last_rc=1))
    assert cli.dispatch(ctx, "alert-sudoers-install", []) == 1
    r.assert_done()
    assert "NOT allowed — /usr/sbin/ethtool -s enp4s0 advertise 0x008" in capsys.readouterr().err


def test_the_sudoers_files_exist() -> None:
    for name in host.SUDOERS:
        assert (REPO / "deploy/systemd/sudoers.d" / name).is_file()


# --- portal module ---------------------------------------------------------------------------


def test_portal_module_install_builds_then_copies(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = tmp_path / "repo" / "apps" / "portal" / "module"
    foundry = tmp_path / "foundry"
    monkeypatch.setenv("FOUNDRY_DATA_DIR", str(foundry))

    def built() -> None:
        (module / "dist").mkdir(parents=True)
        (module / "module.json").write_text("{}")
        (module / "dist" / "main.js").write_text("js")

    steps: list[Step] = [Call(["pnpm", "--filter", "@astra/portal-module", "build"], effect=built)]
    ctx, r = make_ctx(tmp_path, steps)
    assert cli.dispatch(ctx, "portal-module-install", []) == 0
    r.assert_done()
    assert (foundry / "Data/modules/portal/dist/main.js").read_text() == "js"
    assert (foundry / "Data/modules/portal/module.json").read_text() == "{}"


def test_portal_module_install_reports_an_unwritable_dir(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """The backlog's EACCES: Foundry leaves the module dir root-owned."""
    if os.geteuid() == 0:
        pytest.skip("root ignores the mode")
    foundry = tmp_path / "foundry" / "Data" / "modules" / "portal"
    foundry.mkdir(parents=True)
    foundry.chmod(0o555)
    monkeypatch.setenv("FOUNDRY_DATA_DIR", str(tmp_path / "foundry"))
    ctx, r = make_ctx(tmp_path, [Call(["pnpm", "--filter", "@astra/portal-module", "build"])])
    try:
        assert cli.dispatch(ctx, "portal-module-install", []) == 1
    finally:
        foundry.chmod(0o755)
    r.assert_done()
    assert "Permission denied" in capsys.readouterr().err
