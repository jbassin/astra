"""Tests for ``assay handout``: the Homebrewery-dialect parser (``handout.py``) and the
LaTeX emission and compile (``handout_latex.py``).

They run off the synthetic fixture in ``tests/fixtures/handout/`` (invented text and a tiny
placeholder image), which uses every supported block. Real handouts are spoilers and live
only under ``assay.handouts-path``. The compile test runs only where tectonic is on PATH.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest
from astra_assay import handout_art, handout_latex
from astra_assay.handout import parse_handout
from astra_assay.handout_model import (
    DefRow,
    HandoutError,
    Heading,
    Paragraph,
    RuleBlock,
    Spacer,
    Table,
    Transcript,
)

FIXTURE = Path(__file__).parent / "fixtures" / "handout"


def _source() -> str:
    return (FIXTURE / "handout.md").read_text(encoding="utf-8")


def _tex() -> str:
    return handout_latex.build_handout_tex(parse_handout(_source()), FIXTURE)


def test_header_footer_and_art_are_lifted_out_of_the_flow() -> None:
    h = parse_handout(_source())
    assert h.eyebrow == "Addendum"
    assert h.title == "Test Pattern Æther"
    assert h.footer == "Addendum | Test Pattern"
    assert len(h.arts) == 1
    assert h.arts[0].caption == ["Line one", "Line two"]
    assert h.arts[0].caption_align == "l"
    # The trailing \column (before the imageWrapper) leaves no third column.
    assert len(h.pages) == 1
    assert len(h.pages[0].columns) == 2


def test_column_one_holds_the_prose() -> None:
    one = parse_handout(_source()).pages[0].columns[0]
    assert [type(el) for el in one] == [Paragraph, Heading, Paragraph, Spacer, Transcript]
    assert isinstance(one[1], Heading)
    assert one[1].level == 3
    assert one[1].text == "A {{joined Heading}}"


def test_rule_block_card() -> None:
    two = parse_handout(_source()).pages[0].columns[1]
    assert isinstance(two[0], Spacer)  # the art reservation, dropped at emission
    card = two[1]
    assert isinstance(card, RuleBlock)
    assert card.title == "Placeholder Feat"
    assert card.kind == "Faction 1"
    assert card.traits == ["Divine", "Fortune"]
    assert [(d.label, d.value) for d in card.definitions] == [
        ("Faction", "The Test Org"),
        ("Cost", "Nothing"),
    ]
    kinds = [type(el) for el in card.body]
    assert kinds == [Paragraph, Table, DefRow, Paragraph]
    table = card.body[1]
    assert isinstance(table, Table)
    assert table.header == ["**Path**", "**Bonus**"]
    assert table.aligns == ["c", "r"]
    assert table.rows == [["First", "One"], ["Second", "Two"]]


def test_transcript_and_right_aligned() -> None:
    one = parse_handout(_source()).pages[0].columns[0]
    assert isinstance(one[3], Spacer)
    assert one[3].lines == 1
    transcript = one[4]
    assert isinstance(transcript, Transcript)
    assert len(transcript.children) == 3
    fax = transcript.children[1]
    assert isinstance(fax, Paragraph)
    assert "forced break" in fax.text


def test_latex_emission() -> None:
    tex = _tex()
    assert "\\newcommand{\\liturgyroot}{" in tex
    assert "\\usepackage{handout}" in tex
    # The header in the source's case (handout.sty sets it in Wolpe Pegasus's real small
    # caps), coloured from the chapter's --color; the footer lower-cased, as the CSS does.
    assert "\\hochaptercolors{814B4B}{633636}" in tex
    assert "\\handouthead{Addendum}{Test Pattern \\hochar{Æ}ther}" in tex
    assert "\\renewcommand{\\liturgyfootnotelabel}{addendum \\textbar\\ test pattern}" in tex
    # The drop cap, then each word as (first-line small caps, plain).
    assert "\\hodropcap{T}\\hoflw{\\hosc{HE}}{he}\\hoflw{\\hosc{QUICK}}{quick}" in tex
    assert "\\hoflw{\\hodivine{You}}{\\hodivine{You}}" in tex
    assert "\\hodivine{You}" in tex
    assert "\\homortal{you}" in tex
    assert "\\hojoined{you}" in tex
    assert "\\subsubsection*{A \\hojoined{Heading}}" in tex
    assert "\\textit{underscored}" in tex
    assert "\\textit{starred}" in tex
    assert "\\textbf{bold}" in tex
    assert "{escaped}\\hoflw{*\\hosc{ASTERISK}*,}{*asterisk*,}" in tex  # an escape is literal
    assert "\\hoflw{\\hochar{–}}{\\hochar{–}}" in tex  # "--" is an en dash, as in Homebrewery
    assert "F\\hochar{æ}rrin" in tex
    assert (
        "\\handoutart{two}{art.png}{Line one\\\\Line two}{l}{t}{249.000pt}{390.000pt}{half}" in tex
    )
    assert "\\handoutartcaption{two}{l}{0.74288}{t}{0.84738}" in tex
    assert "\\handoutpage" in tex
    assert tex.count("\\handouthead{") == 1
    assert "\\handoutfinish" in tex
    assert "\\begin{document}" in tex


def test_card_emission() -> None:
    tex = _tex()
    assert "\\begin{hocard}" in tex
    assert "\\hocardtitle{Placeholder Feat}{}{Faction 1}" in tex
    assert "\\hotraits{\\hopill{Divine}\\hopill{Fortune}}" in tex
    assert "\\textbf{Faction} The Test Org\\\\\n\\textbf{Cost} Nothing" in tex
    assert "\\noindent\\textbf{Option A} \\textit{Named Thing}." in tex
    assert "\\textbf{Reroll!} \\actglyph{f} (\\textit{divine, fortune})" in tex
    assert ">{\\centering\\arraybackslash}X >{\\raggedleft\\arraybackslash}X" in tex
    assert "\\tblhead{\\textbf{Path}}" in tex


def test_transcript_emission() -> None:
    tex = _tex()
    assert "\\begin{hotranscript}\nhi hi :D\n\na fax line\\newline{} and a forced break" in tex
    # ¯\\_(ツ)_/¯: the escaped backslash is a literal and the underscores stay underscores.
    assert "\\hochar{¯}\\textbackslash{}\\_(\\hochar{ツ})\\_/\\hochar{¯}" in tex
    assert "\\begin{flushright}\n\\hochar{–} the sender\n\\end{flushright}" in tex


def test_art_spacer_is_dropped_but_others_stay() -> None:
    tex = _tex()
    column_two = tex.split("\\begin{handoutcolumntwo}")[1]
    assert column_two.lstrip().startswith("\\begin{hocard}")
    column_one = tex.split("\\begin{handoutcolumnone}")[1].split("\\end{handoutcolumnone}")[0]
    assert "\\vspace{1\\baselineskip}" in column_one


def test_no_homebrewery_markup_leaks() -> None:
    tex = _tex()
    assert "{{" not in tex
    assert "imgur" not in tex
    assert "example.invalid" not in tex
    assert "maskHeight" not in tex


@pytest.mark.parametrize(
    ("source", "message"),
    [
        (
            "{{chapter\n# T\n}}\n\nText.\n\n{{sidebar\nhello\n}}\n",
            "line 7: unknown block {{sidebar}}",
        ),
        ("{{chapter\n# T\n}}\n\nSome {{glow word}} here.\n", "line 5: unknown block {{glow}}"),
        (
            "{{chapter\n# T\n}}\n\n{{ruleBlock\n{{preamble\n{{title X}} {{badge Y}}\n}}\n}}\n",
            "line 7: unknown block {{badge}}",
        ),
        ("{{chapter\n# T\n}}\n\n{{transcript\n{{note x}}\n}}\n", "line 6: unknown block {{note}}"),
        (
            "{{chapter\n# T\n}}\n\n{{imageWrapper\n{{frame x}}\n}}\n",
            "line 6: unknown block {{frame}}",
        ),
    ],
)
def test_unknown_blocks_fail_with_name_and_line(source: str, message: str) -> None:
    with pytest.raises(HandoutError, match=message.replace("{", r"\{").replace("}", r"\}")):
        handout = parse_handout(source)
        handout_latex.build_handout_tex(handout, None)


def test_other_structural_errors() -> None:
    with pytest.raises(HandoutError, match="unclosed"):
        parse_handout("{{chapter\n# T\n")
    with pytest.raises(HandoutError, match="line 5: unbalanced"):
        parse_handout("{{chapter\n# T\n}}\n\nA stray {{divine opener.\n")
    with pytest.raises(HandoutError, match="Title"):
        parse_handout("Just text.\n")
    with pytest.raises(HandoutError, match="page 1 has more than two columns"):
        parse_handout("{{chapter\n# T\n}}\n\na\n\n\\column\n\nb\n\n\\column\n\nc\n")
    with pytest.raises(HandoutError, match=r"no art\.png"):
        handout_latex.build_handout_tex(parse_handout(_source()), None)


def test_find_art_prefers_png(tmp_path: Path) -> None:
    assert handout_art.find_art(tmp_path) is None
    (tmp_path / "art.jpeg").write_bytes(b"x")
    assert handout_art.find_art(tmp_path) == tmp_path / "art.jpeg"
    (tmp_path / "art.png").write_bytes(b"x")
    assert handout_art.find_art(tmp_path) == tmp_path / "art.png"


@pytest.mark.skipif(shutil.which("tectonic") is None, reason="tectonic is not on PATH")
def test_fixture_compiles_to_one_page(tmp_path: Path) -> None:
    tectonic = shutil.which("tectonic")
    assert tectonic is not None
    pdf = tmp_path / "fixture.pdf"
    overflow = handout_latex.compile_handout(_tex(), [FIXTURE / "art.png"], pdf, tectonic)
    assert pdf.read_bytes().startswith(b"%PDF")
    assert overflow is False
    assert sorted(p.name for p in tmp_path.iterdir()) == ["fixture.pdf"]
    if shutil.which("pdftotext"):
        text = subprocess.run(
            ["pdftotext", str(pdf), "-"], capture_output=True, text=True, check=True
        ).stdout
        assert "QUICK BROWN FOX" in text  # the first line, in small caps
        assert "Placeholder Feat".upper() in text
        assert "forced break" in text


def test_chapter_colors_follow_the_css() -> None:
    """hsl(from --color ...): eyebrow h s clamp(40, l, 60); glow h max(s/2, 30)
    clamp(30, l*0.75, 70), only with the gradient class."""
    assert handout_latex.chapter_colors(["gradient", "--color:#7c4848"]) == ("814B4B", "633636")
    assert handout_latex.chapter_colors(["--color:#7c4848"]) == ("814B4B", "")
    assert handout_latex.chapter_colors([]) == ("BC9E5C", "")  # .chapter's default --color


def test_first_line_words_carry_emphasis_and_spans() -> None:
    pairs, after = handout_latex.first_line_words("ne **two words** {{divine You}}, _x y_ z")
    assert pairs == [
        ("\\hosc{NE}", "ne"),
        ("\\textbf{\\hosc{TWO}}", "\\textbf{two}"),
        ("\\textbf{\\hosc{WORDS}}", "\\textbf{words}"),
        ("\\hodivine{You},", "\\hodivine{You},"),
        ("\\textit{\\hosc{X}}", "\\textit{x}"),
        ("\\textit{\\hosc{Y}}", "\\textit{y}"),
        ("\\hosc{Z}", "z"),
    ]
    assert after == ""
    pairs, after = handout_latex.first_line_words("a *b<br>c* d")
    assert pairs == [("\\hosc{A}", "a")]
    assert after == "\\textit{b\\newline{}c} d"
