"""The faerrin-world session filter (Phase-2 spec §4, S1).

Verifies the world filter against the committed transcripts + being.kdl: faerrin
sessions are kept and resolve to a faerrin campaign slug; non-faerrin worlds (sedecium
`observatory-slipped`, finnegan's-ring `fey-in-the-mists`) and the mislabeled
EXCLUDED_DATES session (2025-8-11, the "Argyle" false-match) are dropped. Absolute counts
are NOT asserted (committed transcripts grow as sessions land) — known dates + the
keep-invariant are.
"""

from __future__ import annotations

from astra_heartwood.sessions import faerrin_session, ingestible_dates
from astra_ontology import faerrin_campaign_slugs, load_being
from astra_ontology_being import BEING_KDL_PATH

# the held-out acceptance session (P2.7) + two side campaigns — all faerrin, all kept
KEPT = {
    "2026-6-8": "through-a-song-darkly",
    "2025-6-9": "a-hunt-of-metal-and-vine",
    "2026-2-10": "interred-in-iomenei",
}
# non-faerrin worlds dropped by the world filter: sedecium ×2, finnegan's-ring ×1
WORLD_DROP = ["2026-4-6", "2026-4-27", "2026-4-20"]
EXCLUDED = "2025-8-11"  # EXCLUDED_DATES (the Argyle false-match)


def test_faerrin_sessions_kept_with_slug() -> None:
    for date, slug in KEPT.items():
        assert faerrin_session(date) == slug


def test_non_faerrin_worlds_dropped() -> None:
    for date in WORLD_DROP:
        assert faerrin_session(date) is None


def test_excluded_date_dropped() -> None:
    assert faerrin_session(EXCLUDED) is None


def test_unknown_date_is_none_not_crash() -> None:
    assert faerrin_session("1999-1-1") is None


def test_ingestible_dates_are_all_faerrin() -> None:
    being = load_being(BEING_KDL_PATH)
    faerrin = faerrin_campaign_slugs(being)
    dates = ingestible_dates(being=being)
    assert set(KEPT) <= set(dates)
    assert not (set(WORLD_DROP) | {EXCLUDED}) & set(dates)
    # invariant: every kept date resolves to a faerrin slug
    for d in dates:
        assert faerrin_session(d, being=being) in faerrin
