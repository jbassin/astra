"""Tests for the defs.yaml write-back (G1) — `corrections.add_correction` + `surface.apply`.

Pure (no LLM/network): fragment encoding, the minimal-diff text append, idempotency, and
the accepted-confirm selection + CLI over a reviewed candidates file.
"""

from __future__ import annotations

import json
from pathlib import Path

from astra_linguist.corrections import add_correction, escape_regex, to_fragment
from astra_linguist.surface.apply import accepted_confirms, main

_DEFS = "Anouk:\n  - Anak\nHildebrandt:\n  - Hilde Brand\nCalaria:\n  - Gal.ria\n"


def test_to_fragment_escapes_and_generalizes_whitespace() -> None:
    assert escape_regex("a.b+c") == r"a\.b\+c"
    assert to_fragment("Prime Marudine") == r"Prime\s*Marudine"  # words joined on \s*
    assert to_fragment("Alkahest  Freight") == r"Alkahest\s*Freight"  # collapses spacing
    assert to_fragment("   ") == ""


def test_add_correction_minimal_diff(tmp_path: Path) -> None:
    defs = tmp_path / "defs.yaml"
    defs.write_text(_DEFS, encoding="utf-8")
    res = add_correction("Hildebrandt", "Hiltabrand", defs)
    assert res.added and res.fragment == "Hiltabrand"
    # inserted right after Hildebrandt's last value; every other byte unchanged
    assert defs.read_text() == (
        "Anouk:\n  - Anak\nHildebrandt:\n  - Hilde Brand\n  - Hiltabrand\nCalaria:\n  - Gal.ria\n"
    )


def test_add_correction_multiword_fragment(tmp_path: Path) -> None:
    defs = tmp_path / "defs.yaml"
    defs.write_text(_DEFS, encoding="utf-8")
    res = add_correction("Hildebrandt", "Hilda Brandt", defs)
    assert res.added and res.fragment == r"Hilda\s*Brandt"
    assert r"  - Hilda\s*Brandt" in defs.read_text()


def test_add_correction_idempotent(tmp_path: Path) -> None:
    defs = tmp_path / "defs.yaml"
    defs.write_text(_DEFS, encoding="utf-8")
    assert add_correction("Hildebrandt", "Hiltabrand", defs).added
    assert not add_correction("Hildebrandt", "Hiltabrand", defs).added  # exact duplicate
    # an existing pattern that already matches the span → "already covered"
    covered = add_correction("Calaria", "Galaria", defs)  # 'Gal.ria' matches 'Galaria'
    assert not covered.added and covered.reason == "already covered"
    # a span equal to the canonical, and an empty span, are both refused
    assert add_correction("Calaria", "Calaria", defs).reason == "variant equals canonical"
    assert add_correction("Calaria", "  ", defs).reason == "empty span"


def test_add_correction_creates_block_for_absent_key(tmp_path: Path) -> None:
    defs = tmp_path / "defs.yaml"
    defs.write_text(_DEFS, encoding="utf-8")
    assert add_correction("Newforge", "Newforj", defs).added
    assert defs.read_text().endswith("Newforge:\n  - Newforj\n")


# ── selection + CLI ─────────────────────────────────────────────────────────
def _payload() -> dict:
    return {
        "session": "2026-6-8",
        "candidates": [
            {
                "span": "Hiltabrand",
                "verdict": "confirm",
                "suggested_canonical": "Hildebrandt",
                "decision": "accept",
            },
            {
                "span": "Galaria",
                "verdict": "confirm",
                "suggested_canonical": "Calaria",
                "decision": "reject",
            },
            {
                "span": "Thessian",
                "verdict": "new",
                "suggested_canonical": None,
                "decision": "accept",
            },
            {"span": "Anak", "verdict": "confirm", "suggested_canonical": "Anouk"},  # pending
        ],
    }


def test_accepted_confirms_selects_only_accepted_confirms() -> None:
    picked = accepted_confirms(_payload())
    assert [(r["span"], r["suggested_canonical"]) for r in picked] == [
        ("Hiltabrand", "Hildebrandt")
    ]


def test_apply_main_writes_accepted_confirm(tmp_path: Path) -> None:
    defs = tmp_path / "defs.yaml"
    defs.write_text(_DEFS, encoding="utf-8")
    cands = tmp_path / "2026-6-8.candidates.json"
    cands.write_text(json.dumps(_payload()), encoding="utf-8")

    assert main(["--candidates", str(cands), "--defs", str(defs)]) == 0
    out = defs.read_text()
    assert "  - Hiltabrand" in out  # the one accepted confirm landed
    assert "Galaria" not in out  # rejected confirm did not
    assert "Thessian" not in out  # accepted `new` is not defs.yaml material
