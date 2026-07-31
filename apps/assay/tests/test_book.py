"""Unit + assembly tests for ``assay export-book`` (``book.py``) — the
Liturgy of the Iridite Vol.2 LaTeX generator.

Converter tests load REAL docs from the committed canonical store
``apps/assay/homebrew/spells/`` (read-only, same convention as
``test_homebrew.py`` reading committed ``results/``); assembly tests build
the whole book with a temporary (empty or seeded) Track-B ``content/`` dir
so the real ``apps/codex/books/liturgy_vol2/content/`` is never touched.

These tests never invoke ``tectonic`` — the emitter is tested standalone;
compiling the ``.tex`` happens only via the CLI (or manually).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from astra_assay import book

STORE = book.STORE_DIR


def _doc(slug: str) -> dict:
    return json.loads((STORE / f"{slug}.json").read_text(encoding="utf-8"))


def _record(slug: str) -> book.SpellRecord:
    doc = _doc(slug)
    schools = book.spell_school(doc)
    assert len(schools) == 1
    return book.build_spell_record(doc, slug, schools[0])


# ---------------------------------------------------------------------------
# Converter — golden-ish assertions on real store docs.
# ---------------------------------------------------------------------------


def test_simple_spell_jolt() -> None:
    rec = _record("jolt")
    assert rec.glyph == "2"
    assert rec.kind == "Spell"
    assert not any(r.label == "Cast" for r in rec.rows)  # 2-action -> title glyph, no Cast row
    assert any(r.label == "Traditions" and r.value == "arcane, occult, primal" for r in rec.rows)
    assert any(r.label == "Targets" and r.value == "up to 4 willing creatures" for r in rec.rows)
    assert rec.heightened == [("+1", "You can target 1 additional willing creature.")]
    assert rec.warnings == []

    tex = book.emit_spell_latex(rec)
    assert "\\spelltitle{Jolt}{2}{Spell 5}" in tex
    assert "\\heightened{+1}{You can target 1 additional willing creature.}" in tex


def test_degree_of_success_and_table_spell() -> None:
    rec = _record("sphere-of-ruin")
    tex = book.emit_spell_latex(rec)
    # Degree-of-success paragraphs render as plain bold-lead body text.
    assert "\\textbf{Critical Success} The creature is unaffected" in tex
    # <table> -> a striped LaTeX tabularx, not GFM.
    assert "\\begin{tabularx}" in tex
    assert "\\tblhead{1d6} & \\tblhead{Failure} & \\tblhead{Critical Failure} \\\\" in tex
    assert "Stunned 1" in tex
    # @UUID[...]{Label} -> Label, no residue.
    assert "@UUID" not in tex
    assert "<" not in tex


def test_ritual_worldweaver_row_order_and_pills() -> None:
    rec = _record("worldweaver")
    assert rec.is_ritual
    assert rec.kind == "Ritual"
    assert rec.glyph is None  # rituals never show a title glyph
    # Official ritual row order (verified against the corpus ritual/resurrect
    # statblock): Cast; Cost; Secondary Casters; Primary Check; Secondary Checks.
    labels = [r.label for r in rec.rows]
    assert labels[:5] == [
        "Cast",
        "Cost",
        "Secondary Casters",
        "Primary Check",
        "Secondary Checks",
    ]
    assert any(r.label == "Secondary Casters" and r.value == "15" for r in rec.rows)

    tex = book.emit_spell_latex(rec)
    assert "\\spelltitle{Worldweaver}{}{Ritual 10}" in tex
    # Rarity pill FIRST, then the school pill (purple \schoolpill).
    assert "\\raritypill{rare}\\hspace{1pt}\\schoolpill{Seraphic}" in tex
    assert "\\textbf{Critical Failure} The rewind occurs" in tex


def test_uncommon_rarity_pill_first() -> None:
    rec = _record("anomalous-object")
    assert rec.rarity == "uncommon"
    tex = book.emit_spell_latex(rec)
    idx = tex.index("\\raritypill{uncommon}")
    assert idx < tex.index("\\schoolpill{")


def test_cantrip_kind() -> None:
    rec = _record("distorted-mark")
    assert rec.kind == "Cantrip"
    tex = book.emit_spell_latex(rec)
    assert f"{{Cantrip {rec.rank}}}" in tex


def test_action_glyph_span_mapping() -> None:
    rec = _record("flutterstep")
    tex = book.emit_spell_latex(rec)
    assert "\\textbf{Flutter Step} \\actglyph{1} You Stride" in tex
    assert "action-glyph" not in tex
    assert rec.warnings == []


def test_uuid_flattening_forms() -> None:
    assert (
        book._flatten_enrichers("the @UUID[Compendium.pf2e.conditionitems.Item.Prone]{Prone} foe")
        == "the Prone foe"
    )
    # Bare form -> last path segment, hyphens -> spaces.
    assert book._flatten_enrichers("@UUID[Compendium.pf2e.spells.mind-blank]") == "mind blank"


def test_trigger_lift_reaction_spell() -> None:
    rec = _record("dead-ringer")
    assert rec.glyph == "r"
    trigger_rows = [r for r in rec.rows if r.label == "Trigger"]
    assert len(trigger_rows) == 1
    assert trigger_rows[0].value == "You succeed at a saving throw or are missed by a Strike."
    # Not duplicated in the body blocks.
    assert not any(b.kind == "p" and b.text.startswith("**Trigger**") for b in rec.body_blocks)


def test_requirements_lift() -> None:
    rec = _record("checkpoint")
    assert any(
        r.label == "Requirements" and r.value == "The target is at full Hit Points."
        for r in rec.rows
    )


def test_list_spell_macabredanse() -> None:
    rec = _record("macabredanse")
    list_blocks = [b for b in rec.body_blocks if b.kind == "list"]
    assert len(list_blocks) == 1
    assert list_blocks[0].items[0].startswith("**Memento** You create a brief")

    tex = book.emit_spell_latex(rec)
    assert "\\begin{itemize}" in tex
    assert "\\item \\textbf{Memento} You create a brief" in tex


def test_sustained_duration_print_style() -> None:
    rec = _record("cone-of-silence")
    assert any(r.label == "Duration" and r.value == "sustained up to 1 minute" for r in rec.rows)


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


def test_partition_hard_fails_on_leftovers() -> None:
    with pytest.raises(book.BookBuildError, match="no-school"):
        book._partition_by_school(
            [("no-school", {"system": {"traits": {"value": ["concentrate"]}}})]
        )


# ---------------------------------------------------------------------------
# LaTeX escaping — the emission-time safety net (leak fix: escaping used to
# happen inside the HTML parser; it now happens ONLY here, at emission).
# ---------------------------------------------------------------------------


def test_latex_escaping_special_chars() -> None:
    escaped = book._latex_escape_text("A & B % C $ D # E _ F { G } H ~ I ^ J \\ K")
    assert escaped == (
        "A \\& B \\% C \\$ D \\# E \\_ F \\{ G \\} H \\textasciitilde{} I "
        "\\textasciicircum{} J \\textbackslash{} K"
    )


def test_latex_escaping_unicode_passthrough() -> None:
    # The store's real unicode set (—, Æ, æ, ×, smart quotes) passes through
    # untouched — XeTeX/fontspec handles it natively.
    text = "Færrin — Æ æ × “smart quotes”"
    assert book._latex_escape_text(text) == text


def test_latex_escaping_normalizes_uncovered_dash_glyphs() -> None:
    # Bookinsanity/Scaly Sans/Mr Eaves measurably lack EN DASH + MINUS SIGN
    # glyphs (fontTools cmap inspection + a live tectonic missing-character
    # warning) — "--"/"---" runs and stray literal en-dash/minus characters
    # normalize to a glyph the fonts DO have.
    assert book._latex_escape_text("turned against magic -- the art") == (
        "turned against magic — the art"
    )
    assert book._latex_escape_text("magic---the art") == "magic—the art"
    assert book._latex_escape_text("a level \u2212 1 creature") == "a level - 1 creature"
    assert book._latex_escape_text("en dash \u2013 too") == "en dash — too"


# ---------------------------------------------------------------------------
# Body-block LaTeX emitter — table/list/hr, glyph sentinels.
# ---------------------------------------------------------------------------


def test_render_table_latex_striped() -> None:
    block = book._Block(
        "table", header=["d8", "Effect"], rows=[["1", "Charm Ray"], ["2", "Fear Ray"]]
    )
    tex = book._render_block_latex(block, [])
    assert "\\begin{tabularx}" in tex
    assert "\\rowcolors{2}{TableBlue}{TableWhite}" in tex
    assert "\\tblhead{d8} & \\tblhead{Effect} \\\\" in tex
    assert "1 & Charm Ray \\\\" in tex
    assert "2 & Fear Ray \\\\" in tex


def test_render_table_latex_wide_header_not_squeezed_narrow() -> None:
    """A long header (not a short "d8"/"1d6" roll column) must NOT get the
    narrow centered column width — a live tectonic render caught this
    wrapping "Damage Type" into an unreadable "Damag/Type" stack."""
    block = book._Block("table", header=["Damage Type", "Effect"], rows=[["Acid", "1 damage."]])
    tex = book._render_block_latex(block, [])
    assert r"p{0.09\linewidth}" not in tex.split("\n")[4]  # the colspec line


def test_render_list_latex() -> None:
    block = book._Block("list", items=["**Memento** does a thing", "plain item"])
    tex = book._render_block_latex(block, [])
    assert tex == (
        "\\begin{itemize}\n\\item \\textbf{Memento} does a thing\n\\item plain item\n\\end{itemize}"
    )


def test_render_hr_latex() -> None:
    assert book._render_block_latex(book._Block("hr"), []) == "\\bodyhr"


def test_glyph_sentinel_to_actglyph_macro() -> None:
    warnings: list[str] = []
    tex = book._render_inline("Stride \x00GLYPH:1\x00END now", warnings)
    assert tex == "Stride \\actglyph{1} now"
    assert warnings == []


def test_unknown_glyph_sentinel_warns_and_keeps_text() -> None:
    warnings: list[str] = []
    tex = book._render_inline("\x00GLYPH:z\x00END", warnings)
    assert tex == "z"
    assert warnings and "unknown action-glyph" in warnings[0]


def test_bold_italic_toggle_nesting() -> None:
    # HTML nests properly (<strong>A <em>B</em> C</strong>), so a simple
    # toggle over "**"/"*" tokens reproduces correct LaTeX nesting.
    tex = book._render_inline("**A *B* C**", [])
    assert tex == "\\textbf{A \\textit{B} C}"


# ---------------------------------------------------------------------------
# Assembly — full-book build with a temporary Track-B content dir.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> book.BookResult:
    content_dir = tmp_path_factory.mktemp("content_empty")
    return book.build_book(content_dir=content_dir)


def test_every_spell_in_exactly_one_chapter(built: book.BookResult) -> None:
    store_count = len(list(STORE.glob("*.json")))
    assert built.report.spells == store_count == sum(n for _, n in built.report.chapters)
    # seraphic is the LAST chapter, the Worldweaver capstone.
    assert built.report.chapters[-1][0] == "seraphic"
    assert built.report.chapters[-1][1] == 1


def test_double_run_byte_identical(built: book.BookResult, tmp_path: Path) -> None:
    again = book.build_book(content_dir=tmp_path / "content")
    assert again.tex == built.tex


def test_no_residue(built: book.BookResult) -> None:
    for residue in ("@UUID", "<p>", "</p>", "<strong>", "<hr", "<table", "\x00"):
        assert residue not in built.tex
    # Exercises the {{ }} Homebrewery-markup gate too (no exception raised).
    book._check_residue(built.tex)


def test_wide_spell_list_table_emission(built: book.BookResult) -> None:
    """One tabularx-based Rank/Spell/Actions/Summary table per chapter."""
    header_row = "\\tblhead{Rank} & \\tblhead{Spell} & \\tblhead{Actions} & \\tblhead{Summary} \\\\"
    assert built.tex.count(header_row) == len(book.SCHOOLS)
    for school in book.SCHOOLS:
        assert f"\\subsubsection*{{{book._title_case(school)} Spells}}" in built.tex


def test_toc_and_chapter_labels(built: book.BookResult) -> None:
    assert "\\section*{Contents}" in built.tex
    for chapter_no, school in enumerate(book.SCHOOLS, start=1):
        assert f"\\tocentry{{{chapter_no}}}{{{book._title_case(school)}}}{{chapter:{school}}}" in (
            built.tex
        )
        assert f"\\label{{chapter:{school}}}" in built.tex


def test_fragments_consumed_when_present(tmp_path: Path) -> None:
    content = tmp_path / "content"
    (content / "chapters").mkdir(parents=True)
    (content / "frontmatter.md").write_text("# REAL FRONT MATTER\n", encoding="utf-8")
    (content / "chapters" / "antillurgy.md").write_text("REAL ANTILLURGY OPENER", encoding="utf-8")
    (content / "summaries.json").write_text(
        json.dumps({"jolt": "Grant allies a bonus action."}), encoding="utf-8"
    )
    result = book.build_book(content_dir=content)
    assert "REAL FRONT MATTER" in result.tex
    # The chapter opener's first paragraph gets the drop-cap treatment (its
    # first letter is pulled out into \liturgydropcap), so the substring is
    # split rather than verbatim.
    assert "\\liturgydropcap{R}{EAL}" in result.tex
    assert "ANTILLURGY OPENER" in result.tex
    assert "Grant allies a bonus action." in result.tex
    # The remaining chapters still fail soft to a generated chapter title.
    assert "\\chaptertitle{Chronomancy}" in result.tex
    missing = "\n".join(result.report.missing_fragments)
    assert "frontmatter.md" not in missing
    assert "chronomancy.md" in missing
