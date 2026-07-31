"""``assay export-book`` — the "Liturgy of the Iridite Vol.2" book generator.

Converts the canonical homebrew spell store (``apps/assay/homebrew/spells/``,
173 Foundry-shaped docs) + the 8 school trait blurbs
(``apps/assay/homebrew/traits/``) into a Homebrewery-v3-flavored markdown
book at ``apps/codex/books/liturgy_vol2/liturgy_of_the_iridite_vol2.md``,
alongside a byte-verbatim copy of vol1's ``.css`` (the shared class
vocabulary: ``.ruleBlock``/``.preamble``/``.traits``/``.definitions``/
``.postamble``, ``.trait`` + ``,unique/,rare/,uncommon`` variants, the
``.a/.aa/.aaa/.r/.f`` action glyphs, ``.spellList`` tables).

Book structure (Track A of a two-track build — Track B concurrently authors
prose fragments under ``<out>/content/``, which this generator consumes
fail-soft):

1. front matter — ``content/frontmatter.md`` verbatim if present, else a
   clearly-marked placeholder cover;
2. a ``{{toc}}`` page generated from the chapter structure with ``#pN``
   anchors matching this module's own pagination;
3. eight school chapters in the fixed order below (seraphic LAST — the
   capstone: one ritual, Worldweaver), each = opener
   (``content/chapters/<school>.md`` verbatim, else a generated
   ``{{chapter,gradient}}`` header + the trait blurb) + a ``{{spellList}}``
   table (summaries from ``content/summaries.json``, blank fail-soft) + the
   school's spells sorted by (rank, name) as ``{{ruleBlock}}`` statblocks.

**Determinism:** sorted store glob, stable sort keys, no timestamps —
double runs are byte-identical.

**Pagination model (calibrated against vol1):** Homebrewery v3 pages clip
overflow and auto-flow two columns, so ``\\page`` breaks are placed by a
line-estimation model. Constants were derived by measuring vol1's densest
statblock pages (the ``{{ruleBlock}}`` run around its md lines 1442–1568,
which the vol1 PDF is known to render correctly): a column holds ~54 text
lines at ~52 chars/line; absolutely-positioned furniture (``imageWrapper``,
``caption``, ``pageNumber``, ``footnote``) costs no flow lines. Pages are
filled to ~92% of the 2-column capacity and a ruleBlock is never split
across a page (a block may span columns naturally). The build prints a
report: pages, blocks/page, and any page estimated over 100% (manual-review
flags).
"""

from __future__ import annotations

import argparse
import json
import math
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from astra_observe import get_tracer

APP_ROOT = Path(__file__).resolve().parents[2]  # src/astra_assay/book.py -> apps/assay
REPO_ROOT = APP_ROOT.parents[1]
STORE_DIR = APP_ROOT / "homebrew" / "spells"
TRAITS_DIR = APP_ROOT / "homebrew" / "traits"
VOL1_CSS_PATH = REPO_ROOT / "apps/codex/books/liturgy_vol1/liturgy_of_the_iridite_vol1.css"
DEFAULT_OUT_DIR = REPO_ROOT / "apps/codex/books/liturgy_vol2"
BOOK_MD_NAME = "liturgy_of_the_iridite_vol2.md"
BOOK_CSS_NAME = "liturgy_of_the_iridite_vol2.css"

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

#: Cast-time values that render as a title glyph instead of a **Cast** row.
ACTION_GLYPHS: dict[str, str] = {
    "1": "{{a}}",
    "2": "{{aa}}",
    "3": "{{aaa}}",
    "reaction": "{{r}}",
}

#: ``<span class="action-glyph">X</span>`` content -> inline glyph macro.
SPAN_GLYPHS: dict[str, str] = {
    "1": "{{a}}",
    "2": "{{aa}}",
    "3": "{{aaa}}",
    "r": "{{r}}",
    "f": "{{f}}",
}

CHAPTER_COLOR = "#7c4848"

# --- pagination model (see module docstring for the vol1 calibration) -----
LINES_PER_COLUMN = 54
CHARS_PER_LINE = 52
COLUMNS_PER_PAGE = 2
PAGE_CAPACITY = LINES_PER_COLUMN * COLUMNS_PER_PAGE
FILL_TARGET = 0.92

_UUID_RE = re.compile(r"@UUID\[([^\]]+)\](?:\{([^}]*)\})?")


