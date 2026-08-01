"""``assay export-book`` — the "Liturgy of the Iridite Vol.2" book generator.

Converts the canonical homebrew spell store (``apps/assay/homebrew/spells/``,
173 Foundry-shaped docs) + the 8 school trait blurbs
(``apps/assay/homebrew/traits/``) into a **LaTeX** book at
``apps/codex/books/liturgy_vol2/liturgy_of_the_iridite_vol2.tex``, compiled
with ``tectonic`` into a PDF alongside it. The visual style lives in the
stakeholder-approved ``liturgy.sty`` (parchment, chapter openers, spell-block
plumbing, trait pills) — this module emits LaTeX *content* against that
style layer; it never re-derives the look.

Book structure (Track A of a two-track build — Track B authors prose
fragments under ``<out>/content/``, in a small neutral markup dialect this
module parses; see ``_parse_neutral``):

1. front matter — ``content/frontmatter.md`` (cover + credits/imprimatur +
   "Reading This Book" + "How to Read a Spell Block"), consumed fail-soft
   (a placeholder cover stands in if absent);
2. a real LaTeX table of contents (``\\tocentry`` + ``\\pageref``, so page
   numbers come from the actual compiled layout — there is no manual
   pagination model anymore: LaTeX/tectonic flows and paginates natively);
3. eight school chapters in the fixed order below (seraphic LAST — the
   capstone: one ritual, Worldweaver), each = opener
   (``content/chapters/<school>.md``, else a generated fallback built from
   the school's trait blurb) + a spell-list table (summaries from
   ``content/summaries.json``, blank fail-soft) + the school's spells sorted
   by (rank, name) as spell blocks.

**Determinism:** sorted store glob, stable sort keys, no timestamps —
double runs are byte-identical .tex.

**Structured intermediate:** every spell is first turned into a
``SpellRecord`` (name/rank/school/kind/glyph/rarity/traits/rows/body
blocks/heightened pairs — all still *raw* text) and only THEN emitted to
LaTeX (escaping + macro calls happen at emission, never earlier) — the
parse layer (``_DescriptionParser``, ``parse_description``,
``convert_description``) stays presentation-neutral so it could feed any
renderer, not just this one.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from astra_observe import get_tracer

APP_ROOT = Path(__file__).resolve().parents[2]  # src/astra_assay/book.py -> apps/assay
REPO_ROOT = APP_ROOT.parents[1]
STORE_DIR = APP_ROOT / "homebrew" / "spells"
TRAITS_DIR = APP_ROOT / "homebrew" / "traits"
DEFAULT_OUT_DIR = REPO_ROOT / "apps/codex/books/liturgy_vol2"
BOOK_TEX_NAME = "liturgy_of_the_iridite_vol2.tex"
BOOK_PDF_NAME = "liturgy_of_the_iridite_vol2.pdf"

#: Chapter order — seraphic deliberately LAST (the capstone: Worldweaver).
SCHOOLS: tuple[str, ...] = (
    "antillurgy",
    "chronomancy",
    "gestalt",
    "kosmoturgy",
    "memetics",
    "mercuromancy",
    "planara",
    "seraphic",
)

#: Cast-time values that render as a title glyph instead of a **Cast** row —
#: raw ``\actionfont`` characters (see ``liturgy.sty``'s ``\spelltitle`` /
#: ``\actglyph``), not markup macros.
ACTION_GLYPHS: dict[str, str] = {
    "1": "1",
    "2": "2",
    "3": "3",
    "reaction": "r",
}

#: ``<span class="action-glyph">X</span>`` content -> ``\actionfont`` char.
SPAN_GLYPHS: dict[str, str] = {
    "1": "1",
    "2": "2",
    "3": "3",
    "r": "r",
    "f": "f",
}

_UUID_RE = re.compile(r"@UUID\[([^\]]+)\](?:\{([^}]*)\})?")

#: Stakeholder art lands in ``<out>/assets/img/processed/<slot>.(png|jpg)``,
#: keyed by slot id (a school name for the 8 chapter openers, else
#: "fm-cover"/"fm-reading" — see ``content/ART-SLOTS.md``). png checked
#: before jpg (both existing for one slot would be unexpected, but the
#: order must still be deterministic).
_ART_EXTS: tuple[str, ...] = ("png", "jpg")


class BookBuildError(Exception):
    """A hard structural failure (e.g. a spell landing in zero or several
    school chapters, or emitted LaTeX containing unconverted residue) — the
    build STOPS rather than emit a wrong book."""


# ---------------------------------------------------------------------------
# Description HTML -> presentation-neutral blocks (stdlib html.parser).
# ---------------------------------------------------------------------------


@dataclass
class _Block:
    kind: str  # "p" | "hr" | "table" | "list"
    text: str = ""
    header: list[str] = field(default_factory=list)
    rows: list[list[str]] = field(default_factory=list)
    items: list[str] = field(default_factory=list)


def _flatten_enrichers(text: str) -> str:
    """``@UUID[...]{Label}`` -> Label; bare ``@UUID[...]`` -> last path
    segment, hyphens -> spaces. (No @Damage/@Check/@Template enrichers exist
    in the store — verified by grep — so only @UUID is handled.)"""

    def repl(m: re.Match[str]) -> str:
        if m.group(2) is not None:
            return m.group(2)
        return m.group(1).split(".")[-1].replace("-", " ")

    return _UUID_RE.sub(repl, text)


class _DescriptionParser(HTMLParser):
    """Parses a store ``description.value`` HTML fragment into ``_Block``s.

    Inline: ``<strong>`` -> ``**..**``, ``<em>`` -> ``*..*`` (defensive; the
    store has none), ``<span class="action-glyph">X</span>`` -> a
    ``\\x00GLYPH:X\\x00END`` sentinel. Blocks: ``<p>``, ``<hr>``, ``<table>``,
    ``<ul>``/``<ol>``. Output is presentation-neutral markup text — no
    escaping and no glyph resolution happen here; both are emission-time
    concerns (see ``_render_inline``), so this parser could feed any
    renderer, not just LaTeX.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[_Block] = []
        self._buf: list[str] = []
        self._in_glyph_span = False
        self._table: _Block | None = None
        self._in_thead = False
        self._row: list[str] | None = None
        self._row_has_th = False
        self._list: _Block | None = None

    # -- inline buffer ------------------------------------------------------
    def _emit(self, s: str) -> None:
        self._buf.append(s)

    def _take_buf(self) -> str:
        text = re.sub(r"\s+", " ", "".join(self._buf)).strip()
        self._buf = []
        return text

    # -- HTMLParser hooks ---------------------------------------------------
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "p":
            self._buf = []
        elif tag == "strong":
            self._emit("**")
        elif tag == "em":
            self._emit("*")
        elif tag == "span":
            if dict(attrs).get("class") == "action-glyph":
                self._in_glyph_span = True
                self._emit("\x00GLYPH:")
        elif tag == "hr":
            self.blocks.append(_Block("hr"))
        elif tag == "br":
            self._emit(" ")
        elif tag == "table":
            self._table = _Block("table")
        elif tag == "thead":
            self._in_thead = True
        elif tag == "tr":
            self._row = []
            self._row_has_th = False
        elif tag in ("th", "td"):
            self._buf = []
            if tag == "th":
                self._row_has_th = True
        elif tag in ("ul", "ol"):
            self._list = _Block("list")
        elif tag == "li":
            self._buf = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "p":
            text = self._take_buf()
            if not text:
                return
            if self._list is not None:
                self._list.items.append(text)
            else:
                self.blocks.append(_Block("p", text=text))
        elif tag == "strong":
            self._emit("**")
        elif tag == "em":
            self._emit("*")
        elif tag == "span" and self._in_glyph_span:
            self._in_glyph_span = False
            self._emit("\x00END")
        elif tag in ("th", "td"):
            cell = self._take_buf()
            if self._row is not None:
                self._row.append(cell)
        elif tag == "tr":
            if self._table is not None and self._row is not None:
                # A header row is either explicitly <thead>-wrapped OR just
                # a bare <tr> of <th> cells (the store has BOTH forms — e.g.
                # elemental-sink's table has <th> cells with no <thead>).
                is_header = (self._in_thead or self._row_has_th) and not self._table.header
                if is_header:
                    self._table.header = self._row
                else:
                    self._table.rows.append(self._row)
            self._row = None
            self._row_has_th = False
        elif tag == "thead":
            self._in_thead = False
        elif tag == "table":
            if self._table is not None:
                self.blocks.append(self._table)
            self._table = None
        elif tag in ("ul", "ol"):
            if self._list is not None:
                self.blocks.append(self._list)
            self._list = None
        elif tag == "li":
            text = self._take_buf()
            if text and self._list is not None:
                self._list.items.append(text)

    def handle_data(self, data: str) -> None:
        if self._in_glyph_span:
            self._emit(data)
        else:
            self._emit(_flatten_enrichers(data))


