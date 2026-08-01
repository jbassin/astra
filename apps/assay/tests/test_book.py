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
import re
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
    # <table> -> a striped, per-row-breakable \tblrow table, not GFM.
    assert "\\tblrow{" in tex
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
    assert "\\tblrow{" in tex
    assert "\\tblhead{d8} & \\tblhead{Effect} \\\\" in tex
    assert "1 & Charm Ray \\\\" in tex
    assert "2 & Fear Ray \\\\" in tex
    # striping is set explicitly per row (\rowcolors was retired — it counts
    # physical rows within ONE table and can't survive the table becoming N
    # independent \tblrow tables, see test_render_table_latex_breakable_shape).
    assert "\\rowcolors" not in tex
    assert "\\rowcolor{TableBlue}" in tex
    assert "\\rowcolor{TableWhite}" in tex


def test_render_table_latex_wide_header_not_squeezed_narrow() -> None:
    """A long header (not a short "d8"/"1d6" roll column) must NOT get the
    narrow centered column width — a live tectonic render caught this
    wrapping "Damage Type" into an unreadable "Damag/Type" stack."""
    block = book._Block("table", header=["Damage Type", "Effect"], rows=[["Acid", "1 damage."]])
    tex = book._render_block_latex(block, [])
    colspec_line = next(line for line in tex.split("\n") if line.startswith("\\tblrow{"))
    assert r"p{0.09\linewidth}" not in colspec_line


def test_render_table_latex_label_column_capped_for_prose_column() -> None:
    """S5 column-width rework (Eye Stalks defect): a label-ish column with
    ONE outlier long cell ("Disintegration Ray" alongside mostly-short "X
    Ray" labels) used to jump the WHOLE column to a flat 12em bucket the
    instant any single word passed 13 characters — starving the prose
    "Effect" column down to a sliver (confirmed live: the Eye Stalks table
    nearly doubled its page footprint). The label column must now be
    capped well under the old 12em ceiling, and the trailing prose column
    (always "X") must end up the widest column by a comfortable margin."""
    block = book._Block(
        "table",
        header=["d8", "Ray", "Effect"],
        rows=[
            ["1", "Charm Ray", "Short effect."],
            ["8", "Disintegration Ray", "A longer effect description."],
        ],
    )
    tex = book._render_block_latex(block, [])
    colspec_line = next(line for line in tex.split("\n") if line.startswith("\\tblrow{"))
    assert "p{12.00em}" not in colspec_line
    assert "p{8.50em}" not in colspec_line
    # the "Ray" column's cap (see _COL_CAP_EM) leaves "Effect" (the X
    # column) the widest by construction — assert the cap is small enough
    # that it can't have crowded the prose column the way the old 12em
    # bucket did.
    em_widths = [float(w) for w in re.findall(r"p\{([\d.]+)em\}", colspec_line)]
    assert em_widths and max(em_widths) <= book._COL_CAP_EM


