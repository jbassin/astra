"""The run ledger — ``apps/heartwood-backend/agent-runs.jsonl`` (0033 D33-12, §5).

One JSON object per line, keys sorted, appended in commit order:

- a **publish** line per published run: ``date``, ``run_id``, ``campaign``, ``model``,
  ``sub_model``, ``cost_usd`` (a number, or ``null`` when any LM call reported no
  cost), ``counts`` ``{created, updated, moved, deleted}``, ``iterations``, ``tokens``;
- a **revert** line per ``just heartwood-revert``: ``{"date", "reverted": true,
  "run_id": <the reverted publish's run id>}``.

A date is *published* when its latest line is a publish (not a revert), so a session
can be published, reverted, and published again. The backfill skips published dates.

Budget (``backfill-budget-usd``): ``spent_usd`` sums ``cost_usd`` over **every**
publish line, reverted ones included (the money was spent). A ``null`` cost makes the
total unknowable, which ``has_unknown_cost`` reports so the backfill stops instead of
treating it as ``0``. Runs that ended ``incomplete``/``failed`` are never published, so
they are not in the ledger; the backfill stops on them anyway.

Writes happen only in the recipe's commit step, after validate + snapshot succeed.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from astra_akasha_backend.snapshot import REPO_ROOT

LEDGER_PATH = REPO_ROOT / "apps" / "heartwood-backend" / "agent-runs.jsonl"
COUNT_KEYS = ("created", "updated", "moved", "deleted")


class LedgerError(RuntimeError):
    """A ledger write the ledger's own state forbids (e.g. revert an unpublished date)."""


def _dump(entry: dict[str, Any]) -> str:
    return json.dumps(entry, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def entries(path: Path = LEDGER_PATH) -> list[dict[str, Any]]:
    """Every ledger line, oldest first (``[]`` when the file does not exist yet)."""
    if not path.is_file():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def _append(entry: dict[str, Any], path: Path) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(_dump(entry) + "\n")
    return entry


def latest(date: str, path: Path = LEDGER_PATH) -> dict[str, Any] | None:
    """The latest line for ``date``, or ``None``."""
    found = None
    for entry in entries(path):
        if entry.get("date") == date:
            found = entry
    return found


def is_published(date: str, path: Path = LEDGER_PATH) -> bool:
    entry = latest(date, path)
    return entry is not None and not entry.get("reverted", False)


def published_dates(path: Path = LEDGER_PATH) -> set[str]:
    """Dates whose latest line is a non-reverted publish."""
    last: dict[str, dict[str, Any]] = {}
    for entry in entries(path):
        last[entry["date"]] = entry
    return {d for d, e in last.items() if not e.get("reverted", False)}


def publish_entry(summary: dict[str, Any]) -> dict[str, Any]:
    """The ledger line for a run's ``summary.json``."""
    counts = summary.get("counts") or {}
    return {
        "date": summary["date"],
        "run_id": summary["run_id"],
        "campaign": summary.get("campaign"),
        "model": summary["model"],
        "sub_model": summary["sub_model"],
        "cost_usd": summary.get("cost_usd"),
        "counts": {k: counts.get(k) for k in COUNT_KEYS},
        "iterations": summary.get("iterations"),
        "tokens": summary.get("tokens"),
    }


def read_summary(run_dir: Path) -> dict[str, Any]:
    """``<run_dir>/summary.json``; raises ``FileNotFoundError`` when absent."""
    return json.loads((run_dir / "summary.json").read_text(encoding="utf-8"))


def append_publish(run_dir: Path, path: Path = LEDGER_PATH) -> dict[str, Any]:
    """Append the publish line for the run in ``run_dir``; return it.

    Raises ``LedgerError`` if the run's status is not ``ok`` or its ``run_id`` is
    already in the ledger (a double append).
    """
    summary = read_summary(run_dir)
    if summary.get("status") != "ok":
        raise LedgerError(f"run {run_dir} has status {summary.get('status')!r}, not 'ok'")
    entry = publish_entry(summary)
    if any(e.get("run_id") == entry["run_id"] for e in entries(path)):
        raise LedgerError(f"run {entry['run_id']} is already in the ledger")
    return _append(entry, path)


def append_revert(date: str, path: Path = LEDGER_PATH) -> dict[str, Any]:
    """Append a revert line for ``date``; return it.

    Raises ``LedgerError`` unless ``date``'s latest line is a non-reverted publish.
    """
    entry = latest(date, path)
    if entry is None or entry.get("reverted", False):
        raise LedgerError(f"{date} is not currently published (nothing to revert)")
    return _append({"date": date, "reverted": True, "run_id": entry.get("run_id")}, path)


def _publishes(path: Path) -> list[dict[str, Any]]:
    return [e for e in entries(path) if not e.get("reverted", False)]


def spent_usd(path: Path = LEDGER_PATH) -> float:
    """Sum of known ``cost_usd`` over every publish line (reverted runs included)."""
    return round(sum(e["cost_usd"] for e in _publishes(path) if e.get("cost_usd") is not None), 6)


def has_unknown_cost(path: Path = LEDGER_PATH) -> bool:
    """True when any publish line has ``cost_usd: null`` (the total is then unknowable)."""
    return any(e.get("cost_usd") is None for e in _publishes(path))


def budget_stop_reason(budget_usd: float, path: Path = LEDGER_PATH) -> str | None:
    """Why the backfill must not start another date, or ``None`` to go on.

    The rule, checked **before** each date: stop when any publish line has an unknown
    cost, or when ``spent_usd >= budget_usd``. A run's cost is unknown until it ends,
    so the last run may overshoot the budget by at most its own cost.
    """
    if has_unknown_cost(path):
        unknown = [e["date"] for e in _publishes(path) if e.get("cost_usd") is None]
        return f"ledger has runs with unknown cost ({', '.join(unknown)}); total spend unknowable"
    spent = spent_usd(path)
    if spent >= budget_usd:
        return f"spent ${spent:.2f} >= backfill budget ${budget_usd:.2f}"
    return None