def parse_description(html_value: str) -> list[_Block]:
    parser = _DescriptionParser()
    parser.feed(html_value)
    parser.close()
    return parser.blocks


# ---------------------------------------------------------------------------
# Blocks -> structured body + lifted rows (Trigger/Requirements, Heightened).
# ---------------------------------------------------------------------------

_HEIGHTENED_RE = re.compile(r"^\*\*Heightened \(([^)]*)\)\*\*\s*(.*)$", re.DOTALL)
_LEAD_LIFT_RE = re.compile(r"^\*\*(Trigger|Requirements)\*\*\s*(.*)$", re.DOTALL)


@dataclass
class ConvertedDescription:
    body_blocks: list[_Block]
    heightened: list[tuple[str, str]]  # (level label e.g. "+1"/"8th", text)
    trigger: str | None
    requirements: str | None


def convert_description(html_value: str) -> ConvertedDescription:
    blocks = parse_description(html_value)

    # Leading **Trigger** / **Requirements** paragraph -> definitions row.
    trigger: str | None = None
    requirements: str | None = None
    while blocks and blocks[0].kind == "p":
        m = _LEAD_LIFT_RE.match(blocks[0].text)
        if m is None:
            break
        if m.group(1) == "Trigger" and trigger is None:
            trigger = m.group(2).strip()
        elif m.group(1) == "Requirements" and requirements is None:
            requirements = m.group(2).strip()
        else:  # pragma: no cover - duplicated lead paragraph, keep in body
            break
        blocks = blocks[1:]

    # The LAST <hr> whose following content starts with a **Heightened**
    # paragraph is the body/postamble boundary; every paragraph after it must
    # be a Heightened entry (the store convention), else the hr stays mid-body.
    split_at: int | None = None
    for i in range(len(blocks) - 1, -1, -1):
        if blocks[i].kind != "hr":
            continue
        tail = blocks[i + 1 :]
        if tail and all(b.kind == "p" and _HEIGHTENED_RE.match(b.text) is not None for b in tail):
            split_at = i
        break  # only the LAST hr is a candidate

    heightened: list[tuple[str, str]] = []
    if split_at is not None:
        for b in blocks[split_at + 1 :]:
            m = _HEIGHTENED_RE.match(b.text)
            assert m is not None  # guaranteed by the split_at scan
            heightened.append((m.group(1).strip(), m.group(2).strip()))
        blocks = blocks[:split_at]

    return ConvertedDescription(
        body_blocks=blocks,
        heightened=heightened,
        trigger=trigger,
        requirements=requirements,
    )


# ---------------------------------------------------------------------------
# LaTeX escaping + inline rendering — the ONE place raw text becomes LaTeX.
# ---------------------------------------------------------------------------

_LATEX_SPECIAL: dict[str, str] = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}
_LATEX_SPECIAL_RE = re.compile("|".join(re.escape(c) for c in _LATEX_SPECIAL))

#: Runs of 2-3 ASCII hyphens (the store/fragment prose convention for a
#: dash) are normalized straight to a literal em dash, bypassing XeTeX's
#: ``Ligatures=TeX`` engine entirely — the book's display faces (Bookinsanity,
#: Scaly Sans, Mr Eaves Small Caps) measurably lack an EN DASH glyph (the
#: ligature's usual target for "--"), confirmed via `fontTools` cmap
#: inspection and a live tectonic compile (missing-character warnings).
_DASH_RUN_RE = re.compile(r"-{2,3}")
#: A handful of literal Unicode characters present in the store/fragment
#: text that the SAME fonts also lack — MINUS SIGN (used in "level −1"),
#: MIDDLE DOT (the cover subtitle's "·"), and EN DASH itself, if it ever
#: arrives pre-ligated rather than as "--". Mapped to covered look-alikes.
_UNSAFE_GLYPH_MAP: dict[str, str] = {
    "–": "—",  # en dash -> em dash
    "−": "-",  # minus sign -> ascii hyphen
    "·": "-",  # middle dot -> ascii hyphen
}
_UNSAFE_GLYPH_RE = re.compile("|".join(re.escape(c) for c in _UNSAFE_GLYPH_MAP))


def _latex_escape_text(text: str) -> str:
    """Escape LaTeX-special characters in a plain-text run. Most Unicode
    (—, Æ, æ, ×, smart quotes, ...) passes through untouched — XeTeX/fontspec
    handles it natively (verified against the compiled PDF) — except the
    small uncovered-glyph set normalized above."""
    text = _DASH_RUN_RE.sub("—", text)
    text = _UNSAFE_GLYPH_RE.sub(lambda m: _UNSAFE_GLYPH_MAP[m.group(0)], text)
    return _LATEX_SPECIAL_RE.sub(lambda m: _LATEX_SPECIAL[m.group(0)], text)


#: Tokens the inline renderer treats specially: markdown-ish bold/italic
#: toggles (as emitted by ``_DescriptionParser``, or hand-authored in
#: fragment prose) and the neutral action-glyph sentinel. Everything else is
#: a plain-text run, LaTeX-escaped.
_INLINE_TOKEN_RE = re.compile(r"(\*\*|\*|\x00GLYPH:.*?\x00END)")