def test_render_table_latex_breakable_shape() -> None:
    """The DEFECT this pins: a single multi-row tabularx has no page/column
    break points, so an in-block table taller than one column either
    overflows the text block into the footer or silently drops whatever
    falls past the page edge (confirmed on the pre-fix PDF: rows 7-8 of the
    Eye Stalks table never rendered anywhere at all). Every physical row now
    gets its OWN \\tblrow call (a self-contained tabularx), separated by an
    ordinary blank-line paragraph break — a legal break point — instead of
    one unbreakable environment holding every row."""
    block = book._Block(
        "table",
        header=["d8", "Effect"],
        rows=[["1", "Charm Ray"], ["2", "Fear Ray"], ["3", "Slowing Ray"]],
    )
    tex = book._render_block_latex(block, [])
    # one \tblrow call per physical table-row, EXCEPT the header travels
    # with the first data row in a single call (so a break can never strand
    # a bare header at the bottom of a column) — 3 data rows - 1 (folded
    # into the header call) + 1 (the header call itself) = 3 \tblrow calls.
    # \tblrow (liturgy.sty) is itself a self-contained tabularx per call —
    # never one shared multi-row table.
    assert tex.count("\\tblrow{") == 3
    # the header call carries BOTH the header row and the first data row.
    header_call = tex.split("\\tblrow{", 2)[1]
    assert "\\tblhead{d8}" in header_call
    assert "1 & Charm Ray" in header_call
    assert "\\rowcolor{TableBlue}" in header_call  # row 1 (index 0) stripes Blue
    # a blank line precedes every \tblrow call after the header+first-row
    # call — the actual break point between rows.
    assert "\n\n\\tblrow{" in tex
    assert tex.count("\n\n\\tblrow{") == 2  # one before row 2, one before row 3
    # striping alternates by DATA-ROW index, stable regardless of which page
    # a row lands on (row 2 = index 1 = White, row 3 = index 2 = Blue).
    stripes = re.findall(r"\\rowcolor\{(\w+)\}", tex)
    assert stripes == ["TableBlue", "TableWhite", "TableBlue"]
    # only the LAST row closes the table with a bottom rule; earlier rows
    # (incl. the header+first-row call) do not.
    assert tex.count("\\hline") == 3  # header top + header bottom + final close
    last_row_call = tex.rsplit("\\tblrow{", 1)[1]
    assert "\\hline" in last_row_call
    assert "3 & Slowing Ray" in last_row_call
    assert "2 & Fear Ray" not in last_row_call  # the middle row is its OWN call
    # \parskip is zeroed for the group so the per-row paragraphs still read
    # as one seamless table when nothing forces a break.
    assert "\\setlength{\\parskip}{0pt}" in tex


def test_emit_spell_list_latex_explicit_rowcolor_not_rowcolors() -> None:
    """S5 row-height fix: the chapter spell-list table used to hand row
    striping to \\rowcolors{2}{TableBlue}{TableWhite} (colortbl's automatic
    per-row counter) — empirically, ONLY in the full multi-chapter book (a
    single-table reproduction never showed it), a handful of that table's
    rows rendered ~2.3x the uniform row height with a blank leading gap
    (confirmed via bbox-layout y-deltas on a live render: 14.8-15.5pt
    normal vs. 33.9-34.7pt on the affected rows). Emitting \\rowcolor{...}
    explicitly per row from a Python-computed alternation — no shared
    LaTeX-side counel — removes the dependency on \\rowcolors entirely."""
    spells = [_record("jolt"), _record("jolt")]
    spells[1].slug = "jolt-2"
    spells[1].name = "Second Jolt"
    tex = book._emit_spell_list_latex("antillurgy", spells, {}, [])
    assert "\\rowcolors" not in tex
    stripes = re.findall(r"\\rowcolor\{(\w+)\}", tex)
    # header row (TableBlue) + one per data row, alternating White/Blue —
    # matches the retired \rowcolors{2}{TableBlue}{TableWhite} parity
    # exactly (table row 1 = header = odd = Blue, row 2 = first data row =
    # even = White, row 3 = second data row = odd = Blue, ...).
    assert stripes == ["TableBlue", "TableWhite", "TableBlue"]


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


# ---------------------------------------------------------------------------
# Stakeholder art fail-soft wiring — assets/img/processed/<slot>.(png|jpg).
# ---------------------------------------------------------------------------


