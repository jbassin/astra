"""astra-lexicon corrections tests — the KDL defs replacer.

Lifted from linguist's test_apply (the corrections behaviors), retargeted to the
KDL `defs.kdl` format: fragment encoding and the replacer.
"""

from __future__ import annotations

from pathlib import Path

from astra_lexicon import (
    build_replacer,
    escape_regex,
    load_corrections,
    load_defs,
    load_pronunciations,
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


def test_load_pronunciations_reads_the_ipa_property(tmp_path: Path) -> None:
    defs = tmp_path / "defs.kdl"
    defs.write_text(
        'entry "Faerrin" ipa="ˈfɛrɪn" {\n    variant "Fairin"\n}\n'
        'entry "Anouk" {\n    variant "Anak"\n}\n'
        'entry "Blank" ipa="  "\n',
        encoding="utf-8",
    )
    assert load_pronunciations(defs) == {"Faerrin": "ˈfɛrɪn"}
    assert load_defs(defs)["Faerrin"] == ["Fairin"]  # the variants are unaffected


def test_the_shipped_defs_load_their_pronunciations() -> None:
    assert all(ipa.strip() for ipa in load_pronunciations().values())


def test_load_corrections_over_real_defs() -> None:
    """The shipped defs.kdl loads and corrects a known real garble (Anak → Anouk)."""
    replace = load_corrections()
    assert replace("Anak") == "Anouk"
