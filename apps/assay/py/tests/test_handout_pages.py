"""Tests for multi-page handouts: ``\\page``, several named images, image placements, the
action glyphs and the text flow onto extra pages (``handout_pages``, ``handout_art``,
``handout_latex``, ``handout.sty``).

They run off the synthetic fixture in ``tests/fixtures/handout-pages/`` (invented text and two
tiny images, ``tall.png`` and ``band.png``). The compile test runs only where tectonic is on
PATH.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import pytest
from astra_assay import handout_art, handout_latex
from astra_assay.handout import parse_handout
from astra_assay.handout_model import HandoutError, Paragraph, RuleBlock

FIXTURE = Path(__file__).parent / "fixtures" / "handout-pages"
HEAD = "{{chapter\n# T\n}}\n\n"


def _source() -> str:
    return (FIXTURE / "handout.md").read_text(encoding="utf-8")


def _tex() -> str:
    return handout_latex.build_handout_tex(parse_handout(_source()), FIXTURE)


def _fails(source: str, message: str, handout_dir: Path | None = None) -> None:
    with pytest.raises(HandoutError, match=re.escape(message)):
        handout_latex.build_handout_tex(parse_handout(source), handout_dir)


def test_page_break_splits_pages() -> None:
    h = parse_handout(_source())
    assert [p.number for p in h.pages] == [1, 2]
    one, two = h.pages
    assert one.header is not None
    assert one.header.title == "Two Page Pattern"
    assert two.header is None
    # Page one's column two holds only the art, so it is dropped as empty.
    assert len(one.columns) == 1
    assert isinstance(one.columns[0][-1], RuleBlock)
    assert one.columns[0][-1].glyph == "t"
    assert [a.src for a in one.arts] == ["tall.png"]
    assert [a.src for a in two.arts] == ["band.png"]
    assert isinstance(two.columns[0][1], Paragraph)


def test_named_images_resolve_in_the_folder() -> None:
    images = handout_latex.handout_images(parse_handout(_source()), FIXTURE)
    assert images == [FIXTURE / "tall.png", FIXTURE / "band.png"]


def test_glyphs_emit_action_font_characters() -> None:
    tex = _tex()
    for glyph in "adtrf":
        assert f"\\actglyph{{{glyph}}}" in tex
    assert "\\hocardtitle{Quick Reply}{t}{Faction 2}" in tex
    assert "\\hocardtitle{Unbroken Card}{a}{Faction 3}" in tex


def test_placements_emit_slots() -> None:
    tex = _tex()
    # Each window is its mask, scaled from Homebrewery's 816px page to 612pt.
    assert "\\handoutart{two}{tall.png}{A tall image}{r}{t}{249.000pt}{300.750pt}{half}" in tex
    assert "\\handoutart{band}{band.png}{A wide band}{r}{t}{535.500pt}{356.250pt}{band}" in tex
    assert "\\handoutartcaption" not in tex  # no caption position: the default corner
    assert "\\handoutartcrop{band}{0.02500}{0.01250}{0.89250}" in tex
    assert "\\handoutartcrop{two}" not in tex  # no payload: cover-fit
    assert tex.count("\\hopagebegin") == 2
    assert tex.count("\\handoutpage") == 2
    assert tex.count("\\handouthead{") == 1
    assert tex.count("\\hodropcap") == 1
    assert tex.index("\\handoutfinish") > tex.rindex("\\handoutpage")


def test_a_later_page_shows_its_own_header() -> None:
    source = HEAD + "a\n\n\\page\n\n{{chapter\n## Part Two\n# U\n}}\n\nb\n\n\\page\n\nc\n"
    tex = handout_latex.build_handout_tex(parse_handout(source), None)
    assert tex.count("\\handouthead{") == 2
    assert "\\handouthead{Part Two}{U}" in tex


def test_slot_of() -> None:
    assert handout_art.slot_of(["chapterSidebarRightHalfTop", "--maskHeight:520px"]) == (
        "two",
        "t",
        "half",
    )
    assert handout_art.slot_of(["chapterSidebarLeftHalfBottom"]) == ("one", "b", "half")
    assert handout_art.slot_of(["fullSidebarLeft"]) == ("one", "t", "full")
    assert handout_art.slot_of(["fullSidebarBottom"]) == ("band", "b", "band")
    assert handout_art.slot_of(["narrowSidebarBottom"]) == ("band", "b", "band")
    assert handout_art.slot_of([]) == handout_art.DEFAULT_SLOT


def test_image_errors_name_the_line(tmp_path: Path) -> None:
    two_urls = _source().replace("![](tall.png)", "![](https://example.invalid/x.png)")
    _fails(two_urls, "line 29: ![](https://example.invalid/x.png) names no file", FIXTURE)
    missing = _source().replace("![](band.png)", "![](gone.png)")
    _fails(missing, "line 38: ![](gone.png) names no file", FIXTURE)
    # One image: a URL or a missing file falls back to art.*, else it fails.
    lone = HEAD + "{{imageWrapper\n{{borderImage ![](nope.png) }}\n}}\n"
    _fails(lone, "line 6: the handout has an {{imageWrapper}}, but ![](nope.png)", tmp_path)
    (tmp_path / "art.png").write_bytes((FIXTURE / "tall.png").read_bytes())
    assert handout_latex.handout_images(parse_handout(lone), tmp_path) == [tmp_path / "art.png"]


def test_structural_errors() -> None:
    art = "{{imageWrapper,chapterSidebarRightHalfTop\n{{borderImage ![](tall.png) }}\n}}\n\n"
    with pytest.raises(HandoutError, match=r"line 10: page 1 already has art in its column two"):
        parse_handout(HEAD + art + art)
    with pytest.raises(HandoutError, match=r"line 8: \\page inside \{\{ruleBlock\}\}"):
        parse_handout(HEAD + "{{ruleBlock\nx\n\n\\page\n}}\n")
    with pytest.raises(HandoutError, match="page 2 has more than two columns"):
        parse_handout(HEAD + "a\n\n\\page\n\nb\n\n\\column\n\nc\n\n\\column\n\nd\n")
    with pytest.raises(HandoutError, match="line 5: page 1 has a second header"):
        parse_handout(HEAD + HEAD)
    with pytest.raises(HandoutError, match="first page"):
        parse_handout("a\n\n\\page\n\n" + HEAD)
    with pytest.raises(HandoutError, match=r"line 5: unknown block \{\{x\}\}"):
        parse_handout(HEAD + "A {{x}} glyph.\n")


def _words(pdf: Path) -> list[tuple[int, float, str]]:
    """(page, xMin, word) for every word, from ``pdftotext -bbox``."""
    html = subprocess.run(
        ["pdftotext", "-bbox", str(pdf), "-"], capture_output=True, text=True, check=True
    ).stdout
    out: list[tuple[int, float, str]] = []
    for page_no, page in enumerate(html.split("<page ")[1:], start=1):
        words = re.finditer(r'<word xMin="([\d.]+)"[^>]*>([^<]*)</word>', page)
        out.extend((page_no, float(m.group(1)), m.group(2)) for m in words)
    return out


@pytest.mark.skipif(
    shutil.which("tectonic") is None or shutil.which("pdftotext") is None,
    reason="tectonic or pdftotext is not on PATH",
)
def test_fixture_flows_onto_an_extra_page_and_keeps_the_card_whole(tmp_path: Path) -> None:
    tectonic = shutil.which("tectonic")
    assert tectonic is not None
    pdf = tmp_path / "pages.pdf"
    images = handout_latex.handout_images(parse_handout(_source()), FIXTURE)
    overflow = handout_latex.compile_handout(_tex(), images, pdf, tectonic)
    assert overflow is True
    words = _words(pdf)
    assert max(page for page, _, _ in words) == 3
    # The card's title and its body's last line sit on one page, in one column.
    title = next((p, x) for p, x, w in words if w == "UNBROKEN")
    last = [(p, x) for p, x, w in words if w == "last"][-1]
    half = 612 / 2  # letter width in points
    assert title[0] == last[0]
    assert (title[1] < half) == (last[1] < half)
    # Every page has the footer label.
    assert sum(1 for _, _, w in words if w == "|") == 3


def test_overfull_lines_reports_only_lines_past_the_threshold() -> None:
    from astra_assay.handout_latex import overfull_lines

    log = (
        "Overfull \\hbox (17.60898pt too wide) in paragraph at lines 21--22\n"
        "Overfull \\hbox (0.89832pt too wide) in paragraph at lines 33--34\n"
        "Underfull \\hbox (badness 10000) in paragraph at lines 5--6\n"
    )
    assert overfull_lines(log) == [(17.60898, 21)]