class BookBuildError(Exception):
    """A hard structural failure (e.g. a spell landing in zero or several
    school chapters) — the build STOPS rather than emit a wrong book."""


# ---------------------------------------------------------------------------
# Description HTML -> markdown blocks (stdlib html.parser; no new deps).
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


def _escape_braces(text: str) -> str:
    """Homebrewery mustache is greedy — escape literal braces in source
    prose. (Applied to text nodes only, before glyph macros are inserted.)"""
    return text.replace("{", "\\{").replace("}", "\\}")


class _DescriptionParser(HTMLParser):
    """Parses a store ``description.value`` HTML fragment into ``_Block``s.

    Inline: ``<strong>`` -> ``**..**``, ``<em>`` -> ``*..*`` (defensive; the
    store has none), ``<span class="action-glyph">X</span>`` -> the inline
    glyph macro. Blocks: ``<p>``, ``<hr>``, ``<table>``, ``<ul>``.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[_Block] = []
        self.warnings: list[str] = []
        self._buf: list[str] = []
        self._in_glyph_span = False
        self._table: _Block | None = None
        self._in_thead = False
        self._row: list[str] | None = None
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
        elif tag in ("th", "td"):
            self._buf = []
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
            cell = self._take_buf().replace("|", "\\|")
            if self._row is not None:
                self._row.append(cell)
        elif tag == "tr":
            if self._table is not None and self._row is not None:
                if self._in_thead:
                    self._table.header = self._row
                else:
                    self._table.rows.append(self._row)
            self._row = None
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
            self._emit(_escape_braces(_flatten_enrichers(data)))


def _resolve_glyph_tokens(text: str, warnings: list[str]) -> str:
    """Replace the parser's ``\\x00GLYPH:<content>\\x00END`` markers with the
    matching ``{{a}}``-family macro."""

    def repl(m: re.Match[str]) -> str:
        token = m.group(1).strip().lower()
        glyph = SPAN_GLYPHS.get(token)
        if glyph is None:
            warnings.append(f"unknown action-glyph span content {token!r} kept as text")
            return m.group(1).strip()
        return glyph

    return re.sub("\x00GLYPH:(.*?)\x00END", repl, text)


def parse_description(html_value: str) -> tuple[list[_Block], list[str]]:
    parser = _DescriptionParser()
    parser.feed(html_value)
    parser.close()
    warnings = parser.warnings
    for b in parser.blocks:
        b.text = _resolve_glyph_tokens(b.text, warnings)
        b.items = [_resolve_glyph_tokens(i, warnings) for i in b.items]
        b.header = [_resolve_glyph_tokens(c, warnings) for c in b.header]
        b.rows = [[_resolve_glyph_tokens(c, warnings) for c in row] for row in b.rows]
    return parser.blocks, warnings


# ---------------------------------------------------------------------------
# Blocks -> body markdown + lifted rows (Trigger/Requirements, Heightened).
# ---------------------------------------------------------------------------

_HEIGHTENED_RE = re.compile(r"^\*\*(Heightened \([^)]*\))\*\*\s*(.*)$", re.DOTALL)
_LEAD_LIFT_RE = re.compile(r"^\*\*(Trigger|Requirements)\*\*\s*(.*)$", re.DOTALL)


@dataclass
class ConvertedDescription:
    body_md: str
    heightened_rows: list[str]  # "**Heightened (+1)** :: text"
    trigger: str | None
    requirements: str | None
    warnings: list[str]


def _render_block(block: _Block) -> str:
    if block.kind == "p":
        return block.text
    if block.kind == "hr":
        return "___"
    if block.kind == "list":
        return "\n".join(f"- {item}" for item in block.items)
    if block.kind == "table":
        header = block.header or [""] * (len(block.rows[0]) if block.rows else 1)
        lines = [
            "| " + " | ".join(header) + " |",
            "|" + "|".join(":---:" for _ in header) + "|",
        ]
        lines.extend("| " + " | ".join(row) + " |" for row in block.rows)
        return "\n".join(lines)
    raise BookBuildError(f"unknown block kind {block.kind!r}")


def convert_description(html_value: str) -> ConvertedDescription:
    blocks, warnings = parse_description(html_value)

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

    heightened_rows: list[str] = []
    if split_at is not None:
        for b in blocks[split_at + 1 :]:
            m = _HEIGHTENED_RE.match(b.text)
            assert m is not None  # guaranteed by the split_at scan
            heightened_rows.append(f"**{m.group(1)}** :: {m.group(2).strip()}")
        blocks = blocks[:split_at]

    body_md = "\n\n".join(_render_block(b) for b in blocks)
    return ConvertedDescription(
        body_md=body_md,
        heightened_rows=heightened_rows,
        trigger=trigger,
        requirements=requirements,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Spell doc -> {{ruleBlock}}.
# ---------------------------------------------------------------------------


def _title_case(trait: str) -> str:
    return " ".join(part.capitalize() for part in trait.replace("-", " ").split(" "))


def _trait_pills(doc: dict[str, Any], school: str) -> str:
    traits = doc["system"]["traits"]
    rarity = traits.get("rarity", "common")
    pills: list[str] = []
    if rarity in ("uncommon", "rare"):
        pills.append(f"{{{{trait,{rarity} {_title_case(rarity)}}}}}")
    pills.append(f"{{{{trait,unique {_title_case(school)}}}}}")
    rest = sorted(t for t in traits.get("value") or [] if t != school)
    pills.extend(f"{{{{trait {_title_case(t)}}}}}" for t in rest)
    return "".join(pills)


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
class RenderedSpell:
    name: str
    slug: str
    rank: int
    school: str
    is_ritual: bool
    time_value: str
    md: str
    warnings: list[str]


def render_spell(doc: dict[str, Any], slug: str, school: str) -> RenderedSpell:
    system = doc["system"]
    name = doc["name"]
    rank = int(system["level"]["value"])
    time_value = str(system["time"]["value"]).strip()
    ritual = system.get("ritual")
    is_ritual = bool(ritual)
    traits = system["traits"]
    is_cantrip = "cantrip" in (traits.get("value") or [])

    conv = convert_description(system["description"]["value"])
    warnings = list(conv.warnings)

    # -- preamble ----------------------------------------------------------
    kind = "Ritual" if is_ritual else ("Cantrip" if is_cantrip else "Spell")
    glyph = None if is_ritual else ACTION_GLYPHS.get(time_value.lower())
    title = f"{{{{title {name}}}}}"
    if glyph:
        title += f" {glyph}"
    preamble = f"{title} {{{{spacer}}}} {{{{kind {kind}}}}} {{{{level {rank}}}}}"

    # -- definitions rows --------------------------------------------------
    rows: list[str] = []

    def row(label: str, value: str) -> None:
        if value:
            rows.append(f"**{label}** :: {value}")

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
        traditions = traits.get("traditions") or []
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

    parts = [
        "{{ruleBlock",
        "{{preamble",
        preamble,
        "}}",
        "",
        "{{traits",
        _trait_pills(doc, school),
        "}}",
        "",
        "{{definitions",
        *rows,
        "}}",
        "",
        conv.body_md,
    ]
    if conv.heightened_rows:
        parts.extend(["", "{{postamble", *conv.heightened_rows, "}}"])
    parts.append("}}")
    md = "\n".join(parts)

    return RenderedSpell(
        name=name,
        slug=slug,
        rank=rank,
        school=school,
        is_ritual=is_ritual,
        time_value=time_value,
        md=md,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Line-height estimation (the vol1-calibrated pagination model).
# ---------------------------------------------------------------------------

#: Absolutely-positioned Homebrewery blocks that cost no flow lines.
_ZERO_FLOW_BLOCKS = ("imageWrapper", "caption", "artist", "watercolor")
_ZERO_FLOW_LINES = ("{{pageNumber", "{{footnote")


def estimate_md_lines(md: str) -> float:
    """Estimate rendered flow lines for a markdown chunk, mirroring how the
    generator's own output (and vol1's statblock pages) lay out: text wraps
    at ``CHARS_PER_LINE``, headers/banners cost extra, absolutely-positioned
    furniture costs nothing."""
    total = 0.0
    depth_zero_flow = 0
    brace_depth = 0
    in_chapter_banner = False
    for raw in md.split("\n"):
        line = raw.strip()
        opens = line.count("{{")
        closes = line.count("}}")
        if depth_zero_flow == 0 and any(line.startswith(f"{{{{{b}") for b in _ZERO_FLOW_BLOCKS):
            depth_zero_flow = brace_depth + 1
        brace_depth += opens - closes
        if depth_zero_flow:
            if brace_depth < depth_zero_flow:
                depth_zero_flow = 0
            continue
        if not line:
            total += 0.3
            continue
        if any(line.startswith(z) for z in _ZERO_FLOW_LINES):
            continue
        if line.startswith("{{chapter"):
            in_chapter_banner = True
            total += 2.0
            continue
        if line in ("{{ruleBlock", "{{preamble", "{{definitions", "{{postamble", "{{traits"):
            total += 0.3
            continue
        if line.startswith(("{{toc", "{{note", "{{descriptive", "{{spellList", "{{banner")):
            total += 1.0
            continue
        if line == "}}":
            if in_chapter_banner and brace_depth == 0:
                in_chapter_banner = False
                total += 2.0
            else:
                total += 0.3
            continue
        if line.startswith("{{title"):
            total += 2.0
            continue
        if line.startswith("{{trait"):
            # Pills flex-wrap: ~40 visible label chars per row, taller rows.
            visible = len(re.sub(r"\{\{trait[^ ]* |\}\}", "", line))
            total += 1.5 * max(1, math.ceil(visible / 40))
            continue
        if line.startswith("#"):
            level = len(line) - len(line.lstrip("#"))
            total += {1: 5.0, 2: 4.0}.get(level, 2.0) if in_chapter_banner else 2.0
            continue
        if line == "___":
            total += 1.5
            continue
        if line.startswith("|"):
            total += 1.2
            continue
        if line.startswith("- "):
            total += max(1, math.ceil(len(line) / CHARS_PER_LINE))
            continue
        total += max(1, math.ceil(len(line) / CHARS_PER_LINE))
    return total


# ---------------------------------------------------------------------------
# Assembly + pagination.
# ---------------------------------------------------------------------------


@dataclass
class _FlowBlock:
    md: str
    lines: float
    starts_page: bool = False


@dataclass
class PageInfo:
    page_no: int
    blocks: int
    est_lines: float

    @property
    def fill(self) -> float:
        return self.est_lines / PAGE_CAPACITY


@dataclass
class BookReport:
    spells: int = 0
    chapters: list[tuple[str, int, int]] = field(default_factory=list)  # (school, n, page)
    pages: list[PageInfo] = field(default_factory=list)
    overflow_pages: list[PageInfo] = field(default_factory=list)
    oversized_blocks: list[str] = field(default_factory=list)
    missing_fragments: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def page_count(self) -> int:
        return len(self.pages)


@dataclass
class BookResult:
    markdown: str
    report: BookReport


def _load_store(store_dir: Path) -> list[tuple[str, dict[str, Any]]]:
    docs = []
    for path in sorted(store_dir.glob("*.json")):
        docs.append((path.stem, json.loads(path.read_text(encoding="utf-8"))))
    return docs


def _load_trait_blurbs(traits_dir: Path) -> dict[str, str]:
    blurbs: dict[str, str] = {}
    for school in SCHOOLS:
        path = traits_dir / f"{school}.json"
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        conv = convert_description(doc["description"]["value"])
        blurbs[school] = conv.body_md
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


def _chapter_opener_md(chapter_no: int, school: str, blurb: str | None) -> str:
    banner = (
        f"{{{{chapter,gradient,--color:{CHAPTER_COLOR}\n"
        f"\n"
        f"## Chapter {chapter_no}\n"
        f"# {_title_case(school)}\n"
        f"___\n"
        f"}}}}"
    )
    if blurb:
        return f"{banner}\n\n\n{blurb}"
    return banner


def _spell_list_md(school: str, spells: list[RenderedSpell], summaries: dict[str, str]) -> str:
    lines = [
        "{{spellList",
        f"##### {_title_case(school)} Spells",
        "| Rank | Spell | Actions | Summary |",
        "|:---:|:---|:---:|:---|",
    ]
    for sp in spells:
        actions = ACTION_GLYPHS.get(sp.time_value.lower(), sp.time_value)
        summary = summaries.get(sp.slug, "")
        lines.append(f"| {sp.rank} | {sp.name} | {actions} | {summary} |")
    lines.append("}}")
    return "\n".join(lines)


def _paginate(blocks: list[_FlowBlock], report: BookReport, names: list[str]) -> list[list[int]]:
    """Greedy whole-block fill to ~FILL_TARGET of a page; returns pages as
    lists of block indices. A single block may exceed the target alone (it
    spans columns naturally); one estimated taller than a FULL page is
    flagged for manual review."""
    pages: list[list[int]] = []
    current: list[int] = []
    fill = 0.0
    for i, b in enumerate(blocks):
        if b.lines > PAGE_CAPACITY:
            report.oversized_blocks.append(names[i])
        if current and (b.starts_page or fill + b.lines > PAGE_CAPACITY * FILL_TARGET):
            pages.append(current)
            current = []
            fill = 0.0
        current.append(i)
        fill += b.lines
    if current:
        pages.append(current)
    return pages


def _read_fragment(path: Path, report: BookReport) -> str | None:
    if path.exists():
        return path.read_text(encoding="utf-8").rstrip("\n")
    report.missing_fragments.append(str(path))
    return None


_PLACEHOLDER_FRONTMATTER = """\
{{frontCover}}

