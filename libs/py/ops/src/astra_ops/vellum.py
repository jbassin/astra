"""``vellum-parity-live``: the vellum parity check over the real wiki (read-only).

Runs ``libs/py/vellum-lang/scripts/corpus_parity.py`` over config's ``data.akasha-content``
(the wiki in the astra-data clone): the Python and TS vellum parsers must produce the same
metadata for every page. CI runs the same script over the fixtures only (``just
vellum-parity``); ``astra-vellum-parity.timer`` runs this daily and pages through
``astra-alert@`` when it fails.

Steps and locks: find node (PATH, else the newest nvm install; a systemd unit's PATH has
neither, and the script calls bare ``node``, so its directory goes first on PATH), then take
``git-publish`` shared (a publisher is never mid-write to the wiki while this reads it) and
then ``host-tooling`` shared (a deploy never re-syncs the venv or the vellum-lang node deps
under it), run the script, release both. Nothing is written.

Exit codes: 0 the parsers agree, or a lock stayed busy past the wait (a publisher or deploy
ran long; the next run checks, so a busy lock never pages); 127 node not found; otherwise the
script's code (1 when any page differs or the TS half fails).
"""

from __future__ import annotations

from pathlib import Path

from .context import Ctx
from .heartwood import find_node

SCRIPT = Path("libs/py/vellum-lang/scripts/corpus_parity.py")


def parity_argv(ctx: Ctx, content: str) -> list[str]:
    return ctx.uv_run("python", str(ctx.repo_root / SCRIPT), "--dir", content)


def vellum_parity_live(ctx: Ctx) -> int:
    node = find_node(ctx)
    if not node:
        ctx.err("vellum-parity-live: node not found (PATH or ~/.nvm) — nothing checked")
        return 127
    (content,) = ctx.config("data.akasha-content")
    gp = ctx.lock("git-publish", shared=True)
    ht = ctx.lock("host-tooling", shared=True)
    try:
        for lock in (gp, ht):
            if not lock.acquire():
                ctx.err(
                    f"vellum-parity-live: the {lock.name} lock stayed busy — skipped this run "
                    "(nothing checked)"
                )
                return 0
        ctx.prepend_path(Path(node).parent)
        return ctx.run(parity_argv(ctx, content))
    finally:
        ht.release()
        gp.release()
