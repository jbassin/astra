"""Unit + assembly tests for ``assay export-book`` (``book.py``) — the
Liturgy of the Iridite Vol.2 Homebrewery generator.

Converter tests load REAL docs from the committed canonical store
``apps/assay/homebrew/spells/`` (read-only, same convention as
``test_homebrew.py`` reading committed ``results/``); assembly tests build
the whole book with a temporary (empty or seeded) Track-B ``content/`` dir
so the real ``apps/codex/books/liturgy_vol2/content/`` is never touched.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from astra_assay import book

STORE = book.STORE_DIR


def _doc(slug: str) -> dict:
    return json.loads((STORE / f"{slug}.json").read_text(encoding="utf-8"))


def _render(slug: str) -> book.RenderedSpell:
    doc = _doc(slug)
    schools = book.spell_school(doc)
    assert len(schools) == 1
    return book.render_spell(doc, slug, schools[0])


# ---------------------------------------------------------------------------
# Converter — golden-ish assertions on real store docs.
# ---------------------------------------------------------------------------


def test_simple_spell_jolt() -> None:
    rs = _render("jolt")
    assert "{{title Jolt}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}" in rs.md
    assert "**Traditions** :: arcane, occult, primal" in rs.md
    assert "**Targets** :: up to 4 willing creatures" in rs.md
    assert "**Cast**" not in rs.md  # 2-action cast renders as the title glyph
    assert "{{postamble\n**Heightened (+1)** :: You can target 1 additional" in rs.md
    assert rs.warnings == []


def test_degree_of_success_and_table_spell() -> None:
    rs = _render("sphere-of-ruin")
    # Degree-of-success paragraphs keep their bold labels.
    assert "**Critical Success** The creature is unaffected" in rs.md
    # <table> -> GFM.
    assert "| 1d6 | Failure | Critical Failure |" in rs.md
    assert "|:---:|:---:|:---:|" in rs.md
    # @UUID[...]{Label} -> Label, no residue.
    assert "Stunned 1" in rs.md
    assert "@UUID" not in rs.md
    assert "<" not in rs.md


def test_ritual_worldweaver() -> None:
    rs = _render("worldweaver")
    assert rs.is_ritual
    assert "{{title Worldweaver}} {{spacer}} {{kind Ritual}} {{level 10}}" in rs.md
    # Rarity pill FIRST, then the school pill (purple `unique`).
    assert "{{trait,rare Rare}}{{trait,unique Seraphic}}{{trait Mythic}}" in rs.md
    # Official ritual row order: Cast; Cost; Secondary Casters; Primary
    # Check; Secondary Checks (verified against corpus ritual/resurrect).
    rows = [line for line in rs.md.splitlines() if line.startswith("**")]
    labels = [r.split(" :: ")[0] for r in rows if " :: " in r]
    assert labels[:5] == [
        "**Cast**",
        "**Cost**",
        "**Secondary Casters**",
        "**Primary Check**",
        "**Secondary Checks**",
    ]
    assert "**Secondary Casters** :: 15" in rs.md
    assert "**Critical Failure** The rewind occurs" in rs.md


def test_uncommon_rarity_pill_first() -> None:
    rs = _render("anomalous-object")
    traits_block = rs.md.split("{{traits\n")[1].split("\n}}")[0]
    assert traits_block.startswith("{{trait,uncommon Uncommon}}")


def test_cantrip_kind() -> None:
    rs = _render("distorted-mark")
    assert "{{kind Cantrip}}" in rs.md


def test_action_glyph_span_mapping() -> None:
    rs = _render("flutterstep")
    assert "**Flutter Step** {{a}} You Stride" in rs.md
    assert "action-glyph" not in rs.md


def test_uuid_flattening_forms() -> None:
    assert (
        book._flatten_enrichers("the @UUID[Compendium.pf2e.conditionitems.Item.Prone]{Prone} foe")
        == "the Prone foe"
    )
    # Bare form -> last path segment, hyphens -> spaces.
    assert book._flatten_enrichers("@UUID[Compendium.pf2e.spells.mind-blank]") == "mind blank"


def test_trigger_lift_reaction_spell() -> None:
    rs = _render("dead-ringer")
    assert "{{title Dead Ringer}} {{r}}" in rs.md
    assert "**Trigger** :: You succeed at a saving throw or are missed by a Strike." in rs.md
    body = rs.md.split("{{definitions")[1]
    assert "**Trigger** You succeed" not in body.split("}}", 1)[1]


def test_requirements_lift() -> None:
    rs = _render("checkpoint")
    assert "**Requirements** :: The target is at full Hit Points." in rs.md


def test_list_spell_macabredanse() -> None:
    rs = _render("macabredanse")
    assert "- **Memento** You create a brief, harmless sensory effect" in rs.md


def test_sustained_duration_print_style() -> None:
    rs = _render("cone-of-silence")
    assert "**Duration** :: sustained up to 1 minute" in rs.md


def test_defense_rendering() -> None:
    docs = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(STORE.glob("*.json"))]
    basics = {
        book._format_defense(d["system"]["defense"]) for d in docs if d["system"].get("defense")
    }
    assert basics <= {
        "Will",
        "Fortitude",
        "Reflex",
        "basic Will",
        "basic Fortitude",
        "basic Reflex",
    }


def test_brace_escaping() -> None:
    conv = book.convert_description("<p>literal {mustache} stays</p>")
    assert conv.body_md == "literal \\{mustache\\} stays"


# ---------------------------------------------------------------------------
# Assembly — full-book build with a temporary Track-B content dir.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> book.BookResult:
    content_dir = tmp_path_factory.mktemp("content_empty")
    return book.build_book(content_dir=content_dir)


def test_every_spell_in_exactly_one_chapter(built: book.BookResult) -> None:
    store_count = len(list(STORE.glob("*.json")))
    assert built.report.spells == store_count == sum(n for _, n, _ in built.report.chapters)
    # seraphic is the LAST chapter, the Worldweaver capstone.
    assert built.report.chapters[-1][0] == "seraphic"
    assert built.report.chapters[-1][1] == 1


def test_double_run_byte_identical(built: book.BookResult, tmp_path: Path) -> None:
    again = book.build_book(content_dir=tmp_path / "content")
    assert again.markdown == built.markdown


def test_no_residue(built: book.BookResult) -> None:
    for residue in ("@UUID", "<p>", "</p>", "<strong>", "<hr", "<table", "\x00"):
        assert residue not in built.markdown


def test_every_page_estimated_within_capacity(built: book.BookResult) -> None:
    assert built.report.overflow_pages == []
    assert built.report.oversized_blocks == []
    for page in built.report.pages:
        assert page.fill <= 1.0


def test_toc_anchors_match_pagination(built: book.BookResult) -> None:
    # The toc's #pN anchors must equal each chapter's real page position:
    # page N = (number of \page markers before it) + 1.
    md = built.markdown
    for school, _, page_no in built.report.chapters:
        anchor = f"](#p{page_no})"
        assert anchor in md, f"toc anchor missing for {school}"
        first_chapter_md = f"# {book._title_case(school)}\n___"
        idx = md.index(first_chapter_md)
        assert md[:idx].count("\\page") + 1 == page_no


def test_footnotes_on_chapter_pages(built: book.BookResult) -> None:
    assert "{{footnote Chapter 8 | Seraphic}}" in built.markdown
    assert built.markdown.count("{{pageNumber,auto}}") == built.report.page_count


def test_spell_list_tables_are_wide(built: book.BookResult) -> None:
    """Homebrewery tables carry ``break-inside: avoid`` — an in-column
    spell-list table clips (live-render verified). Every chapter table must
    ship inside a ``{{wide}}`` block, under the theme-NEUTRAL
    ``vol2SpellTable`` class — the PHB theme's own ``.spellList`` columns
    rule squeezes any child table into a ~160px sub-column."""
    assert built.markdown.count("{{wide,vol2SpellTable") == len(book.SCHOOLS)
    assert "spellList" not in built.markdown


def test_wide_table_px_rows_and_wrap() -> None:
    # Rank|Spell|Actions|Summary rows: 26px single-line while name+summary
    # fit ~70 chars at full width, 39px past that (planara calibration);
    # the |:---:| separator is syntax, not a rendered row.
    short = "| 3 | Jolt | {{aa}} | " + "s" * 60 + " |"
    long = "| 3 | A Rather Long Spell Name Indeed | {{aa}} | " + "s" * 60 + " |"
    md = "{{wide,vol2SpellTable\n##### X Spells\n|:---:|:---|\n" + short + "\n" + long + "\n}}"
    expected = book.WIDE_TABLE_CHROME_PX + book.WIDE_ROW_PX + book.WIDE_ROW_WRAP_PX
    assert book._wide_table_px(md) == pytest.approx(expected)


def test_in_column_table_rows_cost_by_wrap() -> None:
    long_row = "| 1–3 | " + "x" * 90 + " | " + "y" * 90 + " |"
    # In-column: flat +8 zebra padding/border surcharge + wrap-based rows.
    assert book.estimate_md_lines(long_row) > 6.0


def test_in_column_table_flat_surcharge_once_per_table() -> None:
    one_table = "| a | b |\n| c | d |"
    two_tables = "| a | b |\n\ntext\n\n| c | d |"
    base_rows = 2 * 1.1
    assert book.estimate_md_lines(one_table) == pytest.approx(8.0 + base_rows)
    # Two separate tables each pay the surcharge (plus the interposed lines).
    assert book.estimate_md_lines(two_tables) == pytest.approx(8.0 + 1.1 + 0.6 + 1 + 8.0 + 1.1)


def test_style_block_precedes_front_cover(built: book.BookResult) -> None:
    """The generated <style> block (spell-list table width overrides) must
    open the document, ahead of the front cover — the vol2 .css stays a
    byte-verbatim vol1 copy, so these overrides live in the md itself."""
    md = built.markdown
    assert md.startswith("<!-- vol2 generated style — spell-list tables -->\n<style>")
    assert md.index("</style>") < md.index("{{frontCover")
    style = md.split("</style>")[0]
    assert ".page .vol2SpellTable table" in style
    assert "font-size: 0.9em;" in style


def test_style_block_lets_ruleblocks_flow(built: book.BookResult) -> None:
    """Spell blocks must flow across columns (break-inside: auto) with the
    title+pills kept attached — Homebrewery's default avoid strands empty
    column space (the stakeholder's "huge empty gaps")."""
    style = built.markdown.split("</style>")[0]
    # The three-part unlock (each live-render verified as individually
    # necessary): break-inside auto (+prefixed variants) AND display:block —
    # Homebrewery blocks are display:inline-block, atomic boxes that never
    # fragment regardless of break rules; all !important to beat the theme.
    assert "break-inside: auto !important;" in style
    assert "-webkit-column-break-inside: auto !important;" in style
    assert "display: block !important;" in style
    assert (
        ".page .ruleBlock .preamble,\n  .page .ruleBlock .traits {\n    break-inside: avoid;"
        in (style)
    )


def test_calibration_prefers_measured_px_and_corrects_fallback(tmp_path: Path) -> None:
    cal_path = tmp_path / "calibration.json"
    cal_path.write_text(json.dumps({"Jolt": 250.0}), encoding="utf-8")
    calibration = book.load_calibration(cal_path)
    assert calibration == {"Jolt": 250.0}
    assert book.load_calibration(tmp_path / "absent.json") == {}
    # Fit: real = 0.5 x est exactly -> factor 0.5, zero residual spread.
    factor, spread = book.fit_correction([(100.0, 200.0), (50.0, 100.0)])
    assert factor == pytest.approx(0.5)
    assert spread == pytest.approx(0.0)
    assert book.fit_correction([]) == (1.0, 0.0)


def test_real_build_uses_committed_calibration(built: book.BookResult) -> None:
    """All 173 store spells are measured; the fallback correction factor is
    fitted from them (over-pricing line model -> factor well below 1)."""
    assert built.report.calibrated_blocks == 173
    assert 0.5 < built.report.correction_factor < 1.0


def test_paginator_continuous_fill_with_px_heights() -> None:
    """With break-inside:auto flow, blocks pack the whole 2x935px pool: 4
    blocks of 400px per page (1600 <= 1814 target), NOT 2-per-column."""
    report = book.BookReport()
    blocks = [book._FlowBlock(md=f"b{i}", px=400.0) for i in range(8)]
    pages = book._paginate(blocks, report, [f"b{i}" for i in range(8)])
    assert [len(p) for p in pages] == [4, 4]
    assert report.oversized_blocks == []


def test_fragments_consumed_when_present(tmp_path: Path) -> None:
    content = tmp_path / "content"
    (content / "chapters").mkdir(parents=True)
    (content / "frontmatter.md").write_text("REAL FRONT MATTER\n", encoding="utf-8")
    (content / "chapters" / "antillurgy.md").write_text("REAL ANTILLURGY OPENER", encoding="utf-8")
    (content / "summaries.json").write_text(
        json.dumps({"jolt": "Grant allies a bonus action."}), encoding="utf-8"
    )
    result = book.build_book(content_dir=content)
    # The generated style block always opens the doc; the fragment follows.
    after_style = result.markdown.split("</style>", 1)[1]
    assert after_style.lstrip().startswith("REAL FRONT MATTER")
    assert "REAL ANTILLURGY OPENER" in result.markdown
    assert "| 5 | Jolt | {{aa}} | Grant allies a bonus action. |" in result.markdown
    # The remaining chapters still fail soft to generated openers.
    assert "# Chronomancy" in result.markdown
    missing = "\n".join(result.report.missing_fragments)
    assert "frontmatter.md" not in missing
    assert "chronomancy.md" in missing


def test_partition_hard_fails_on_leftovers(tmp_path: Path) -> None:
    with pytest.raises(book.BookBuildError, match="no-school"):
        book._partition_by_school(
            [("no-school", {"system": {"traits": {"value": ["concentrate"]}}})]
        )


# ---------------------------------------------------------------------------
# Pagination model calibration — vol1's PDF renders every \page correctly,
# so its densest statblock pages must estimate within capacity (the model
# must never badly UNDER-estimate, or the fill target would overflow).
# ---------------------------------------------------------------------------


def test_vol1_ruleblock_pages_fit_model() -> None:
    vol1_md = (
        book.REPO_ROOT / "apps/codex/books/liturgy_vol1/liturgy_of_the_iridite_vol1.md"
    ).read_text(encoding="utf-8")
    pages = [p for p in vol1_md.split("\\page") if "{{ruleBlock" in p]
    assert pages, "vol1 statblock pages not found"
    for page in pages:
        est = book.estimate_md_lines(page)
        assert est <= book.PAGE_CAPACITY * 1.05
