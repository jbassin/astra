"""astra-lexicon corrections tests — KDL defs replacer + minimal-diff write-back.

Lifted from linguist's test_apply (the corrections behaviors), retargeted to the
KDL `defs.kdl` format: fragment encoding, the replacer, and the idempotent
`add_correction` text-insert (a clean PR diff, not a full re-emit).
"""

from __future__ import annotations

from pathlib import Path

from astra_lexicon import (
    add_correction,
    build_replacer,
    escape_regex,
    load_corrections,
    load_defs,
    to_fragment,
)

_DEFS = (
    'entry "Anouk" {\n    variant "Anak"\n}\n'
    'entry "Hildebrandt" {\n    variant "Hilde Brand"\n}\n'
    'entry "Calaria" {\n    variant "Gal.ria"\n}\n'
)


def test_to_fragment_escapes_and_generalizes_whitespace() -> None:
    assert escape_regex("a.b+c") == r"a\.b\+c"
    assert to_fragment("Prime Marudine") == r"Prime\s*Marudine"  # words joined on \s*
    assert to_fragment("Alkahest  Freight") == r"Alkahest\s*Freight"  # collapses spacing
    assert to_fragment("   ") == ""


def test_load_defs_and_replacer_round_trip(tmp_path: Path) -> None:
    defs = tmp_path / "defs.kdl"
    defs.write_text(_DEFS, encoding="utf-8")
    parsed = load_defs(defs)
    assert parsed["Anouk"] == ["Anak"]
    assert parsed["Calaria"] == ["Gal.ria"]
    replace = build_replacer(parsed)
    assert replace("we met Anak today") == "we met Anouk today"


def test_add_correction_minimal_diff(tmp_path: Path) -> None:
    defs = tmp_path / "defs.kdl"
    defs.write_text(_DEFS, encoding="utf-8")
    res = add_correction("Hildebrandt", "Hiltabrand", defs)
    assert res.added and res.fragment == "Hiltabrand"
    # inserted before Hildebrandt's closing brace; every other byte unchanged
    assert defs.read_text() == (
        'entry "Anouk" {\n    variant "Anak"\n}\n'
        'entry "Hildebrandt" {\n    variant "Hilde Brand"\n    variant "Hiltabrand"\n}\n'
        'entry "Calaria" {\n    variant "Gal.ria"\n}\n'
    )


def test_add_correction_multiword_fragment(tmp_path: Path) -> None:
    defs = tmp_path / "defs.kdl"
    defs.write_text(_DEFS, encoding="utf-8")
    res = add_correction("Hildebrandt", "Hilda Brandt", defs)
    assert res.added and res.fragment == r"Hilda\s*Brandt"
    # the backslash is KDL-escaped on disk but round-trips back to the exact fragment
    assert r"Hilda\s*Brandt" in load_defs(defs)["Hildebrandt"]


def test_add_correction_idempotent(tmp_path: Path) -> None:
    defs = tmp_path / "defs.kdl"
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
    defs = tmp_path / "defs.kdl"
    defs.write_text(_DEFS, encoding="utf-8")
    assert add_correction("Newforge", "Newforj", defs).added
    assert defs.read_text().endswith('entry "Newforge" {\n    variant "Newforj"\n}\n')
    # the freshly written block round-trips through the parser
    assert load_defs(defs)["Newforge"] == ["Newforj"]


def test_load_corrections_over_real_defs() -> None:
    """The shipped defs.kdl loads and corrects a known real garble (Anak → Anouk)."""
    replace = load_corrections()
    assert replace("Anak") == "Anouk"