def _render_inline(text: str, warnings: list[str]) -> str:
    out: list[str] = []
    bold = False
    italic = False
    for piece in _INLINE_TOKEN_RE.split(text):
        if not piece:
            continue
        if piece == "**":
            out.append("}" if bold else "\\textbf{")
            bold = not bold
        elif piece == "*":
            out.append("}" if italic else "\\textit{")
            italic = not italic
        elif piece.startswith("\x00GLYPH:"):
            content = piece[len("\x00GLYPH:") : -len("\x00END")].strip().lower()
            glyph = SPAN_GLYPHS.get(content)
            if glyph is None:
                warnings.append(f"unknown action-glyph span content {content!r} kept as text")
                out.append(_latex_escape_text(content))
            else:
                out.append(f"\\actglyph{{{glyph}}}")
        else:
            out.append(_latex_escape_text(piece))
    return "".join(out)


def _render_row_value(raw: str, warnings: list[str]) -> str:
    """Plain-string system fields (Range/Cost/Requirements/...) are neither
    HTML-parsed nor guaranteed markup-free — flatten any stray enricher then
    render inline (a no-op beyond escaping unless the text happens to carry
    ``**``/``*`` markup, e.g. a lifted Trigger/Requirements paragraph)."""
    return _render_inline(_flatten_enrichers(raw), warnings)


# ---------------------------------------------------------------------------
# Body blocks -> LaTeX (tables, lists, paragraphs, rules).
# ---------------------------------------------------------------------------


def _col_max_word_len(block: _Block, col_idx: int, header_text: str) -> int:
    """Longest single WORD (not cell) in a column, header + every row —
    narrow-column sizing must survive whatever the row DATA contains, not
    just the header label. A short header like "Ray" paired with long row
    values ("Disintegration Ray") was getting the narrow bucket on header
    length alone and clipping mid-word (S3 live-render catch, Eye Stalks
    d8 table) — measuring only the header reproduces that bug."""
    max_len = 0
    texts = [header_text] + [row[col_idx] for row in block.rows if col_idx < len(row)]
    for text in texts:
        for word in re.split(r"\s+", text.strip("*_ \t")):
            max_len = max(max_len, len(word.strip("*_")))
    return max_len


def _render_table_latex(block: _Block, warnings: list[str]) -> str:
    header = block.header or ([""] * (len(block.rows[0]) if block.rows else 1))
    n = max(1, len(header))
    if n == 1:
        cols = ["X"]
    else:
        # Narrow+centered ONLY when the LONGEST WORD anywhere in the column
        # (header or data) is short (a "d8"/"1d6" roll column) — sizing
        # narrow off the header alone wrapped a long header like "Damage
        # Type" into an unreadable per-word stack (live tectonic render
        # caught this: "Damag/Type") AND, separately, let a short header
        # over long row data ("Ray" over "Disintegration Ray") clip mid-word
        # (also a live tectonic render catch). The last column always gets
        # the flexible remainder.
        #
        # Widths are in EM, not \linewidth fractions: these tables render in
        # TWO different containers — the wide chapter-opening spell-list
        # (\linewidth = the full page) and in-block random-effect tables
        # inside the two-column spellflow (\linewidth = one ~8.5cm column).
        # A \linewidth-fraction tuned against the wide container is roughly
        # HALF as wide in the narrow one — the Sphere of Ruin 1d6 table
        # (in-block) hyphenated "crea-ture" mid-word at the same 0.22
        # fraction that renders "Curse Effect"/"Failure" cleanly elsewhere
        # (live tectonic render catch). EM is tied to font size, not
        # container width, so one set of buckets now serves both.
        cols = []
        for i, h in enumerate(header):
            if i == n - 1:
                cols.append("X")
                continue
            max_word = _col_max_word_len(block, i, h)
            if max_word <= 5:
                cols.append(r">{\centering\arraybackslash}p{2.6em}")
            elif max_word <= 13:
                cols.append(r"p{8.5em}")
            else:
                # A single word past 13 chars ("Disintegration Ray", 15)
                # still clipped at the medium bucket (live tectonic render
                # catch, same class as the len(header)-only bug above) —
                # widen further rather than re-guess a second flat bucket.
                cols.append(r"p{12em}")
    colspec = "@{}" + " ".join(cols) + "@{}"

    # BREAKABLE emission (S4 live-render catch, "Eye Stalks" table): a single
    # multi-row tabularx has no page-break points, so an in-block table taller
    # than one column either overflows into the footer or — worse, confirmed
    # against the pre-fix PDF — silently LOSES whatever text falls past the
    # page edge (tectonic never re-flows it onto the next page/column at
    # all). \tblrow (liturgy.sty) wraps ONE physical table-row (or, for the
    # header, the header PLUS the first data row together) in its own
    # tabularx built from the SAME colspec every call, so tectonic can break
    # the ordinary paragraph glue between calls exactly like it already does
    # between any two flowing blocks. Striping is set explicitly per row via
    # \rowcolor (stable across whatever page a row lands on) rather than the
    # retired \rowcolors directive, which counts physical rows within ONE
    # table and can't survive a table becoming N independent tables.
    header_cells = " & ".join(f"\\tblhead{{{_render_inline(h, warnings)}}}" for h in header)
    row_cells = [" & ".join(_render_inline(c, warnings) for c in row) for row in block.rows]

    lines = [
        "\\begingroup",
        "\\renewcommand{\\arraystretch}{1.15}",
        # kill the ambient \parskip between our per-row paragraphs — each
        # \tblrow call is its own paragraph (that's what makes it a legal
        # break point) but the rows must still look like ONE seamless table
        # when nothing forces a break, not a stack of separately-spaced boxes.
        "\\setlength{\\parskip}{0pt}",
    ]
    # Header + first data row travel together in ONE \tblrow call — an
    # atomic unit that can only move whole to the next column, so a break
    # never strands a bare header at the bottom of one and the first row
    # at the top of the next.
    header_body = ["\\hline", header_cells + " \\\\", "\\hline"]
    if row_cells:
        header_body.append("\\rowcolor{TableBlue}")
        header_body.append(row_cells[0] + " \\\\")
        if len(row_cells) == 1:
            header_body.append("\\hline")
    lines.append(f"\\tblrow{{{colspec}}}{{{chr(10).join(header_body)}}}")

    for idx, cells in enumerate(row_cells[1:], start=1):
        color = "TableBlue" if idx % 2 == 0 else "TableWhite"
        row_body = [f"\\rowcolor{{{color}}}", cells + " \\\\"]
        if idx == len(row_cells) - 1:
            row_body.append("\\hline")
        lines.append("")  # blank line -> a new (breakable) paragraph
        lines.append(f"\\tblrow{{{colspec}}}{{{chr(10).join(row_body)}}}")

    lines.append("\\endgroup")
    return "\n".join(lines)


def _render_block_latex(block: _Block, warnings: list[str]) -> str:
    if block.kind == "p":
        return _render_inline(block.text, warnings)
    if block.kind == "hr":
        return "\\bodyhr"
    if block.kind == "list":
        items = "\n".join(f"\\item {_render_inline(i, warnings)}" for i in block.items)
        return "\\begin{itemize}\n" + items + "\n\\end{itemize}"
    if block.kind == "table":
        return _render_table_latex(block, warnings)
    raise BookBuildError(f"unknown block kind {block.kind!r}")


def _render_body_blocks(blocks: list[_Block], warnings: list[str]) -> str:
    return "\n\n".join(_render_block_latex(b, warnings) for b in blocks)