### PER ASPERA, AD ASTRA

# LITURGY OF THE IRIDITE

## VOLUME II

{{note
##### Placeholder
`content/frontmatter.md` has not been authored yet (Track B) — this cover
page is a generated stand-in.
}}"""


def build_book(
    store_dir: Path = STORE_DIR,
    traits_dir: Path = TRAITS_DIR,
    content_dir: Path | None = None,
) -> BookResult:
    """Assemble the whole book. ``content_dir`` defaults to
    ``DEFAULT_OUT_DIR/content`` (Track B's directory — consumed read-only,
    fail-soft when fragments are missing)."""
    content_dir = content_dir if content_dir is not None else DEFAULT_OUT_DIR / "content"
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

    # -- render every chapter's flow blocks --------------------------------
    chapter_blocks: list[list[_FlowBlock]] = []
    chapter_block_names: list[list[str]] = []
    for chapter_no, school in enumerate(SCHOOLS, start=1):
        spells: list[RenderedSpell] = []
        for slug, doc in by_school[school]:
            rs = render_spell(doc, slug, school)
            report.warnings.extend(f"{slug}: {w}" for w in rs.warnings)
            spells.append(rs)
        spells.sort(key=lambda s: (s.rank, s.name.lower()))
        report.spells += len(spells)

        opener = _read_fragment(content_dir / "chapters" / f"{school}.md", report)
        if opener is None:
            opener = _chapter_opener_md(chapter_no, school, blurbs.get(school))
        elif "\\page" in opener:
            report.warnings.append(
                f"chapters/{school}.md contains \\page — the pagination model assumes "
                "chapter openers are single-page; toc anchors/footnotes may be off"
            )
        blocks = [_FlowBlock(opener, estimate_md_lines(opener), starts_page=True)]
        names = [f"{school}/opener"]
        table = _spell_list_md(school, spells, summaries)
        blocks.append(_FlowBlock(table, estimate_md_lines(table)))
        names.append(f"{school}/spell-list")
        for sp in spells:
            blocks.append(_FlowBlock(sp.md, estimate_md_lines(sp.md)))
            names.append(f"{school}/{sp.slug}")
        chapter_blocks.append(blocks)
        chapter_block_names.append(names)

    # -- front matter ------------------------------------------------------
    frontmatter = _read_fragment(content_dir / "frontmatter.md", report)
    if frontmatter is None:
        frontmatter = _PLACEHOLDER_FRONTMATTER
    frontmatter_pages = frontmatter.count("\\page") + 1
    toc_page_no = frontmatter_pages + 1

    # -- paginate chapters (page numbers known before the toc is written) --
    chapter_pages: list[list[list[int]]] = []
    next_page = toc_page_no + 1
    chapter_start_pages: list[int] = []
    for chapter_no, school in enumerate(SCHOOLS, start=1):
        pages = _paginate(
            chapter_blocks[chapter_no - 1], report, chapter_block_names[chapter_no - 1]
        )
        chapter_pages.append(pages)
        chapter_start_pages.append(next_page)
        report.chapters.append((school, len(by_school[school]), next_page))
        next_page += len(pages)

    # -- toc ----------------------------------------------------------------
    toc_lines = ["{{toc", "# Contents", ""]
    for chapter_no, school in enumerate(SCHOOLS, start=1):
        page = chapter_start_pages[chapter_no - 1]
        toc_lines.append(
            f"- ## [{{{{ Chapter {chapter_no} — {_title_case(school)}}}}}{{{{ {page}}}}}](#p{page})"
        )
    toc_lines.append("}}")
    toc_md = "\n".join(toc_lines)

    # -- emit ---------------------------------------------------------------
    out: list[str] = [frontmatter, "", "\\page", "", toc_md, ""]
    page_no = toc_page_no
    for chapter_no, school in enumerate(SCHOOLS, start=1):
        blocks = chapter_blocks[chapter_no - 1]
        for page_blocks in chapter_pages[chapter_no - 1]:
            out.append("\\page")
            out.append("")
            page_no += 1
            est = 0.0
            for i in page_blocks:
                out.append(blocks[i].md)
                out.append("")
                est += blocks[i].lines
            out.append("{{pageNumber,auto}}")
            out.append(f"{{{{footnote Chapter {chapter_no} | {_title_case(school)}}}}}")
            out.append("")
            info = PageInfo(page_no=page_no, blocks=len(page_blocks), est_lines=est)
            report.pages.append(info)
            if info.fill > 1.0:
                report.overflow_pages.append(info)

    markdown = "\n".join(out).rstrip("\n") + "\n"

    # -- residue self-checks (STOP, never ship a broken book) --------------
    for residue in ("@UUID", "<p>", "</p>", "<strong>", "<hr", "<table", "\x00"):
        if residue in markdown:
            raise BookBuildError(f"emitted markdown contains unconverted residue {residue!r}")

    return BookResult(markdown=markdown, report=report)


def format_report(report: BookReport) -> str:
    lines = [
        f"assay export-book: {report.spells} spells, {len(report.chapters)} chapters, "
        f"{report.page_count} content pages",
    ]
    for school, n, page in report.chapters:
        lines.append(f"  chapter {_title_case(school)}: {n} spells, starts p{page}")
    fills = [p.fill for p in report.pages]
    if fills:
        lines.append(
            f"  page fill: min {min(fills):.0%}  mean {sum(fills) / len(fills):.0%}  "
            f"max {max(fills):.0%}"
        )
    blocks_per_page = [p.blocks for p in report.pages]
    if blocks_per_page:
        lines.append(
            f"  blocks/page: min {min(blocks_per_page)}  "
            f"mean {sum(blocks_per_page) / len(blocks_per_page):.1f}  max {max(blocks_per_page)}"
        )
    for p in report.overflow_pages:
        lines.append(f"  OVER 100%: p{p.page_no} est {p.fill:.0%} ({p.blocks} blocks) — review")
    for name in report.oversized_blocks:
        lines.append(f"  BLOCK TALLER THAN A PAGE: {name} — review")
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
    """Build the Vol.2 Homebrewery book from the canonical store; write the
    ``.md`` + a byte-verbatim copy of vol1's ``.css`` into ``--out``
    (default ``apps/codex/books/liturgy_vol2``). Never touches
    ``<out>/content/`` (Track B's directory — read-only input)."""
    with _tracer.start_as_current_span("assay.export-book") as span:
        out_dir = Path(args.out).resolve() if args.out else DEFAULT_OUT_DIR
        result = build_book(content_dir=out_dir / "content")
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / BOOK_MD_NAME).write_text(result.markdown, encoding="utf-8")
        (out_dir / BOOK_CSS_NAME).write_bytes(VOL1_CSS_PATH.read_bytes())
        span.set_attribute("assay.export_book.spells", result.report.spells)
        span.set_attribute("assay.export_book.pages", result.report.page_count)
        span.set_attribute("assay.export_book.chapters", len(result.report.chapters))
        print(format_report(result.report))
        print(f"-> {out_dir / BOOK_MD_NAME}")


def register_subparsers(sub: argparse._SubParsersAction) -> None:
    p_book = sub.add_parser(
        "export-book",
        help=(
            "build the Liturgy of the Iridite Vol.2 Homebrewery book from the canonical "
            "homebrew store -> apps/codex/books/liturgy_vol2/"
        ),
    )
    p_book.add_argument(
        "--out",
        default=None,
        help="output directory (default apps/codex/books/liturgy_vol2)",
    )
    p_book.set_defaults(func=cmd_export_book)
