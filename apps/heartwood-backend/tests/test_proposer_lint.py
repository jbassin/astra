"""Phase-3 S2 — the machine tell-lint (spec §8, ported from faerrin ``voice-warnings.ts``).

Warnings, never a hard gate. Covers the calibration strings (the BAD slop archetype trips the
cadence tells + intensifiers; the GOOD / 2nd-person exemplars are free of the cadence tells),
page-type suppression, and the evolved ``broken_wikilink`` parsing (path-form vs name-form, with
in-batch sibling crossrefs not falsely flagged).
"""

from __future__ import annotations

from astra_heartwood.proposer.lint import voice_warnings

# The §2/§8 calibration exemplars.
BAD = "X is a large scrapyard located within the neighborhood. It is an expansive site of trash."
GOOD = (
    "Sableclutch is dominated by the dockworkers and warehouse employees that ply their trade on "
    "the river — somewhat overlooked by the rest of the capital, whilst the goods that enter the "
    "city start their journey here while the power centers sit elsewhere."
)
SECOND_PERSON = (
    "You weren't the only one who heard the Voidsong in your dreams. Iconoclasm gathers those who "
    "did, and you have just joined them."
)
CLEAN_STUB = "A roller rink run by a maddened sprite on the river's edge."


def _types(warnings: list) -> set[str]:
    return {w.type for w in warnings}


def test_bad_archetype_trips_cadence_and_intensifiers() -> None:
    types = _types(voice_warnings(BAD, page_type="lore"))
    assert {"encyclopedia_opener", "it_is_template", "intensifier"} <= types


def test_intensifier_hits_are_itemized() -> None:
    hits = {w.hit for w in voice_warnings(BAD, page_type="lore") if w.type == "intensifier"}
    assert hits == {"large", "expansive"}


def test_good_and_second_person_have_no_cadence_tells() -> None:
    # The house voice opens on a subject/POV, not "X is a/the …", and avoids "It is …".
    for exemplar in (GOOD, SECOND_PERSON):
        types = _types(voice_warnings(exemplar, page_type="lore"))
        assert "encyclopedia_opener" not in types
        assert "it_is_template" not in types


def test_clean_stub_is_warning_free() -> None:
    assert voice_warnings(CLEAN_STUB, page_type="stub") == []


def test_empty_body_warns_empty() -> None:
    assert _types(voice_warnings("   \n  ", page_type="lore")) == {"empty"}


def test_prose_tells_suppressed_on_non_prose_pages() -> None:
    # A deity stat-block line is shaped like an opener but must NOT trip the prose bar (P3.10).
    body = "Foo is a god of war. Edicts :: fight well\nAnathema :: flee"
    assert voice_warnings(body, page_type="deity-statblock") == []


# ── broken_wikilink (§8) ──────────────────────────────────────────────────────
def test_pathform_crossref_checked_against_known_pages() -> None:
    known = frozenset({"Org/Iconoclasm/index"})
    ok = voice_warnings(
        "See [[Org/Iconoclasm/index|Iconoclasm]].", page_type="lore", known_pages=known
    )
    assert "broken_wikilink" not in _types(ok)
    broken = voice_warnings("See [[Org/Ghost/index|Ghost]].", page_type="lore", known_pages=known)
    assert [w.hit for w in broken if w.type == "broken_wikilink"] == ["Org/Ghost/index"]


def test_nameform_crossref_resolved_via_registry() -> None:
    # A real registry name resolves; an invented one is flagged.
    ok = voice_warnings("Tied to [[Iconoclasm]].", page_type="lore")
    assert "broken_wikilink" not in _types(ok)
    broken = voice_warnings("Tied to [[Zxqwvbnm Madeupname]].", page_type="lore")
    assert "broken_wikilink" in _types(broken)


def test_in_batch_sibling_crossrefs_not_flagged() -> None:
    # A crossref to a page created in the same change-set (by path OR canonical) is valid.
    warns = voice_warnings(
        "Made by [[Sentience Distributor]], stored at [[needs-placement/Sentience Distributor]].",
        page_type="lore",
        batch_pages=frozenset({"needs-placement/Sentience Distributor"}),
        batch_names=frozenset({"Sentience Distributor"}),
    )
    assert "broken_wikilink" not in _types(warns)