# ---------------------------------------------------------------------------
# Spell doc -> SpellRecord (structure only, no LaTeX) -> LaTeX (emission).
# ---------------------------------------------------------------------------


def _title_case(trait: str) -> str:
    return " ".join(part.capitalize() for part in trait.replace("-", " ").split(" "))


def _format_defense(defense: dict[str, Any]) -> str:
    save = defense.get("save") or {}
    statistic = str(save.get("statistic", "")).capitalize()
    return f"basic {statistic}" if save.get("basic") else statistic


def _format_area(area: dict[str, Any]) -> str:
    return f"{area['value']}-foot {area['type']}"


def _format_duration(duration: dict[str, Any]) -> str:
    """PF2e print style: ``sustained up to 1 minute`` (every sustained store
    value is a bare span like "1 minute"; none already says "sustained")."""
    value = str(duration.get("value") or "").strip()
    if duration.get("sustained"):
        if not value:
            return "sustained"
        if "sustain" in value.lower():
            return value
        return f"sustained up to {value}"
    return value


def spell_school(doc: dict[str, Any]) -> list[str]:
    traits = [str(t) for t in doc["system"]["traits"].get("value") or []]
    return [t for t in traits if t in SCHOOLS]


@dataclass
class SpellRow:
    label: str
    value: str  # raw text — escaped at emission


@dataclass
class SpellRecord:
    name: str
    slug: str
    rank: int
    school: str
    kind: str  # "Ritual" | "Cantrip" | "Spell"
    is_ritual: bool
    time_value: str
    glyph: str | None  # raw \actionfont char, or None (title shows no glyph)
    rarity: str
    traits: list[str]  # OTHER traits, title-cased, alphabetical (school/rarity excluded)
    rows: list[SpellRow]
    body_blocks: list[_Block]
    heightened: list[tuple[str, str]]
    warnings: list[str] = field(default_factory=list)


def build_spell_record(doc: dict[str, Any], slug: str, school: str) -> SpellRecord:
    system = doc["system"]
    name = doc["name"]
    rank = int(system["level"]["value"])
    time_value = str(system["time"]["value"]).strip()
    ritual = system.get("ritual")
    is_ritual = bool(ritual)
    traits_obj = system["traits"]
    is_cantrip = "cantrip" in (traits_obj.get("value") or [])

    conv = convert_description(system["description"]["value"])
    warnings: list[str] = []

    kind = "Ritual" if is_ritual else ("Cantrip" if is_cantrip else "Spell")
    glyph = None if is_ritual else ACTION_GLYPHS.get(time_value.lower())

    rarity = traits_obj.get("rarity", "common")
    other_traits = sorted(t for t in traits_obj.get("value") or [] if t != school)
    traits_titled = [_title_case(t) for t in other_traits]

    rows: list[SpellRow] = []

    def row(label: str, value: str) -> None:
        if value:
            rows.append(SpellRow(label, value))

    requirements = str(system.get("requirements") or "").strip() or conv.requirements or ""
    if is_ritual:
        # Official PF2e ritual row order (verified against the corpus
        # `ritual/resurrect.json` statblock): Cast; Cost; Secondary Casters;
        # Primary Check; Secondary Checks; then Range/Targets/Duration.
        row("Cast", time_value)
        row("Cost", str(system.get("cost", {}).get("value") or "").strip())
        secondary = ritual.get("secondary") or {}
        casters = secondary.get("casters")
        if casters:
            row("Secondary Casters", str(casters))
        row("Primary Check", str((ritual.get("primary") or {}).get("check") or "").strip())
        row("Secondary Checks", str(secondary.get("checks") or "").strip())
        row("Requirements", requirements)
        if conv.trigger:
            row("Trigger", conv.trigger)
        row("Range", str(system.get("range", {}).get("value") or "").strip())
        if system.get("area"):
            row("Area", _format_area(system["area"]))
        row("Targets", str(system.get("target", {}).get("value") or "").strip())
        row("Duration", _format_duration(system.get("duration") or {}))
    else:
        traditions = traits_obj.get("traditions") or []
        row("Traditions", ", ".join(traditions))
        if glyph is None:
            row("Cast", time_value)
        row("Cost", str(system.get("cost", {}).get("value") or "").strip())
        row("Requirements", requirements)
        if conv.trigger:
            row("Trigger", conv.trigger)
        row("Range", str(system.get("range", {}).get("value") or "").strip())
        if system.get("area"):
            row("Area", _format_area(system["area"]))
        row("Targets", str(system.get("target", {}).get("value") or "").strip())
        if system.get("defense"):
            row("Defense", _format_defense(system["defense"]))
        row("Duration", _format_duration(system.get("duration") or {}))

    return SpellRecord(
        name=name,
        slug=slug,
        rank=rank,
        school=school,
        kind=kind,
        is_ritual=is_ritual,
        time_value=time_value,
        glyph=glyph,
        rarity=rarity,
        traits=traits_titled,
        rows=rows,
        body_blocks=conv.body_blocks,
        heightened=conv.heightened,
        warnings=warnings,
    )


def _pills_latex(rec: SpellRecord, warnings: list[str]) -> str:
    """Pill row order (stakeholder rule): rarity pill (if any) -> school
    pill (purple ``\\schoolpill``) -> remaining traits alphabetical."""
    pills: list[str] = []
    if rec.rarity in ("uncommon", "rare"):
        pills.append(f"\\raritypill{{{_render_inline(rec.rarity, warnings)}}}")
    pills.append(f"\\schoolpill{{{_render_inline(_title_case(rec.school), warnings)}}}")
    pills.extend(f"\\pill{{{_render_inline(t, warnings)}}}" for t in rec.traits)
    return "\\hspace{1pt}".join(pills) + "\\par"


def emit_spell_latex(rec: SpellRecord) -> str:
    """``SpellRecord`` -> a full ``blockhead``/``blockrule``/body/postamble
    LaTeX spell block (mirrors the S1-approved ``sample.tex`` usage of
    ``liturgy.sty``'s spell-block macros). Emission-time warnings (e.g. an
    unrecognized action-glyph span) are appended into ``rec.warnings``."""
    parts: list[str] = [
        "\\begin{blockhead}",
        f"\\spelltitle{{{_render_inline(rec.name, rec.warnings)}}}"
        f"{{{rec.glyph or ''}}}{{{rec.kind} {rec.rank}}}",
        _pills_latex(rec, rec.warnings),
        "\\vspace{3pt}",
    ]
    for r in rec.rows:
        parts.append(f"\\defrow{{{r.label}}}{{{_render_row_value(r.value, rec.warnings)}}}")
    parts.append("\\end{blockhead}")
    parts.append("\\blockrule")
    parts.append(_render_body_blocks(rec.body_blocks, rec.warnings))
    if rec.heightened:
        parts.append("\\thinrule")
        for level, text in rec.heightened:
            parts.append(
                f"\\heightened{{{_render_inline(level, rec.warnings)}}}"
                f"{{{_render_inline(text, rec.warnings)}}}"
            )
    parts.append("\\vspace{8pt}")
    return "\n".join(parts)


