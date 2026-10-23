"""Damage-formula parsing — ``NdM``, ``NdM+K``, flat integers; reject the rest.

Foundry damage entries carry a ``formula`` string. Round 1 only needs the
average value (EV), so this module is deliberately narrow: it recognizes the
shapes the corpus actually contains (§1 census: 357 ``NdM``, 5 ``NdM+K``,
18 flat) and rejects anything else with a reason string for the skip ledger
(e.g. the one ``@item.rank`` focus-spell formula, out of round-1 scope).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_DICE_RE = re.compile(r"^(\d+)d(\d+)\s*([+-]\s*\d+)?$", re.IGNORECASE)
_FLAT_RE = re.compile(r"^-?\d+$")


@dataclass(frozen=True)
class FormulaResult:
    raw: str
    ok: bool
    kind: str  # "dice" | "flat" | "rejected"
    ev: float  # 0.0 when not ok
    reason: str | None = None  # why it was rejected, when not ok


def parse_formula(formula: str) -> FormulaResult:
    """Parse one damage-entry ``formula`` string into an expected value."""
    raw = formula.strip()
    if not raw:
        return FormulaResult(raw=raw, ok=False, kind="rejected", ev=0.0, reason="empty formula")

    m = _DICE_RE.match(raw)
    if m:
        n = int(m.group(1))
        sides = int(m.group(2))
        flat = int(m.group(3).replace(" ", "")) if m.group(3) else 0
        ev = n * (sides + 1) / 2 + flat
        return FormulaResult(raw=raw, ok=True, kind="dice", ev=ev)

    if _FLAT_RE.match(raw):
        return FormulaResult(raw=raw, ok=True, kind="flat", ev=float(int(raw)))

    return FormulaResult(
        raw=raw, ok=False, kind="rejected", ev=0.0, reason=f"unrecognized formula shape: {raw!r}"
    )
