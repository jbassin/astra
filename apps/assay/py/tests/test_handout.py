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
from astra_assay import handout_latex
from astra_assay.handout import (
    DefRow,
    HandoutError,
    Heading,
    Paragraph,
    RuleBlock,
    Spacer,
    Table,
    Transcript,
    parse_handout,
)

FIXTURE = Path(__file__).parent / "fixtures" / "handout"


def _source() -> str:
    return (FIXTURE / "handout.md").read_text(encoding="utf-8")


def _tex() -> str:
    return handout_latex.build_handout_tex(parse_handout(_source()), FIXTURE / "art.png")


def test_header_footer_and_art_are_lifted_out_of_the_flow() -> None:
    h = parse_handout(_source())
    assert h.eyebrow == "Addendum"
    assert h.title == "Test Pattern Æther"
    assert h.footer == "Addendum | Test Pattern"
    assert h.art is not None
    assert h.art.caption == ["Line one", "Line two"]
    assert h.art.caption_align == "l"
    # The trailing \column (before the imageWrapper) leaves no third column.
    assert len(h.columns) == 2


def test_column_one_holds_the_prose() -> None:
    one = parse_handout(_source()).columns[0]
    assert [type(el) for el in one] == [Paragraph, Heading, Paragraph]
    assert isinstance(one[1], Heading)
    assert one[1].level == 3
    assert one[1].text == "A {{joined Heading}}"


def test_rule_block_card() -> None:
    two = parse_handout(_source()).columns[1]
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
    two = parse_handout(_source()).columns[1]
    assert isinstance(two[2], Spacer)
    assert two[2].lines == 1
    transcript = two[3]
    assert isinstance(transcript, Transcript)
    assert len(transcript.children) == 3
    fax = transcript.children[1]
    assert isinstance(fax, Paragraph)
    assert "forced break" in fax.text


def test_latex_emission() -> None:
    tex = _tex()
    assert "\\newcommand{\\liturgyroot}{" in tex
    assert "\\usepackage{handout}" in tex
    assert "\\hoeyebrow{Addendum}" in tex
    assert "\\hotitle{T\\hosc{EST} P\\hosc{ATTERN} \\hochar{Æ}\\hosc{THER}}" in tex
    assert "\\renewcommand{\\liturgyfootnotelabel}{A\\hosc{DDENDUM} \\textbar\\ " in tex
    assert "\\noindent\\liturgydropcap{T}{he} quick brown fox" in tex
    assert "\\hodivine{You}" in tex
    assert "\\homortal{you}" in tex
    assert "\\hojoined{you}" in tex
    assert "\\subsubsection*{A \\hojoined{Heading}}" in tex
    assert "\\textit{underscored}" in tex
    assert "\\textit{starred}" in tex
    assert "\\textbf{bold}" in tex
    assert "escaped *asterisk*" in tex  # a markdown escape is a literal
    assert "a dash \\hochar{—} here" in tex
    assert "F\\hochar{æ}rrin" in tex
    assert "\\handoutart{art.png}{Line one\\\\Line two}{l}" in tex
    assert "\\handoutpage" in tex
    assert "\\begin{document}" in tex


def test_card_emission() -> None:
    tex = _tex()
    assert "\\begin{hocard}" in tex
    assert "\\spelltitle{\\MakeUppercase{Placeholder Feat}}{}{Faction 1}" in tex
    assert "\\hotraits{\\pill{Divine} \\pill{Fortune}}" in tex
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
    assert "\\begin{flushright}\n\\hochar{—} the sender\n\\end{flushright}" in tex


def test_art_spacer_is_dropped_but_others_stay() -> None:
    tex = _tex()
    column_two = tex.split("\\begin{handoutcolumntwo}")[1]
    assert column_two.lstrip().startswith("\\begin{hocard}")
    assert "\\vspace{1\\baselineskip}" in column_two


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
    with pytest.raises(HandoutError, match="at most two columns"):
        parse_handout("{{chapter\n# T\n}}\n\na\n\n\\column\n\nb\n\n\\column\n\nc\n")
    with pytest.raises(HandoutError, match=r"no art\.png"):
        handout_latex.build_handout_tex(parse_handout(_source()), None)


def test_find_art_prefers_png(tmp_path: Path) -> None:
    assert handout_latex.find_art(tmp_path) is None
    (tmp_path / "art.jpeg").write_bytes(b"x")
    assert handout_latex.find_art(tmp_path) == tmp_path / "art.jpeg"
    (tmp_path / "art.png").write_bytes(b"x")
    assert handout_latex.find_art(tmp_path) == tmp_path / "art.png"


@pytest.mark.skipif(shutil.which("tectonic") is None, reason="tectonic is not on PATH")
def test_fixture_compiles_to_one_page(tmp_path: Path) -> None:
    tectonic = shutil.which("tectonic")
    assert tectonic is not None
    pdf = tmp_path / "fixture.pdf"
    overflow = handout_latex.compile_handout(_tex(), FIXTURE / "art.png", pdf, tectonic)
    assert pdf.read_bytes().startswith(b"%PDF")
    assert overflow is False
    assert sorted(p.name for p in tmp_path.iterdir()) == ["fixture.pdf"]
    if shutil.which("pdftotext"):
        text = subprocess.run(
            ["pdftotext", str(pdf), "-"], capture_output=True, text=True, check=True
        ).stdout
        assert "quick brown fox" in text
        assert "Placeholder Feat".upper() in text
        assert "forced break" in text
