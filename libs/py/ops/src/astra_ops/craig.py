"""craig-sync: bridge new Craig recordings from the Drive FUSE mount into scribe's local
incoming dir (moved from the justfile; same steps, children and exit codes).

Docker can't bind-mount the google-drive-ocamlfuse mount (it is not in the daemon's
namespace), so the host copies new zips down; the craig_drop_sensor, watching the local dir,
then runs the pipeline. craig-sync.timer runs it every 5 minutes. Idempotent: a zip already in
the incoming dir is skipped, and each copy lands in its own ``<name>.<random>.partial`` and is
renamed into place, so the sensor (which globs ``*.zip``) never sees a half-downloaded file,
and a copy abandoned on a wedged mount can never write the file a later run renames.

**The watchdog.** Every access to the mount (the listing and each copy) runs through
``Ctx.bounded``: in the background, polled, never waited on. A process blocked on a wedged FUSE
mount sits in uninterruptible D state, where no signal reaps it, and waiting for it would hang
this oneshot too (a hung mount once stalled it in ``activating`` for hours, so the timer never
re-armed and the pipeline silently stalled at the front door). On a timeout the child is
abandoned and the command exits 1, so the unit FAILS: a failed unit is visible, pages through
``OnFailure=``, and lets the timer compute its next trigger.

Limits: ``CRAIG_SYNC_PROBE_TIMEOUT`` (default 20 s; listing the mount is near-instant) and
``CRAIG_SYNC_COPY_TIMEOUT`` (default 900 s; a real ~1 GB recording takes minutes over Drive).
The source is the ``--craig-drop-dir`` option (the justfile's ``CRAIG_DROP_DIR``); the
destination is config ``scribe.incoming-path``, on local disk.
"""

from __future__ import annotations

import contextlib
import glob
import os
import tempfile
from pathlib import Path

from .context import Ctx, Fail

#: Lists ``$1/*.zip``, one per line. A fixed script: the mount path arrives as ``$1``. The bare
#: glob's readdir is itself a mount access that can wedge, hence a child under the watchdog.
LIST_SH = 'shopt -s nullglob; for f in "$1"/*.zip; do printf "%s\\n" "$f"; done'


def _seconds(var: str, default: int) -> int:
    """``${VAR:-default}`` as a whole number of seconds (bash's ``-ge`` needs an integer)."""
    raw = os.environ.get(var) or str(default)
    try:
        return int(raw)
    except ValueError:
        Ctx.err(f"craig-sync: {var}={raw!r} is not a whole number of seconds")
        raise Fail(1) from None


def _unique_partial(dest: str, base: str) -> Path:
    """A fresh ``<base>.<random>.partial`` in ``dest``, made by this run only.

    A copy abandoned on a wedged mount can wake up later and keep writing; with a per-run
    name it only ever writes its own partial, never one a later run renames into place. The
    name never ends in ``.zip``, so scribe (which globs ``*.zip``) ignores leftovers. mkstemp
    makes the file 0600; it gets the umask mode ``cp`` would have given a new file."""
    fd, name = tempfile.mkstemp(dir=dest, prefix=f"{base}.", suffix=".partial")
    os.close(fd)
    umask = os.umask(0)
    os.umask(umask)
    Path(name).chmod(0o666 & ~umask)
    return Path(name)


def craig_sync(ctx: Ctx) -> int:
    """Copy every new ``*.zip`` from the mount into the incoming dir; exit 1 on a stalled
    mount (module docstring)."""
    src = str(ctx.craig_drop_dir)
    try:
        (dest,) = ctx.config("scribe.incoming-path")
    except Exception:  # noqa: BLE001 -- any config failure: the same refusal as a bad value
        dest = ""
    if not dest.startswith("/") or dest == "/":
        ctx.err("craig-sync: ERROR — could not read scribe.incoming-path from config")
        return 1
    probe_timeout = _seconds("CRAIG_SYNC_PROBE_TIMEOUT", 20)
    copy_timeout = _seconds("CRAIG_SYNC_COPY_TIMEOUT", 900)
    try:
        Path(dest).mkdir(parents=True, exist_ok=True)  # local disk, never the FUSE mount
    except OSError as exc:
        ctx.err(f"mkdir: cannot create directory '{dest}': {exc.strerror}")
        return 1

    with tempfile.NamedTemporaryFile(prefix="craig-sync.") as listing:
        listing_path = Path(listing.name)
        rc = ctx.bounded(
            ["bash", "-c", LIST_SH, "_", src], limit=probe_timeout, out_path=listing_path
        )
        if rc != 0:
            ctx.err(
                f"craig-sync: ERROR — Drive mount '{src}' unresponsive (>{probe_timeout}s); "
                "failing so the unit is visible/alertable."
            )
            return 1
        names = listing_path.read_bytes().decode("utf-8", "surrogateescape").split("\n")

    synced = 0
    for f in names:
        if not f:
            continue
        base = Path(f).name
        final = Path(dest, base)
        if final.exists():
            continue  # already synced: no re-download
        try:
            partial = _unique_partial(dest, base)
        except OSError as exc:
            ctx.err(f"craig-sync: ERROR — cannot create a partial file in {dest}: {exc.strerror}")
            return 1
        if ctx.bounded(["cp", f, str(partial)], limit=copy_timeout) != 0:
            with contextlib.suppress(OSError):
                partial.unlink()  # so a later run retries cleanly
            ctx.err(
                f"craig-sync: ERROR — copy of {base} timed out (>{copy_timeout}s, mount "
                "stalled); failing."
            )
            return 1
        try:
            partial.rename(final)  # atomic: the sensor sees only complete zips
        except OSError as exc:
            ctx.err(f"mv: cannot move '{partial}' to '{final}': {exc.strerror}")
            return 1
        ctx.out(f"craig-sync: synced {base}")
        synced += 1
    # The shell's `"$dest"/*.zip`: glob.glob skips dotfiles like the shell; Path.glob does not.
    total = len(glob.glob(f"{glob.escape(dest)}/*.zip"))  # noqa: PTH207 -- shell glob semantics
    ctx.out(f"craig-sync: {synced} new, {total} total in incoming")
    return 0
