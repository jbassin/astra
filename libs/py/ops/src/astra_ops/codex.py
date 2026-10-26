"""``codex-refresh`` and ``codex-build``: codex corpus releases, built on the host.

``codex-build [FLAGS]`` builds a release from the snapshots on disk and makes it current
(``pnpm --filter @astra/codex-ingest cli release build``, which stages, validates, renames to
``releases/<content hash>`` and swaps the ``releases/current`` symlink; a running codex follows
it per request). The flags go to that command verbatim (``--allow-shrink``, ``--force``). Then
it prints the first lines of the new release's ``corpus/report.md``.

``codex-refresh [FLAGS]`` first refuses when ``apps/codex/ingest`` has uncommitted changes (the
``corpus-manifest.json`` diff a refresh writes must be reviewable alone), then re-fetches the
Foundry and AoN snapshots and runs ``codex-build`` with its flags, in-process.

Both are host-only (the indexer peaks at about 3.8 GB RSS) and ask nothing, as the bash
recipes did. Exit codes: 1 a dirty ingest tree or an unreadable report; otherwise the first
failing child's code.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from .context import Ctx

INGEST_CLI = ["pnpm", "--filter", "@astra/codex-ingest", "cli"]
INGEST_DIR = "apps/codex/ingest"
#: How much of report.md codex-build prints (`head -n 40`).
REPORT_LINES = 40


def codex_refresh(ctx: Ctx, flags: Sequence[str]) -> int:
    dirty = ctx.capture(
        ["git", "-C", str(ctx.repo_root), "status", "--porcelain", "--", INGEST_DIR]
    )
    if dirty:
        ctx.err(f"codex-refresh: {INGEST_DIR} has uncommitted changes — commit or stash first")
        ctx.err("(the corpus-manifest.json diff from this refresh must be reviewable alone):")
        ctx.err(dirty)
        return 1
    ctx.out("codex-refresh: fetching Foundry snapshot...")
    ctx.check([*INGEST_CLI, "fetch-foundry"])
    ctx.out("codex-refresh: fetching AoN snapshot...")
    ctx.check([*INGEST_CLI, "fetch-aon"])
    return codex_build(ctx, flags)


def codex_build(ctx: Ctx, flags: Sequence[str]) -> int:
    (data_path,) = ctx.config("codex.data-path")
    ctx.check([*INGEST_CLI, "release", "build", *flags])
    report = Path(data_path) / "releases" / "current" / "corpus" / "report.md"
    ctx.out("")
    ctx.out("codex-build: report.md summary:")
    try:
        text = report.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        ctx.err(f"codex-build: cannot read {report}: {exc.strerror or exc}")
        return 1
    for line in text.splitlines()[:REPORT_LINES]:
        ctx.out(line)
    return 0
