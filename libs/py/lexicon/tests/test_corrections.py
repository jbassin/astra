"""astra-lexicon corrections tests — the KDL defs replacer.

Lifted from linguist's test_apply (the corrections behaviors), retargeted to the
KDL `defs.kdl` format: fragment encoding and the replacer.
"""

from __future__ import annotations

from pathlib import Path

import pytest
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


def test_the_shipped_corrections_leave_correct_text_alone() -> None:
    # stored_corrections re-applies them to stored text; a canonical holding one of its
    # variants grew on every pass (https://btl.iridi.cc -> https://https://btl.iridi.cc.iridi.cc).
    fix = load_corrections()
    defs = load_defs()
    assert [k for k in defs if fix(k) != k] == []
    text = "Open https://btl.iridi.cc, ask the Children of the Heir and Osyluth at Gas-n-Go℠ now"
    assert fix(text) == text


def test_a_case_only_entry_still_fixes_case() -> None:
    fix = build_replacer({"Fane": ["fane", "vein"]})
    assert fix("the fane and the vein, the Fane") == "the Fane and the Fane, the Fane"


def test_a_variant_with_its_own_group_maps_to_its_canonical() -> None:
    fix = build_replacer({"Anouk": ["Anak"], "Osyluth": ["Oce(lot|loth|lith)"]})
    assert fix("Ocelith met Anak") == "Osyluth met Anouk"


def test_every_fragment_head_shape_dispatches_in_both_cases() -> None:
    # The pattern buckets by first character; these are the heads defs.kdl uses.
    fix = build_replacer(
        {
            "Immix": ["[IE]mix"],
            "Penny": ["(?-i:Penny)", "Pennie"],
            "12 Wins": [r"12\s*wins?"],
            "USD": [r"\$"],
            "Prime Marudine": [r"Prime\s*Marodine"],
        }
    )
    assert fix("EMIX imix Imix") == "Immix Immix Immix"
    assert fix("penny Penny PENNIE") == "penny Penny Penny"
    assert fix("12wins, 12 win") == "12 Wins, 12 Wins"
    assert fix("ids 5$5 and $") == "ids 5USD5 and $"  # \b\$\b, as before: needs word chars
    assert fix("PRIME  MARODINE, PrimeMarodine") == "Prime Marudine, Prime Marudine"


def test_the_first_defined_entry_wins_whatever_the_case() -> None:
    fix = build_replacer({"Alpha": [r"foo\s*bar"], "Beta": ["foo"]})
    assert fix("foo bar, Foo Bar, FOO, foo") == "Alpha, Alpha, Beta, Beta"


def test_a_canonical_starting_on_a_symbol_still_matches_itself() -> None:
    fix = build_replacer({"$5": ["five bucks"], "Anouk": ["Anak"]})
    assert fix("$5 for Anak, five bucks") == "$5 for Anouk, $5"


@pytest.mark.parametrize("fragment", ["(?:O|A)nak", "a?nak", "foo|bar", ".nak", "\\dnak"])
def test_a_fragment_whose_first_character_cannot_be_read_is_rejected(fragment: str) -> None:
    with pytest.raises(ValueError, match="Anouk"):
        build_replacer({"Anouk": [fragment]})