def _emit_spell_list_latex(
    school: str, spells: list[SpellRecord], summaries: dict[str, str], warnings: list[str]
) -> str:
    """The chapter spell-list table (Rank/Spell/Actions/Summary) — the same
    striped ``tabularx`` shape as the S1 sample's Antillurgy Spells table."""
    lines = [
        f"\\subsubsection*{{{_title_case(school)} Spells}}",
        "\\begingroup",
        "\\renewcommand{\\arraystretch}{1.3}",
        "\\rowcolors{2}{TableBlue}{TableWhite}",
        "\\noindent",
        "\\begin{tabularx}{\\textwidth}{@{}>{\\centering\\arraybackslash}p{0.07\\textwidth} "
        "p{0.24\\textwidth} >{\\centering\\arraybackslash}p{0.10\\textwidth} X@{}}",
        "\\hline",
        "\\tblhead{Rank} & \\tblhead{Spell} & \\tblhead{Actions} & \\tblhead{Summary} \\\\",
        "\\hline",
    ]
    for sp in spells:
        actions_char = ACTION_GLYPHS.get(sp.time_value.lower())
        if actions_char:
            actions_tex = f"{{\\actionfont {actions_char}}}"
        else:
            actions_tex = f"{{\\scaly {_latex_escape_text(sp.time_value)}}}"
        name_tex = _render_inline(sp.name, warnings)
        summary_tex = _render_inline(summaries.get(sp.slug, ""), warnings)
        lines.append(
            f"{{\\scaly {sp.rank}}} & {{\\scaly {name_tex}}} & {actions_tex} & "
            f"{{\\scaly {summary_tex}}} \\\\"
        )
    lines.append("\\hline")
    lines.append("\\end{tabularx}")
    lines.append("\\endgroup")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Neutral fragment dialect (Track B content) -> LaTeX.
# ---------------------------------------------------------------------------
#
# A SMALL markup vocabulary the content fragments (front matter + chapter
# openers) are hand-authored in: blank-line-separated paragraphs with
# ``**bold**``/``*italic*`` inline; ``#``.."#####" headings; ``:::note`` /
# ``:::descriptive`` fenced boxes (both render via ``\liturgynote`` — a
# documented approximation, no distinct visual language was reviewed for
# "descriptive" boxes); ``:::rightAligned`` fenced blocks; bare ``\page`` /
# ``\column`` directive lines; ``<!-- ART SLOT [id]: ... -->`` comments
# (preserved as a LaTeX comment at their original position, always — the id
# is ALSO looked up fail-soft against ``<out>/assets/img/processed/<id or
# school>.(png|jpg)``: real stakeholder art gets placed into the reserved
# art column/background/sidebar the moment it lands there, no fragment edit
# required; absent art, the reservation stays exactly as it renders today
# — a dashed placeholder for chapter openers, an empty background/column
# for fm-cover/fm-reading. ART-SLOTS.md remains the placement ledger); and
# ``**Label** :: value`` lines (a definition-list row, reused inside
# glossary-style note boxes and the credits page).


@dataclass
class NHeading:
    level: int
    text: str


@dataclass
class NParagraph:
    text: str
    comment: str = ""


@dataclass
class NDefRow:
    label: str
    value: str
    comment: str = ""


@dataclass
class NNote:
    kind: str  # "note" | "descriptive"
    children: list[Any]


@dataclass
class NArtSlot:
    comment: str


@dataclass
class NPageBreak:
    pass


@dataclass
class NColumnBreak:
    pass


@dataclass
class NRightAligned:
    text: str


NElement = (
    NHeading | NParagraph | NDefRow | NNote | NArtSlot | NPageBreak | NColumnBreak | NRightAligned
)

_N_HEADING_RE = re.compile(r"^(#{1,5})\s+(.*)$")
_N_DEFROW_RE = re.compile(r"^\*\*([^*]+)\*\*\s*::\s*(.*)$")
_N_ARTSLOT_RE = re.compile(r"^<!--\s*(ART SLOT.*?)\s*-->$")
_N_INLINE_COMMENT_RE = re.compile(r"<!--.*?-->")


def _parse_neutral(text: str) -> list[NElement]:
    lines = text.split("\n")
    elements: list[NElement] = []
    n = len(lines)
    para_buf: list[str] = []

    def flush_para() -> None:
        if not para_buf:
            return
        raw = " ".join(line.strip() for line in para_buf).strip()
        para_buf.clear()
        comments = _N_INLINE_COMMENT_RE.findall(raw)
        raw = re.sub(r"\s+", " ", _N_INLINE_COMMENT_RE.sub("", raw)).strip()
        comment = "; ".join(comments)
        if not raw:
            return
        m = _N_DEFROW_RE.match(raw)
        if m:
            elements.append(NDefRow(m.group(1).strip(), m.group(2).strip(), comment=comment))
        else:
            elements.append(NParagraph(raw, comment=comment))

    def read_fenced_block(start: int) -> tuple[list[str], int]:
        j = start
        inner: list[str] = []
        while j < n and lines[j].strip() != ":::":
            inner.append(lines[j])
            j += 1
        return inner, j + 1

    i = 0
    while i < n:
        stripped = lines[i].strip()
        if not stripped:
            flush_para()
            i += 1
            continue
        m_art = _N_ARTSLOT_RE.match(stripped)
        if m_art:
            flush_para()
            elements.append(NArtSlot(m_art.group(1)))
            i += 1
            continue
        if stripped == "\\page":
            flush_para()
            elements.append(NPageBreak())
            i += 1
            continue
        if stripped == "\\column":
            flush_para()
            elements.append(NColumnBreak())
            i += 1
            continue
        m_h = _N_HEADING_RE.match(stripped)
        if m_h:
            flush_para()
            elements.append(NHeading(len(m_h.group(1)), m_h.group(2).strip()))
            i += 1
            continue
        m_row = _N_DEFROW_RE.match(stripped)
        if m_row:
            # Definition-list rows (credits, glossary boxes) are ONE PER
            # SOURCE LINE with no blank-line separator between them — unlike
            # prose, consecutive rows must NOT be paragraph-joined, or every
            # row after the first collapses into the first row's value text.
            flush_para()
            comments = _N_INLINE_COMMENT_RE.findall(stripped)
            clean = _N_INLINE_COMMENT_RE.sub("", stripped).strip()
            m_row = _N_DEFROW_RE.match(clean)
            assert m_row is not None
            elements.append(
                NDefRow(m_row.group(1).strip(), m_row.group(2).strip(), comment="; ".join(comments))
            )
            i += 1
            continue
        if stripped in (":::note", ":::descriptive"):
            flush_para()
            inner, i = read_fenced_block(i + 1)
            elements.append(NNote(stripped[3:], _parse_neutral("\n".join(inner))))
            continue
        if stripped == ":::rightAligned":
            flush_para()
            inner, i = read_fenced_block(i + 1)
            raw = " ".join(line.strip() for line in inner).strip()
            elements.append(NRightAligned(raw))
            continue
        if stripped == ":::":
            # Bare separator (Homebrewery flex-wrapper noise) — no-op.
            flush_para()
            i += 1
            continue
        para_buf.append(lines[i])
        i += 1
    flush_para()
    return elements


def _split_pages(elements: list[NElement]) -> list[list[NElement]]:
    pages: list[list[NElement]] = [[]]
    for el in elements:
        if isinstance(el, NPageBreak):
            pages.append([])
        else:
            pages[-1].append(el)
    return pages