def test_chapter_opener_art_fail_soft(tmp_path: Path) -> None:
    content = tmp_path / "content"
    (content / "chapters").mkdir(parents=True)
    (content / "chapters" / "antillurgy.md").write_text(
        "Opener prose.\n\n<!-- ART SLOT [ch1-antillurgy]: a duel -->\n", encoding="utf-8"
    )
    art_dir = tmp_path / "art"
    art_dir.mkdir()

    # No processed/antillurgy.(png|jpg) yet -> the dashed placeholder, keyed
    # by the fragment's OWN art-slot id (not the school name).
    no_art = book.build_book(content_dir=content, art_dir=art_dir)
    assert "\\openerartslot{ch1-antillurgy}" in no_art.tex
    assert "\\openerartimage{" not in no_art.tex
    assert no_art.report.art_placeholder == ["antillurgy"]
    assert no_art.report.art_real == []

    # Real art present -> \openerartimage, keyed by SCHOOL (the lookup is
    # school-keyed so it applies even to chapters with no opener fragment at
    # all — see test_chapter_opener_art_without_fragment below).
    (art_dir / "antillurgy.png").write_bytes(b"fake-png")
    with_art = book.build_book(content_dir=content, art_dir=art_dir)
    assert "\\openerartimage{assets/img/processed/antillurgy.png}" in with_art.tex
    assert "\\openerartslot{" not in with_art.tex
    assert with_art.report.art_real == ["antillurgy"]
    assert with_art.report.art_placeholder == []


def test_chapter_opener_art_without_fragment(tmp_path: Path) -> None:
    """The art lookup is school-keyed, not fragment-keyed — a chapter with
    NO opener fragment (the trait-blurb fallback path, no ART-SLOT comment
    at all) still gets real art the moment it exists."""
    content = tmp_path / "content"
    art_dir = tmp_path / "art"
    art_dir.mkdir()
    (art_dir / "chronomancy.jpg").write_bytes(b"fake-jpg")
    result = book.build_book(content_dir=content, art_dir=art_dir)
    assert "\\openerartimage{assets/img/processed/chronomancy.jpg}" in result.tex
    assert result.report.art_real == ["chronomancy"]
    # no ART-SLOT comment anywhere for the other 7 -> no placeholder either.
    assert result.report.art_placeholder == []


def test_chapter_opener_art_prefers_png_over_jpg(tmp_path: Path) -> None:
    content = tmp_path / "content"
    art_dir = tmp_path / "art"
    art_dir.mkdir()
    (art_dir / "antillurgy.png").write_bytes(b"p")
    (art_dir / "antillurgy.jpg").write_bytes(b"j")
    result = book.build_book(content_dir=content, art_dir=art_dir)
    assert "assets/img/processed/antillurgy.png" in result.tex
    assert "antillurgy.jpg" not in result.tex


def test_frontmatter_art_fail_soft(tmp_path: Path) -> None:
    content = tmp_path / "content"
    content.mkdir(parents=True)
    frontmatter = (
        "# TITLE\n\n"
        "<!-- ART SLOT [fm-cover]: a lone caster -->\n\n"
        "\\page\n\n"
        "# Reading This Book\n\n"
        "Some prose.\n\n"
        "\\column\n\n"
        "<!-- ART SLOT [fm-reading]: a scriptorium desk -->\n\n"
        "\\page\n\n"
        "## How to Read a Spell Block\n\nMore prose.\n"
    )
    (content / "frontmatter.md").write_text(frontmatter, encoding="utf-8")
    art_dir = tmp_path / "art"
    art_dir.mkdir()

    # No fm-* art yet -> both slots render exactly as today (background-free
    # cover, comment-only empty reading-column) — nothing new appears.
    no_art = book.build_book(content_dir=content, art_dir=art_dir)
    assert "\\covercoverart{" not in no_art.tex
    assert "\\readingartimage{" not in no_art.tex
    assert no_art.report.art_placeholder == ["fm-cover", "fm-reading"]
    assert no_art.report.art_real == []

    # Real art present -> cover gets a full-bleed background, reading gets
    # its reserved column filled.
    (art_dir / "fm-cover.png").write_bytes(b"c")
    (art_dir / "fm-reading.jpg").write_bytes(b"r")
    with_art = book.build_book(content_dir=content, art_dir=art_dir)
    assert "\\covercoverart{assets/img/processed/fm-cover.png}" in with_art.tex
    assert "\\readingartimage{assets/img/processed/fm-reading.jpg}" in with_art.tex
    assert with_art.report.art_real == ["fm-cover", "fm-reading"]
    assert with_art.report.art_placeholder == []
