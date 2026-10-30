"""One-off backfill of the ``campaigns`` frontmatter from heartwood's published history.

Pages published before ``stamp_campaign`` existed carry no ``campaigns``. This rebuilds
each page's list from the record of every run: the ledger (``heartwood/agent-runs.jsonl``
in an astra-data root) in order, and each run's ``changeset.json`` under
``<artifacts>/<date>/<run_id>/``. A run without a ``changeset.json`` is replayed from its
``ops.jsonl`` and ``baseline.json`` with ``Workspace.changeset``; a run with neither is
reported and skipped. Reverted runs are skipped.

The replay follows the same rules as the stamp: a created page starts with the run's
campaign; an updated page gains it; a moved page keeps its list at the new path and gains
it; a deleted page drops its list. A page no run touched gets nothing. A history path with
no page now whose ``<path>/index`` exists (a page turned into a folder by hand) hands its
list to that index page; any other such path is reported. The rebuilt list is
merged with whatever the page already holds (history first), so a hand-set campaign is
never removed and a second pass changes nothing.

``apps/heartwood/py/scripts/backfill_campaigns.py`` is the command; see the heartwood
README.
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from .campaigns import merge, page_campaigns, set_campaigns
from .workspace import PAGE_SUFFIX, ChangeSet, Workspace, path_key

LEDGER = Path("heartwood/agent-runs.jsonl")
CONTENT = Path("akasha/content")


@dataclass
class Run:
    """One published run: its ledger line and its change-set (``None`` if unreadable)."""

    date: str
    run_id: str
    campaign: str
    changeset: ChangeSet | None
    error: str | None = None


@dataclass
class Report:
    runs: int = 0
    reverted: list[str] = field(default_factory=list)
    unreadable: list[str] = field(default_factory=list)
    from_journal: list[str] = field(default_factory=list)
    pages: int = 0
    with_history: int = 0
    changed: list[str] = field(default_factory=list)
    #: History paths with no page now and no ``<path>/index`` (moved, merged or deleted by
    #: hand since); their campaigns are lost.
    missing: list[str] = field(default_factory=list)
    per_campaign: Counter[str] = field(default_factory=Counter)
    several: dict[str, list[str]] = field(default_factory=dict)

    def lines(self) -> list[str]:
        return [
            f"runs replayed: {self.runs - len(self.unreadable)} of {self.runs}"
            + (f" ({len(self.from_journal)} from ops.jsonl)" if self.from_journal else ""),
            f"reverted runs skipped: {len(self.reverted)}",
            f"unreadable runs skipped: {len(self.unreadable)}",
            *(f"  {u}" for u in self.unreadable),
            f"pages: {self.pages}; with history: {self.with_history}; "
            f"no history: {self.pages - self.with_history}",
            f"pages to change: {len(self.changed)}",
            f"history paths with no page now: {len(self.missing)}",
            *(f"  {m}" for m in self.missing),
            "pages per campaign:",
            *(f"  {c}: {n}" for c, n in sorted(self.per_campaign.items(), key=lambda x: -x[1])),
            f"pages with several campaigns: {len(self.several)}",
            *(f"  {p}: {', '.join(cs)}" for p, cs in sorted(self.several.items())),
        ]


def _read_changeset(run_dir: Path) -> tuple[ChangeSet, bool]:
    """The run's change-set and whether it came from the journal rather than the file."""
    file = run_dir / "changeset.json"
    if file.is_file():
        return ChangeSet.model_validate_json(file.read_text(encoding="utf-8")), False
    return Workspace.open(run_dir).changeset(), True


def load_runs(ledger: Path, artifacts: Path, report: Report) -> list[Run]:
    """Every published, non-reverted run in ledger order, with its change-set."""
    rows = [json.loads(line) for line in ledger.read_text(encoding="utf-8").splitlines() if line]
    reverted = {r["run_id"] for r in rows if r.get("reverted")}
    runs: list[Run] = []
    for row in rows:
        if row.get("reverted"):
            continue
        label = f"{row['date']}/{row['run_id']}"
        if row["run_id"] in reverted:
            report.reverted.append(label)
            continue
        report.runs += 1
        try:
            cs, journal = _read_changeset(artifacts / row["date"] / row["run_id"])
        except (OSError, ValueError, RuntimeError, KeyError) as exc:  # reported, not fatal
            report.unreadable.append(f"{label}: {type(exc).__name__}: {exc}")
            runs.append(Run(row["date"], row["run_id"], row["campaign"], None, str(exc)))
            continue
        if journal:
            report.from_journal.append(label)
        runs.append(Run(row["date"], row["run_id"], row["campaign"], cs))
    return runs


def replay(runs: list[Run]) -> dict[str, list[str]]:
    """``{path: campaigns}`` after applying every readable run in order."""
    state: dict[str, list[str]] = {}
    for run in runs:
        cs = run.changeset
        if cs is None:
            continue
        # Moves read the state before this run (a swap or a move-then-recreate stays right).
        carried = {m.dst: state.pop(m.src, []) for m in cs.moved}
        for path in cs.deleted:
            state.pop(path, None)
        for path in cs.created:
            state[path] = [run.campaign]
        for dst, before in carried.items():
            state[dst] = merge(before, [run.campaign])
        for path in cs.updated:
            state[path] = merge(state.get(path, []), [run.campaign])
    return state


def backfill(root: Path, artifacts: Path, *, write: bool, forbidden: Path | None = None) -> Report:
    """Rebuild ``campaigns`` for every page under ``root``'s content; write only if ``write``.

    Raises ``ValueError`` when ``write`` and ``root`` resolves to ``forbidden`` (the live
    clone).
    """
    if write and forbidden is not None and root.resolve() == forbidden.resolve():
        raise ValueError(
            f"refusing to write into {forbidden} (the live clone); "
            "run against your own astra-data clone"
        )
    report = Report()
    history = replay(load_runs(root / LEDGER, artifacts, report))
    content = root / CONTENT
    files = sorted(content.rglob(f"*{PAGE_SUFFIX}"))
    present = {path_key(content, f) for f in files}
    # A page later turned into a folder by hand (`X` → `X/index`) keeps its history.
    for path in sorted(p for p in history if p not in present and f"{p}/index" in present):
        history[f"{path}/index"] = merge(history.get(f"{path}/index", []), history.pop(path))
    report.missing = sorted(p for p in history if p not in present)
    for file in files:
        report.pages += 1
        key = path_key(content, file)
        text = file.read_text(encoding="utf-8")
        wanted = merge(history.get(key, []), page_campaigns(text))
        if key in history:
            report.with_history += 1
        report.per_campaign.update(wanted)
        if len(wanted) > 1:
            report.several[key] = wanted
        new = set_campaigns(text, wanted)
        if new != text:
            report.changed.append(key)
            if write:
                file.write_text(new, encoding="utf-8")
    return report