_HEADING_CMD = {
    1: "section",
    2: "subsection",
    3: "subsubsection",
    4: "paragraph",
    5: "subparagraph",
}


def _render_neutral_element(el: NElement, warnings: list[str]) -> str:
    if isinstance(el, NHeading):
        cmd = _HEADING_CMD[el.level]
        return f"\\{cmd}*{{{_render_inline(el.text, warnings)}}}"
    if isinstance(el, NParagraph):
        prefix = f"% {el.comment}\n" if el.comment else ""
        return prefix + _render_inline(el.text, warnings)
    if isinstance(el, NDefRow):
        prefix = f"% {el.comment}\n" if el.comment else ""
        label_tex = _render_inline(el.label, warnings)
        value_tex = _render_inline(el.value, warnings)
        return prefix + f"\\defrow{{{label_tex}}}{{{value_tex}}}"
    if isinstance(el, NArtSlot):
        return f"% {el.comment}"
    if isinstance(el, NPageBreak):
        return "\\clearpage"
    if isinstance(el, NColumnBreak):
        return "\\columnbreak"
    if isinstance(el, NRightAligned):
        return f"\\begin{{flushright}}\n{_render_inline(el.text, warnings)}\n\\end{{flushright}}"
    if isinstance(el, NNote):
        return _render_note_latex(el, warnings)
    raise BookBuildError(f"unknown neutral element {el!r}")


def _render_note_latex(note: NNote, warnings: list[str]) -> str:
    """A ``#####``-headed note box renders its title as bold-lead text (the
    S1-approved pattern — ``liturgynote`` boxes use ``\\textbf{title} \\\\``,
    not a titlesec heading command, per ``sample.tex``'s Almonk epigraph)."""
    children = note.children
    parts: list[str] = []
    start = 0
    if children and isinstance(children[0], NHeading):
        title_tex = f"\\textbf{{{_render_inline(children[0].text, warnings)}}} \\\\"
        if len(children) > 1 and isinstance(children[1], (NParagraph, NDefRow)):
            parts.append(title_tex + "\n" + _render_neutral_element(children[1], warnings))
            start = 2
        else:
            parts.append(title_tex)
            start = 1
    inner = _join_neutral(children[start:], warnings, seed=parts)
    return f"\\liturgynote{{{inner}}}"


def _join_neutral(
    elements: list[NElement],
    warnings: list[str],
    first_paragraph_transform: Any = None,
    seed: list[str] | None = None,
    art_slot_override: Any = None,  # Callable[[NArtSlot], str | None]
) -> str:
    """Join rendered elements with blank-line paragraph breaks — EXCEPT
    between consecutive ``NDefRow``s, which use a single newline (each
    ``\\defrow`` call already ends in its own ``\\\\`` line break; a blank
    line there would open a stray new LaTeX paragraph mid-list).

    ``art_slot_override``, when given, is consulted for every ``NArtSlot``
    element FIRST — returning ``None`` falls through to the default "%"
    comment rendering (``_render_neutral_element``), letting a caller (the
    frontmatter body, for the "Reading This Book" sidebar) swap in real
    stakeholder art for ONE specific slot id without touching every other
    ART-SLOT comment (chapter-body ones, unrelated frontmatter ones)."""
    out: list[str] = list(seed) if seed else []
    prev_is_row = bool(seed)
    used_transform = False
    for el in elements:
        if (
            first_paragraph_transform is not None
            and not used_transform
            and isinstance(el, NParagraph)
        ):
            tex = first_paragraph_transform(el, warnings)
            used_transform = True
        elif art_slot_override is not None and isinstance(el, NArtSlot):
            override = art_slot_override(el)
            tex = override if override is not None else _render_neutral_element(el, warnings)
        else:
            tex = _render_neutral_element(el, warnings)
        is_row = isinstance(el, NDefRow)
        if out:
            out.append("\n" if (prev_is_row and is_row) else "\n\n")
        out.append(tex)
        prev_is_row = is_row
    return "".join(out)


_DROPCAP_WORD_RE = re.compile(r"^(\w)(\w*)")


def _apply_dropcap(el: NParagraph, warnings: list[str]) -> str:
    stripped = el.text.lstrip()
    m = _DROPCAP_WORD_RE.match(stripped)
    if not m:
        return _render_inline(el.text, warnings)
    first, rest_of_word = m.group(1), m.group(2)
    remainder = _render_inline(stripped[m.end() :], warnings)
    return f"\\liturgydropcap{{{first}}}{{{rest_of_word}}}{remainder}"


def _render_chapter_body(elements: list[NElement], warnings: list[str]) -> str:
    return _join_neutral(elements, warnings, first_paragraph_transform=_apply_dropcap)


# ---------------------------------------------------------------------------
# Front matter + table of contents.
# ---------------------------------------------------------------------------

_PLACEHOLDER_FRONTMATTER = """\
# LITURGY OF THE IRIDITE

## VOLUME II

<!-- ART SLOT [fm-placeholder]: content/frontmatter.md has not been authored yet (Track B) -->
"""


def _render_cover_page(
    elements: list[NElement], warnings: list[str], art_dir: Path, report: BookReport
) -> str:
    # Fail-soft cover art: real stakeholder art at fm-cover.(png|jpg) renders
    # full-bleed BEHIND the title text (vol1 idiom — \covercoverart is a
    # one-shot eso-pic background, layered under everything else on this
    # page); absent that, the cover renders exactly as before (no
    # background, just the centered title stack) — the ART-SLOT comment
    # stays a "%"-comment placement note either way.
    cover_art_tex = ""
    for el in elements:
        if isinstance(el, NArtSlot) and _art_slot_id(el.comment) == "fm-cover":
            art_path = _find_art(art_dir, "fm-cover")
            if art_path is not None:
                cover_art_tex = f"\\covercoverart{{{_art_include_path(art_path)}}}\n"
                report.art_real.append("fm-cover")
            else:
                report.art_placeholder.append("fm-cover")
    parts: list[str] = [cover_art_tex] if cover_art_tex else []
    parts += ["\\vspace*{2.5cm}", "\\begin{center}"]
    for el in elements:
        if isinstance(el, NHeading):
            text = _render_inline(el.text, warnings)
            if el.level <= 1:
                parts.append(f"\\covertitle{{{text}}}\\vspace{{0.6cm}}")
            elif el.level == 2:
                parts.append(f"\\coversubtitle{{{text}}}\\vspace{{0.6cm}}")
            else:
                parts.append(f"\\covereyebrow{{{text}}}\\vspace{{0.8cm}}")
        elif isinstance(el, NArtSlot):
            parts.append(f"% {el.comment}")
    parts.append("\\end{center}")
    parts.append("\\vfill")
    return "\n".join(parts)


