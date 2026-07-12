"""Phase-3 S1 — grouping, placement, id-slug, page-type non-prose skip (spec §6/§8).

Fixture-tests the committed ``2025-8-28`` facts (the closed Phase-2 acceptance artifact) and
unit-tests the pure placement/slug rules + the non-prose skip against the real akasha corpus.
"""

from __future__ import annotations

from astra_heartwood.models import ResolvedFact, SessionFacts
from astra_heartwood.proposer.corpus import read_page_text
from astra_heartwood.proposer.group import build_proposals, load_facts, place, slugify
from astra_heartwood.proposer.page_type import detect_page_type
from astra_ontology import EntityRef

DATE = "2025-8-28"


def _text(target_path: str) -> str:
    """The .vellum text for a real corpus page (asserts it exists, for the type-checker)."""
    text = read_page_text(target_path)
    assert text is not None
    return text


# ── slugify (§6) ─────────────────────────────────────────────────────────────
def test_slugify_full_path_lowercased_dashed() -> None:
    assert slugify("Org/Iconoclasm/index") == "org-iconoclasm-index"
    assert slugify("Bestiary/Sentience Distributor") == "bestiary-sentience-distributor"


def test_slugify_non_ascii_never_crashes() -> None:
    # NFKD-fold to ASCII where possible; never raise on diacritics/ligatures.
    assert slugify("Geography/Anaïs") == "geography-anais"
    assert slugify("Geography/Færrin") == "geography-frrin"  # æ has no NFKD decomposition → dropped
    assert slugify("人物/名前")  # fully non-latin → non-empty fallback, no crash


# ── placement (§6) ───────────────────────────────────────────────────────────
def test_place_folder_mapped_kinds_clean() -> None:
    assert place("deity", "Eternal Pulse") == ("Divinity/Eternal Pulse", None)
    assert place("place", "Hallia") == ("Geography/Hallia/index", None)
    assert place("phenomenon", "Voidsong") == ("Phenomena/Voidsong", None)
    assert place("creature", "Augers") == ("Bestiary/Augers", None)
    assert place("org", "Iconoclasm") == ("Org/Iconoclasm/index", None)


def test_place_flags_folderless_and_linkless_kinds() -> None:
    # item has no corpus folder → flagged, NOT invented under Bestiary (scope error).
    path, note = place("item", "Sentience Distributor")
    assert path == "needs-placement/Sentience Distributor" and note
    # person→org link is not in the fact rows → best-effort + note.
    path, note = place("person", "Elias")
    assert path == "Org/Unsorted/People/Elias" and note
    # unknown kind → flagged.
    path, note = place(None, "Mystery")
    assert path == "needs-placement/Mystery" and note


# ── page-type detection (§8; lands in S1 for the non-prose skip) ──────────────
def test_detect_page_type_real_corpus() -> None:
    assert detect_page_type(_text("Divinity/Outer Gods/The Compelled")) == "deity-statblock"
    assert detect_page_type(_text("Timeline"), path="Timeline") == "timeline"
    assert detect_page_type(_text("Org/Iconoclasm/index")) == "lore"


def test_detect_page_type_length_and_emptiness() -> None:
    assert detect_page_type("---\nx: 1\n---\n") == "stub"  # empty after frontmatter
    assert detect_page_type("Short.") == "stub"  # < 40 chars
    assert detect_page_type("A" * 80) == "lore"


# ── non-prose skip: a fact resolving to a deity page is NOT rewritten (P3.10) ──
def test_resolved_fact_to_nonprose_page_is_skipped() -> None:
    ref = EntityRef(
        canonical="The Compelled",
        kind="deity",
        page="Divinity/Outer Gods/The Compelled",
        being=None,
    )
    facts = SessionFacts(
        date=DATE,
        show="x",
        world="faerrin",
        facts=[
            ResolvedFact(
                subject="The Compelled",
                kind_hint="deity",
                claim="The Compelled demands hard work.",
                status="resolved",
                entity=ref,
                confidence=1.0,
            )
        ],
    )
    m = build_proposals(facts)
    assert not m.proposals  # not rewritten — would destroy the @deity block
    assert [(s.target_path, s.reason) for s in m.skipped] == [
        ("Divinity/Outer Gods/The Compelled", "non-prose-page")
    ]


def test_stale_page_pointer_degrades_to_create() -> None:
    ref = EntityRef(canonical="Ghost", kind="org", page="Org/DoesNotExist/index", being=None)
    facts = SessionFacts(
        date=DATE,
        show="x",
        world="faerrin",
        facts=[
            ResolvedFact(
                subject="Ghost",
                kind_hint="org",
                claim="Ghost is a defunct guild.",
                status="resolved",
                entity=ref,
                confidence=1.0,
            )
        ],
    )
    m = build_proposals(facts)
    assert len(m.proposals) == 1
    assert m.proposals[0].op == "create" and m.proposals[0].placement_note


# ── fixture over the committed acceptance artifact (§6) ───────────────────────
def test_build_proposals_over_committed_facts() -> None:
    facts = load_facts(DATE)
    assert facts is not None
    m = build_proposals(facts)

    # every proposal id is unique (collision suffix guarantees it) and matches its body file.
    ids = [p.id for p in m.proposals]
    assert len(ids) == len(set(ids))
    assert all(p.body_file == f"{p.id}.vellum" for p in m.proposals)

    # ambiguous facts are surfaced, never auto-placed (P3.14).
    assert len(m.unplaced) == 5

    # unknown subjects each propose a registry addition.
    assert all(p.status in {"resolved", "unknown"} for p in m.proposals)
    assert m.registry_additions  # the 25 unknowns collapse to ≥1 proposed entity

    # items are flagged, NEVER placed under Bestiary (creature folder).
    for p in m.proposals:
        if p.kind == "item":
            assert p.target_path.startswith("needs-placement/") and p.placement_note
            assert not p.target_path.startswith("Bestiary/")

    # rewrites only ever target prose (lore/stub) pages.
    for p in m.proposals:
        if p.op == "rewrite":
            assert p.page_type in {"lore", "stub"}

    # world/show/date carried verbatim.
    assert (m.date, m.show, m.world) == (DATE, "through-a-song-darkly", "faerrin")
