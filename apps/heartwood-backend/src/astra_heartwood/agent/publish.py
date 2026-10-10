"""Publish-step helpers for ``just heartwood-agent`` / ``heartwood-revert`` (0033 §5).

- ``commit_message(run_dir)`` — the session commit's full message: subject
  ``feat(akasha): heartwood agent <date>``, then counts + model + cost, then the agent's
  changelog. Every line is wrapped to ``BODY_WIDTH`` (commitlint's
  ``body-max-line-length``); markdown bullets wrap with a hanging indent.
- ``unresolved_delta(before, after)`` — the unresolved-link report the recipe prints
  after ``akasha-snapshot`` (reported, never enforced).
"""

from __future__ import annotations

import json
import re
import textwrap
from pathlib import Path
from typing import Any

from astra_akasha_backend.snapshot import SNAPSHOT_PATH

from .ledger import COUNT_KEYS, read_summary

BODY_WIDTH = 100
_BULLET = re.compile(r"^(\s*(?:[-*+]|\d+[.)])\s+)")


def wrap_line(line: str, width: int = BODY_WIDTH) -> list[str]:
    """Wrap one markdown line to ``width``; continuation lines align under bullet text.

    Words longer than ``width`` are broken (commitlint rejects any longer line).
    """
    line = line.rstrip()
    if len(line) <= width:
        return [line]
    m = _BULLET.match(line)
    indent = " " * len(m.group(1)) if m else line[: len(line) - len(line.lstrip())]
    return textwrap.wrap(
        line,
        width=width,
        subsequent_indent=indent,
        break_long_words=True,
        break_on_hyphens=False,
    )


def wrap_text(text: str, width: int = BODY_WIDTH) -> str:
    return "\n".join(out for line in text.splitlines() for out in wrap_line(line, width))


def _fmt_cost(cost: float | None) -> str:
    return f"${cost:.4f}" if cost is not None else "unknown"


def commit_message(run_dir: Path, summary: dict[str, Any] | None = None) -> str:
    """The commit message (subject, blank line, body) for the run in ``run_dir``."""
    s = summary if summary is not None else read_summary(run_dir)
    counts = s.get("counts") or {}
    pages = ", ".join(
        f"{counts.get(k) if counts.get(k) is not None else '?'} {k}" for k in COUNT_KEYS
    )
    tokens = s.get("tokens")
    cost = f"Cost: {_fmt_cost(s.get('cost_usd'))}"
    if isinstance(tokens, int):
        cost += f" ({s.get('iterations')} iterations, {tokens:,} tokens)"
    head = [
        f"Pages: {pages}",
        f"Model: {s['model']} (sub-model: {s['sub_model']})",
        cost,
        f"Run: {s['run_id']} ({s.get('campaign')})",
    ]
    changelog = str(s.get("changelog") or "").strip() or "(the agent wrote no changelog)"
    body = wrap_text("\n".join(head)) + "\n\nChangelog:\n" + wrap_text(changelog)
    return f"feat(akasha): heartwood agent {s['date']}\n\n{body}\n"


def _unresolved(path: Path) -> list[tuple[str, str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return sorted((u["source"], u["target"]) for u in data["unresolved"])


def unresolved_delta(before: Path, after: Path = SNAPSHOT_PATH, limit: int = 25) -> str:
    """Human report of unresolved links ``before`` → ``after`` (two snapshot JSONs)."""
    old, new = _unresolved(before), _unresolved(after)
    added = sorted(set(new) - set(old))
    fixed = sorted(set(old) - set(new))
    lines = [f"unresolved links: {len(old)} -> {len(new)} ({len(new) - len(old):+d})"]
    for label, items in (("new", added), ("fixed", fixed)):
        for source, target in items[:limit]:
            lines.append(f"  {label}: {source} -> [[{target}]]")
        if len(items) > limit:
            lines.append(f"  … {len(items) - limit} more {label}")
    return "\n".join(lines)
