"""Summon-trait band check (spec 0030 D30-37, round 4).

Population = every main-list spell carrying the **trait** ``summon`` (not a
name-prefix match — the round-2/3 `ledger._SUMMON_TRAIT_RE` was DEAD CODE,
fixed alongside this module; see `ledger.py`). Real corpus: **n=14**,
matching the spec's pin exactly.

The declared curve (GM Screen's own "Summon Trait" journal page,
`gm-screen.json` entry ``S55aqwWIzpQRFhcq`` / page ``8gcp880pEWZ9VPnF`` —
re-verified byte-for-byte against the live snapshot at build, see
`verify_curve_against_journal`) maps a spell's RANK to the maximum creature
level it can summon:

    r1 -> -1, r2 -> 1, r3 -> 2, r4 -> 3, r5 -> 5,
    r6 -> 7, r7 -> 9, r8 -> 11, r9 -> 13, r10 -> 15

13 of the 14 summon-trait spells state this exact max level in their own
base (non-heightened) prose ("... whose level is N to fight for you" /
"... a common celestial ... of level N", en-dash **and** ASCII-hyphen
tolerant — the corpus uses both). Phantasmal Minion is the one miss: a
FIXED-creature summon (a specific bestiary Actor, not a level-scaled trait
choice) with no such prose at all — it still carries `population="summon"`
in the export, just with no `summonBand` (D30-38's kind-precedence note)."""

from __future__ import annotations

import re
from dataclasses import dataclass

#: The declared curve, GM-Screen-verified (see `verify_curve_against_journal`).
SUMMON_CURVE: dict[int, int] = {
    1: -1,
    2: 1,
    3: 2,
    4: 3,
    5: 5,
    6: 7,
    7: 9,
    8: 11,
    9: 13,
    10: 15,
}

#: En-dash (–, U+2013) AND unicode-minus (−, U+2212) tolerant, matching the
#: two real prose shapes in the corpus ("whose level is N (or lower) to
#: fight for you" / "a common X ... of level N").
_BASE_LEVEL_RE = re.compile(
    r"(?:whose level is|of level)\s+([-–−]?\d+)(?:\s+or lower)?", re.IGNORECASE
)


def extract_base_level(description_html: str) -> int | None:
    m = _BASE_LEVEL_RE.search(description_html or "")
    if not m:
        return None
    return int(m.group(1).replace("–", "-").replace("−", "-"))


@dataclass(frozen=True)
class SummonBand:
    base_level: int
    curve_level: int
    delta: int  # base_level - curve_level; 0 when the spell matches the declared curve


def summon_band(rank: int, description_html: str) -> SummonBand | None:
    """`None` when the base-level prose doesn't match (Phantasmal Minion) —
    the caller decides what to render for those (D30-38's kind precedence)."""
    base_level = extract_base_level(description_html)
    if base_level is None:
        return None
    curve_level = SUMMON_CURVE.get(rank)
    if curve_level is None:
        return None
    return SummonBand(
        base_level=base_level, curve_level=curve_level, delta=base_level - curve_level
    )


class SummonCurveDisagreementError(RuntimeError):
    """The GM Screen journal's own declared curve no longer matches
    `SUMMON_CURVE` — STOP (P6 discipline), never silently drift."""


def verify_curve_against_journal(journal_doc: dict, *, entry_id: str, page_id: str) -> None:
    """D30-37: verify the declared curve against the NAMED journal page at
    build time — raises `SummonCurveDisagreementError` on ANY mismatch."""
    if journal_doc.get("_id") != entry_id:
        raise SummonCurveDisagreementError(
            f"expected journal entry {entry_id!r}, got {journal_doc.get('_id')!r}"
        )
    page = next((p for p in journal_doc.get("pages", []) if p.get("_id") == page_id), None)
    if page is None:
        raise SummonCurveDisagreementError(f"journal page {page_id!r} not found")
    content = (page.get("text") or {}).get("content", "")
    rows = re.findall(r"<td>(\d+)(?:st|nd|rd|th)</td><td>([-–−]?\d+)</td>", content)
    if not rows:
        raise SummonCurveDisagreementError("could not parse the Summon Trait table at all")
    parsed = {int(rank): int(level.replace("–", "-").replace("−", "-")) for rank, level in rows}
    if parsed != SUMMON_CURVE:
        raise SummonCurveDisagreementError(
            f"journal table {parsed} disagrees with the declared SUMMON_CURVE {SUMMON_CURVE}"
        )
