"""Host installs: the systemd user units, the watchdog's sudoers drop-ins and the Foundry
module fallback (moved from the justfile).

**units-install [GROUP...]** links each group's units (``deploy/systemd/units.txt``; no group =
all of them) from the deploy checkout into ``~/.config/systemd/user``, runs daemon-reload,
then enables (``--now``) the group's timer and path units. Idempotent: a unit already linked
to the same file is left alone; a regular-file copy from the old ``cp`` installs (which
``systemctl link`` refuses to overwrite) or a link into another tree is removed first. The
units' files change whenever a deploy checks out a new commit: re-run this (or daemon-reload)
after a deploy that edits a unit, or systemd keeps running the old one. While a heartwood
backfill runs (its ``backfill.lock`` exists or ``heartwood-backfill.service`` is active) it
refuses, exit 1, any selection that includes ``linguist-commit`` or ``heartwood-request`` (the
no-group default does): enabling them would re-arm the units the backfill paused. Lingering
(``loginctl enable-linger``) lets the timers run without a login; it is already on.

**alert-sudoers-install** is a one-time ROOT step: it installs the NOPASSWD sudoers drop-ins
the watchdog's auto-remediations need (``astra-gdrive``: restart gdrive.service when the Drive
mount vanishes; ``astra-ethtool``: retrain or renegotiate a frame-corrupting NIC link). Each file
passes ``visudo -c`` before it is installed, so a bad file can never lock sudo. The check
afterwards is non-destructive (``sudo -n -l <cmd>`` never runs the command).

**portal-module-install** is the file-drop FALLBACK for the Foundry module (the primary install path
is the Manifest URL, which Foundry fetches itself): build the module, then copy module.json and
dist/main.js into the live Foundry data dir's ``Data/modules/portal/`` (``FOUNDRY_DATA_DIR``).
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from .backfill import UNIT as BACKFILL_UNIT
from .backfill import heartwood_dir
from .context import Ctx, Fail, deploy

#: Printed after a group installs (what the old install recipes printed).
NOTES = {
    "alert": [
        "smoke-test a Discord page with: {deploy_root}/deploy/systemd/alert-notify.sh test",
        "one-time root step for vanished-mount auto-remediation: just alert-sudoers-install",
    ],
}
#: Groups that need the data root's dirs first (heartwood-request.path watches one).
NEEDS_DATA_DIRS = frozenset({"heartwood-request"})
#: Groups whose timer and path units a running heartwood backfill has stopped on purpose;
#: installing them (`enable --now`) would re-arm them under it.
BACKFILL_PAUSED = frozenset({"linguist-commit", "heartwood-request"})

SUDOERS = ("astra-gdrive", "astra-ethtool")
SUDO_CHECKS = (
    (["/usr/bin/systemctl", "restart", "gdrive.service"], "gdrive restart"),
    (["/usr/sbin/ethtool", "-r", "enp4s0"], "NIC retrain"),
    (
        ["/usr/sbin/ethtool", "-s", "enp4s0", "advertise", "0x008"],
        "NIC 100FD fallback — watchdog can now self-heal the link",
    ),
)

DEFAULT_FOUNDRY_DATA = "/emerald/data/apps/apps/foundry_faerrin/data"


def unit_groups(repo_root: Path) -> dict[str, list[str]]:
    """``deploy/systemd/units.txt``: group -> units, in file order."""
    groups: dict[str, list[str]] = {}
    for line in (repo_root / "deploy" / "systemd" / "units.txt").read_text().splitlines():
        words = line.split()
        if words and not words[0].startswith("#"):
            groups[words[0]] = words[1:]
    return groups


def systemctl(*args: str) -> list[str]:
    return ["systemctl", "--user", *args]


def unit_link(ctx: Ctx, units: list[str]) -> None:
    """Link ``units`` from the deploy checkout, then daemon-reload (module docstring)."""
    unit_dir = ctx.home / ".config" / "systemd" / "user"
    unit_dir.mkdir(parents=True, exist_ok=True)
    for name in units:
        src = ctx.deploy_root / "deploy" / "systemd" / name
        dst = unit_dir / name
        if not src.is_file():
            ctx.err(f"unit-link: {src} missing — deploy a commit that has it first (just deploy)")
            raise Fail(1)
        if dst.is_symlink() and str(dst.readlink()) == str(src):
            continue
        if dst.is_symlink() or dst.exists():
            dst.unlink()
            ctx.out(f"unit-link: replaced old {dst}")
        ctx.check(systemctl("link", str(src)))
    ctx.check(systemctl("daemon-reload"))


def install_group(ctx: Ctx, group: str, units: list[str]) -> None:
    if group in NEEDS_DATA_DIRS:
        rc = deploy(ctx, "--init-artifacts")  # `just artifacts-init`
        if rc != 0:
            raise Fail(rc)
    unit_link(ctx, units)
    timers = [u for u in units if u.endswith(".timer")]
    triggers = [u for u in units if u.endswith((".timer", ".path"))]
    if triggers:
        ctx.check(systemctl("enable", "--now", *triggers))
    ctx.out(f"units-install {group}: linked {' '.join(units)}")
    if timers:
        ctx.out("timer schedule:")
        ctx.check(systemctl("list-timers", *timers, "--no-pager"))
    for path_unit in (u for u in units if u.endswith(".path")):
        ctx.out(f"path unit {path_unit}: {ctx.output(systemctl('is-active', path_unit))}")
    for note in NOTES.get(group, []):
        ctx.out(note.format(deploy_root=ctx.deploy_root))


def backfill_running(ctx: Ctx) -> str:
    """Why a heartwood backfill counts as running ("" when it does not): its watchdog lock
    file exists, or its transient unit is active."""
    lock = heartwood_dir(ctx) / "backfill.lock"
    if lock.exists():
        return f"{lock} exists"
    if ctx.run(systemctl("is-active", "--quiet", f"{BACKFILL_UNIT}.service")) == 0:
        return f"{BACKFILL_UNIT}.service is active"
    return ""


def units_install(ctx: Ctx, args: list[str]) -> int:
    groups = unit_groups(ctx.repo_root)
    unknown = [g for g in args if g not in groups]
    if unknown:
        ctx.err(f"units-install: unknown group(s) {' '.join(unknown)} (groups: {' '.join(groups)})")
        return 64
    selected = args or list(groups)
    paused = [g for g in selected if g in BACKFILL_PAUSED]
    if paused and (why := backfill_running(ctx)):
        ctx.err(
            f"units-install: refusing — a heartwood backfill is running ({why}). Installing "
            f"{' '.join(paused)} would re-arm the units it paused. Nothing done. Let it finish "
            "(or stop it: systemctl --user stop heartwood-backfill; after a hard kill: just "
            "heartwood-backfill-reset), or name only other groups."
        )
        return 1
    for group in selected:
        install_group(ctx, group, groups[group])
    return 0


def alert_sudoers_install(ctx: Ctx) -> int:
    """Install and check the watchdog's sudoers drop-ins (module docstring). Exit 1 when a
    check shows a command is still not allowed without a password."""
    for name in SUDOERS:
        src = f"deploy/systemd/sudoers.d/{name}"
        ctx.check(["sudo", "visudo", "-cf", src])  # syntax-check BEFORE touching /etc
        dst = f"/etc/sudoers.d/{name}"
        ctx.check(["sudo", "install", "-o", "root", "-g", "root", "-m", "0440", src, dst])
        ctx.out(f"installed /etc/sudoers.d/{name}")
    ctx.out("verifying passwordless commands are allowed:")
    failed = 0
    for cmd, label in SUDO_CHECKS:
        if ctx.run(["sudo", "-n", "-l", *cmd], out="null") == 0:
            ctx.out(f"  OK — {label}")
        else:
            ctx.err(f"  NOT allowed — {' '.join(cmd)}")
            failed += 1
    return 1 if failed else 0


def portal_module_install(ctx: Ctx) -> int:
    """Build the Foundry module and drop it into the live Foundry data dir (module
    docstring). Foundry re-reads module.json on the next world launch or module refresh."""
    ctx.check(["pnpm", "--filter", "@astra/portal-module", "build"])  # `just portal-module-build`
    data = os.environ.get("FOUNDRY_DATA_DIR") or DEFAULT_FOUNDRY_DATA
    dest = Path(data) / "Data" / "modules" / "portal"
    module = ctx.repo_root / "apps" / "portal" / "module"
    try:
        (dest / "dist").mkdir(parents=True, exist_ok=True)
        shutil.copyfile(module / "module.json", dest / "module.json")
        shutil.copyfile(module / "dist" / "main.js", dest / "dist" / "main.js")
    except OSError as exc:
        ctx.err(f"portal-module-install: {exc.filename}: {exc.strerror}")
        return 1
    ctx.out(f"installed portal module -> {dest} (restart/refresh Foundry to pick it up)")
    return 0
