"""Unit tests for the D30-37 summon band check (spec 0030 round 4)."""

from __future__ import annotations

import json
from pathlib import Path

from astra_assay import summons

FIXTURES = Path(__file__).parent / "fixtures"


def test_curve_matches_the_declared_pin() -> None:
    assert summons.SUMMON_CURVE == {
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


def test_extract_base_level_whose_level_is_phrasing_ascii_hyphen() -> None:
    desc = (
        "<p>You summon a creature that has the animal trait and whose level is -1 "
        "to fight for you.</p>"
    )
    assert summons.extract_base_level(desc) == -1


def test_extract_base_level_whose_level_is_phrasing_en_dash() -> None:
    desc = "<p>...whose level is –1 to fight for you.</p>"
    assert summons.extract_base_level(desc) == -1


def test_extract_base_level_or_lower_phrasing() -> None:
    desc = "<p>You summon a creature ... whose level is 5 or lower to fight for you.</p>"
    assert summons.extract_base_level(desc) == 5


def test_extract_base_level_of_level_phrasing() -> None:
    desc = "<p>You summon a common celestial, fiend, or monitor of level –1.</p>"
    assert summons.extract_base_level(desc) == -1


def test_extract_base_level_phantasmal_minion_no_match() -> None:
    desc = "<p>You summon a @UUID[...Phantasmal Minion]. The minion is roughly ...</p>"
    assert summons.extract_base_level(desc) is None


def test_summon_band_agrees_with_curve() -> None:
    desc = "whose level is 5 or lower to fight for you."
    band = summons.summon_band(5, desc)
    assert band is not None
    assert band.base_level == 5
    assert band.curve_level == 5
    assert band.delta == 0


def test_summon_band_none_for_fixed_creature_summon() -> None:
    assert summons.summon_band(1, "You summon a specific creature.") is None


def test_verify_curve_against_journal_real_fixture() -> None:
    doc = json.loads((FIXTURES / "gm-screen-summon-trait.json").read_text(encoding="utf-8"))
    summons.verify_curve_against_journal(
        doc, entry_id="S55aqwWIzpQRFhcq", page_id="8gcp880pEWZ9VPnF"
    )


def test_verify_curve_against_journal_wrong_entry_id() -> None:
    doc = json.loads((FIXTURES / "gm-screen-summon-trait.json").read_text(encoding="utf-8"))
    try:
        summons.verify_curve_against_journal(doc, entry_id="wrong-id", page_id="8gcp880pEWZ9VPnF")
    except summons.SummonCurveDisagreementError:
        pass
    else:
        raise AssertionError("expected SummonCurveDisagreementError")


def test_verify_curve_against_journal_detects_drift() -> None:
    doc = json.loads((FIXTURES / "gm-screen-summon-trait.json").read_text(encoding="utf-8"))
    doc["pages"][0]["text"]["content"] = doc["pages"][0]["text"]["content"].replace(
        "<td>15</td>", "<td>99</td>"
    )
    try:
        summons.verify_curve_against_journal(
            doc, entry_id="S55aqwWIzpQRFhcq", page_id="8gcp880pEWZ9VPnF"
        )
    except summons.SummonCurveDisagreementError:
        pass
    else:
        raise AssertionError("expected SummonCurveDisagreementError on drift")
