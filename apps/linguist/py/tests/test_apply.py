"""Tests for the defs.kdl write-back CLI (G1) — `surface.apply`.

Pure (no LLM/network): the accepted-confirm selection + CLI over a reviewed candidates
file. The fragment encoding + idempotent `add_correction` text-insert are unit-tested in
`libs/py/lexicon/tests/test_corrections.py` (the corrections logic now lives there).
"""

from __future__ import annotations

import json
from pathlib import Path

from astra_linguist.surface.apply import accepted_confirms, main

_DEFS = (
    'entry "Anouk" {\n    variant "Anak"\n}\n'
    'entry "Hildebrandt" {\n    variant "Hilde Brand"\n}\n'
    'entry "Calaria" {\n    variant "Gal.ria"\n}\n'
)


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
    defs = tmp_path / "defs.kdl"
    defs.write_text(_DEFS, encoding="utf-8")
    cands = tmp_path / "2026-6-8.candidates.json"
    cands.write_text(json.dumps(_payload()), encoding="utf-8")

    assert main(["--candidates", str(cands), "--defs", str(defs)]) == 0
    out = defs.read_text()
    assert '    variant "Hiltabrand"' in out  # the one accepted confirm landed
    assert "Galaria" not in out  # rejected confirm did not
    assert "Thessian" not in out  # accepted `new` is not defs material