def _render_frontmatter_body(
    pages: list[list[NElement]], warnings: list[str], art_dir: Path, report: BookReport
) -> str:
    def reading_art_override(el: NArtSlot) -> str | None:
        # Fail-soft "Reading This Book" sidebar art: the right column is
        # ALREADY reserved (frontmatter.md's own \column break into a
        # 2-column multicols) — real art at fm-reading.(png|jpg) just fills
        # that existing blank column; absent that, the page renders exactly
        # as before (a "%"-comment placement note in an otherwise-empty
        # second column), per ``_render_neutral_element``'s default.
        if _art_slot_id(el.comment) != "fm-reading":
            return None
        art_path = _find_art(art_dir, "fm-reading")
        if art_path is None:
            report.art_placeholder.append("fm-reading")
            return None
        report.art_real.append("fm-reading")
        return f"\\readingartimage{{{_art_include_path(art_path)}}}"

    rendered = [_render_cover_page(pages[0], warnings, art_dir, report)]
    for page in pages[1:]:
        has_column_break = any(isinstance(e, NColumnBreak) for e in page)
        body = _join_neutral(page, warnings, art_slot_override=reading_art_override)
        if has_column_break:
            body = "\\begin{multicols}{2}\n" + body + "\n\\end{multicols}"
        rendered.append(body)
    return "\n\n\\clearpage\n\n".join(rendered)


def _render_toc() -> str:
    lines = ["\\section*{Contents}", ""]
    for chapter_no, school in enumerate(SCHOOLS, start=1):
        lines.append(f"\\tocentry{{{chapter_no}}}{{{_title_case(school)}}}{{chapter:{school}}}")
    return "\n".join(lines)


def _assemble_chapter(
    chapter_no: int,
    school: str,
    body_tex: str,
    spell_list_tex: str,
    block_tex_parts: list[str],
    art_slot_tex: str = "",
) -> str:
    title = _title_case(school)
    parts = [
        f"\\renewcommand{{\\liturgyfootnotelabel}}{{Chapter {chapter_no} \\textbar\\ {title}}}",
        f"\\label{{chapter:{school}}}",
        f"\\chapternum{{Chapter {chapter_no}}}",
        f"\\chaptertitle{{{title}}}",
        "\\chapterrule",
        "",
        "\\begin{openerbody}",
        "",
        body_tex,
        "",
        "\\end{openerbody}",
        art_slot_tex,
        "",
        spell_list_tex,
        "",
        "\\newpage",
        "",
        "\\begin{multicols}{2}",
        "\\spellflow",
        "",
        "\n\n".join(block_tex_parts),
        "",
        "\\end{multicols}",
    ]
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Assembly.
# ---------------------------------------------------------------------------


def _load_store(store_dir: Path) -> list[tuple[str, dict[str, Any]]]:
    docs = []
    for path in sorted(store_dir.glob("*.json")):
        docs.append((path.stem, json.loads(path.read_text(encoding="utf-8"))))
    return docs


def _load_trait_blurbs(traits_dir: Path) -> dict[str, list[_Block]]:
    blurbs: dict[str, list[_Block]] = {}
    for school in SCHOOLS:
        path = traits_dir / f"{school}.json"
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        conv = convert_description(doc["description"]["value"])
        blurbs[school] = conv.body_blocks
    return blurbs


def _partition_by_school(
    docs: list[tuple[str, dict[str, Any]]],
) -> dict[str, list[tuple[str, dict[str, Any]]]]:
    """Every spell must land in exactly ONE chapter; hard-fail listing the
    leftovers otherwise. (Worldweaver carries the ``seraphic`` trait in the
    store, so no special-casing is needed — the assert still guards it.)"""
    by_school: dict[str, list[tuple[str, dict[str, Any]]]] = {s: [] for s in SCHOOLS}
    bad: list[str] = []
    for slug, doc in docs:
        schools = spell_school(doc)
        if len(schools) != 1:
            bad.append(f"{slug} (schools={schools or 'NONE'})")
            continue
        by_school[schools[0]].append((slug, doc))
    if bad:
        raise BookBuildError("spells not in exactly one school chapter: " + ", ".join(sorted(bad)))
    return by_school


def _read_fragment(path: Path, report: BookReport) -> str | None:
    if path.exists():
        return path.read_text(encoding="utf-8").rstrip("\n")
    report.missing_fragments.append(str(path))
    return None


_ART_SLOT_ID_RE = re.compile(r"ART SLOT \[([\w-]+)\]")


def _art_slot_id(comment: str) -> str | None:
    """Extract the slot id out of a raw ``ART SLOT [id]: ...`` comment body
    (``NArtSlot.comment`` never includes the ``<!-- -->`` wrapper)."""
    m = _ART_SLOT_ID_RE.search(comment)
    return m.group(1) if m else None


def _find_art(art_dir: Path, slot: str) -> Path | None:
    """Fail-soft stakeholder-art lookup: ``<art_dir>/<slot>.png`` else
    ``<art_dir>/<slot>.jpg`` else ``None`` (dir need not even exist)."""
    for ext in _ART_EXTS:
        candidate = art_dir / f"{slot}.{ext}"
        if candidate.exists():
            return candidate
    return None


def _art_include_path(path: Path) -> str:
    """The relative-to-``<out>`` include path tectonic resolves at compile
    time — always the canonical ``assets/img/processed/<file>`` location
    regardless of what ``art_dir`` a caller (e.g. a test) pointed the
    existence check at."""
    return f"assets/img/processed/{path.name}"


@dataclass
class BookReport:
    spells: int = 0
    chapters: list[tuple[str, int]] = field(default_factory=list)  # (school, n)
    missing_fragments: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    art_real: list[str] = field(default_factory=list)  # slot ids that got real stakeholder art
    art_placeholder: list[str] = field(default_factory=list)  # slot ids still on the placeholder


@dataclass
class BookResult:
    tex: str
    report: BookReport


_RESIDUE_TOKENS: tuple[str, ...] = ("@UUID", "<p>", "</p>", "<strong>", "<hr", "<table", "\x00")


def _check_residue(tex: str) -> None:
    for residue in _RESIDUE_TOKENS:
        if residue in tex:
            raise BookBuildError(f"emitted tex contains unconverted residue {residue!r}")
    # "{{" never appears in LEGITIMATE emitted LaTeX (every macro call in this
    # module uses single-brace args) — EXCEPT inside a preserved ART-SLOT "%"
    # comment, which verbatim-quotes the original Homebrewery wrapper hint
    # text on purpose (see ``_render_neutral_element``'s ``NArtSlot`` case).
    for line in tex.split("\n"):
        if line.strip().startswith("%"):
            continue
        if "{{" in line:
            raise BookBuildError(f"emitted tex contains unconverted Homebrewery markup: {line!r}")


def _wrap_document(body: str) -> str:
    return (
        "% Generated by `uv run assay export-book` — DO NOT EDIT BY HAND.\n"
        "\\documentclass[10pt,letterpaper]{article}\n"
        "\\usepackage{liturgy}\n"
        "\\hypersetup{hidelinks}\n"
        "\\begin{document}\n\n"
        f"{body}\n\n"
        "\\end{document}\n"
    )


def build_book(
    store_dir: Path = STORE_DIR,
    traits_dir: Path = TRAITS_DIR,
    content_dir: Path | None = None,
    art_dir: Path | None = None,
) -> BookResult:
    """Assemble the whole book. ``content_dir`` defaults to
    ``DEFAULT_OUT_DIR/content`` (Track B's directory — consumed read-only,
    fail-soft when fragments are missing). ``art_dir`` defaults to
    ``<content_dir's parent>/assets/img/processed`` (the production layout
    is ``<out>/content`` + ``<out>/assets/img/processed``) — the stakeholder
    art drop point (``<slot>.png``/``<slot>.jpg``), consulted fail-soft: a
    missing dir or file just falls back to the existing placeholder/no-op,
    same as a missing content fragment."""
    content_dir = content_dir if content_dir is not None else DEFAULT_OUT_DIR / "content"
    if art_dir is None:
        art_dir = content_dir.parent / "assets" / "img" / "processed"
    report = BookReport()

    docs = _load_store(store_dir)
    by_school = _partition_by_school(docs)
    blurbs = _load_trait_blurbs(traits_dir)

    summaries_path = content_dir / "summaries.json"
    summaries: dict[str, str] = {}
    if summaries_path.exists():
        summaries = json.loads(summaries_path.read_text(encoding="utf-8"))
    else:
        report.missing_fragments.append(str(summaries_path))

    chapters_tex: list[str] = []
    for chapter_no, school in enumerate(SCHOOLS, start=1):
        records = [build_spell_record(doc, slug, school) for slug, doc in by_school[school]]
        records.sort(key=lambda r: (r.rank, r.name.lower()))
        report.spells += len(records)
        report.chapters.append((school, len(records)))

        opener_fragment = _read_fragment(content_dir / "chapters" / f"{school}.md", report)
        art_slot_id: str | None = None
        if opener_fragment is not None:
            elements = _parse_neutral(opener_fragment)
            body_tex = _render_chapter_body(elements, report.warnings)
            for el in elements:
                if isinstance(el, NArtSlot):
                    m_id = _art_slot_id(el.comment)
                    if m_id:
                        art_slot_id = m_id
        else:
            blurb_blocks = blurbs.get(school)
            body_tex = _render_body_blocks(blurb_blocks, report.warnings) if blurb_blocks else ""

        # Fail-soft chapter-opener art: real stakeholder art (keyed by
        # SCHOOL, not the fragment's own ART-SLOT id — the lookup applies
        # even when a chapter has no opener fragment at all, i.e. the
        # trait-blurb fallback path) fills the reserved right column;
        # otherwise the dashed placeholder stands in, same as before.
        art_path = _find_art(art_dir, school)
        if art_path is not None:
            art_tex = f"\\openerartimage{{{_art_include_path(art_path)}}}"
            report.art_real.append(school)
        elif art_slot_id:
            art_tex = f"\\openerartslot{{{art_slot_id}}}"
            report.art_placeholder.append(school)
        else:
            art_tex = ""

        spell_list_tex = _emit_spell_list_latex(school, records, summaries, report.warnings)

        block_tex_parts: list[str] = []
        for rec in records:
            block_tex_parts.append(emit_spell_latex(rec))
            report.warnings.extend(f"{rec.slug}: {w}" for w in rec.warnings)

        chapters_tex.append(
            _assemble_chapter(
                chapter_no, school, body_tex, spell_list_tex, block_tex_parts, art_tex
            )
        )

    frontmatter_fragment = _read_fragment(content_dir / "frontmatter.md", report)
    if frontmatter_fragment is not None:
        pages = _split_pages(_parse_neutral(frontmatter_fragment))
        frontmatter_tex = _render_frontmatter_body(pages, report.warnings, art_dir, report)
    else:
        pages = _split_pages(_parse_neutral(_PLACEHOLDER_FRONTMATTER))
        frontmatter_tex = _render_frontmatter_body(pages, report.warnings, art_dir, report)

    toc_tex = _render_toc()

    body = "\n\n\\clearpage\n\n".join([frontmatter_tex, toc_tex, *chapters_tex])
    tex = _wrap_document(body)

    _check_residue(tex)

    return BookResult(tex=tex, report=report)


def format_report(report: BookReport) -> str:
    lines = [f"assay export-book: {report.spells} spells, {len(report.chapters)} chapters"]
    for school, n in report.chapters:
        lines.append(f"  chapter {_title_case(school)}: {n} spells")
    for slot in report.art_real:
        lines.append(f"  art slot {slot}: real art placed")
    for slot in report.art_placeholder:
        lines.append(f"  art slot {slot}: placeholder (no processed/{slot}.png|jpg yet)")
    for frag in report.missing_fragments:
        lines.append(f"  missing content fragment (fail-soft): {frag}")
    for w in report.warnings:
        lines.append(f"  warning: {w}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI (registered from cli.py; mirrors homebrew.register_subparsers).
# ---------------------------------------------------------------------------

_tracer = get_tracer("astra.assay")


def cmd_export_book(args: argparse.Namespace) -> None:
    """Build the Vol.2 LaTeX book from the canonical store, write the
    ``.tex`` into ``--out`` (default ``apps/codex/books/liturgy_vol2``), then
    compile it with ``tectonic`` (skip via ``--no-compile``). Never touches
    ``<out>/content/`` (Track B's directory — read-only input)."""
    with _tracer.start_as_current_span("assay.export-book") as span:
        out_dir = Path(args.out).resolve() if args.out else DEFAULT_OUT_DIR
        result = build_book(content_dir=out_dir / "content")
        out_dir.mkdir(parents=True, exist_ok=True)
        tex_path = out_dir / BOOK_TEX_NAME
        tex_path.write_text(result.tex, encoding="utf-8")
        span.set_attribute("assay.export_book.spells", result.report.spells)
        span.set_attribute("assay.export_book.chapters", len(result.report.chapters))
        print(format_report(result.report))
        print(f"-> {tex_path}")

        if args.no_compile:
            return

        tectonic = args.tectonic_path or shutil.which("tectonic")
        if not tectonic:
            print(
                "warning: tectonic not found on PATH — skipping compile "
                "(pass --tectonic-path or --no-compile)"
            )
            span.set_attribute("assay.export_book.compiled", False)
            return

        env = dict(os.environ)
        env["SOURCE_DATE_EPOCH"] = "0"
        proc = subprocess.run(
            [tectonic, tex_path.name],
            cwd=out_dir,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.stdout:
            print(proc.stdout)
        if proc.stderr:
            print(proc.stderr)
        if proc.returncode != 0:
            span.set_attribute("assay.export_book.compiled", False)
            raise BookBuildError(f"tectonic compile failed (exit {proc.returncode})")

        pdf_path = out_dir / BOOK_PDF_NAME
        span.set_attribute("assay.export_book.compiled", pdf_path.exists())
        print(f"-> {pdf_path}")


def register_subparsers(sub: argparse._SubParsersAction) -> None:
    p_book = sub.add_parser(
        "export-book",
        help=(
            "build the Liturgy of the Iridite Vol.2 LaTeX book from the canonical "
            "homebrew store -> apps/codex/books/liturgy_vol2/"
        ),
    )
    p_book.add_argument(
        "--out",
        default=None,
        help="output directory (default apps/codex/books/liturgy_vol2)",
    )
    p_book.add_argument(
        "--no-compile",
        action="store_true",
        help="write the .tex only — skip the tectonic PDF compile step",
    )
    p_book.add_argument(
        "--tectonic-path",
        default=None,
        help="path to the tectonic binary (default: PATH lookup)",
    )
    p_book.set_defaults(func=cmd_export_book)
