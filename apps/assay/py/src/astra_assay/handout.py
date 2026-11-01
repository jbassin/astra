"""Parse a player handout written in Homebrewery-style Markdown.

A handout is one "Addendum" page in the Liturgy look: a header, two columns of prose,
optional framed art with a caption, rule-block cards and a footer. Josh writes them in
the Homebrewery dialect he used for Vol.1, and the source is accepted as written:

- ``{{chapter ... }}`` holds the header: ``## Addendum`` (eyebrow), ``# Title`` and ``___``.
- ``\\column`` starts column two. Column one's overflow continues in column two.
- ``{{imageWrapper {{borderImage ![](url) {...}}} {{caption ...}} }}`` is the framed art.
  The image is the handout folder's local ``art.*`` file, never the URL.
- ``{{ruleBlock ... {{preamble ...}} {{traits ...}} {{definitions ...}} body }}`` is a card.
- ``{{transcript ...}}`` and ``{{rightAligned ...}}`` are a monospace fax and a right-aligned
  line.
- ``{{footnote A | B}}`` is the footer label.
- Inline: ``{{divine x}}``, ``{{mortal x}}``, ``{{joined x}}``, ``{{f,...}}`` (the free-action
  glyph), ``**bold**``, ``*italic*``, ``_italic_``, ``<br>`` and markdown backslash escapes.

Homebrewery positioning payloads (``{top:..}``, ``--maskHeight``, class lists after the block
name), ``{{resetCounting}}`` and HTML comments are ignored, not emulated. A line of colons is
a spacer; one at the top of column two is the Homebrewery reservation for the art and is
dropped, because the layout reserves the art itself. Any other ``{{...}}`` block fails the
parse with its name and line, so nothing is dropped silently. ``handout_latex`` turns the
parsed :class:`Handout` into LaTeX.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field


class HandoutError(Exception):
    """The handout source uses something the builder does not support."""


@dataclass
class Heading:
    level: int
    text: str
    line: int


@dataclass
class Paragraph:
    text: str
    line: int


@dataclass
class DefRow:
    label: str
    value: str
    line: int


@dataclass
class Spacer:
    lines: int


@dataclass
class Table:
    header: list[str]
    aligns: list[str]  # "l" | "c" | "r" per column
    rows: list[list[str]]
    line: int


@dataclass
class RightAligned:
    text: str
    line: int


@dataclass
class Transcript:
    children: list[Element]


@dataclass
class RuleBlock:
    title: str
    kind: str
    traits: list[str]
    definitions: list[DefRow]
    body: list[Element]
    line: int


@dataclass
class ColumnBreak:
    line: int


Element = Heading | Paragraph | DefRow | Spacer | Table | RightAligned | Transcript | RuleBlock


@dataclass
class Art:
    caption: list[str]  # caption lines, inline markup still raw
    caption_align: str  # "l" | "r"
    line: int


@dataclass
class Handout:
    eyebrow: str = ""
    title: str = ""
    footer: str = ""
    art: Art | None = None
    columns: list[list[Element]] = field(default_factory=lambda: [[]])


@dataclass
class _Block:
    """A ``{{name,classes content}}`` construct found in the source."""

    name: str
    classes: list[str]
    content: str
    line: int  # source line of the content's first character
    opened: int  # source line of the opening "{{"


_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_HEADING_RE = re.compile(r"^(#{1,5})\s+(.*)$")
_DEFROW_RE = re.compile(r"^\*\*(.+?)\*\*\s*::\s*(.*)$")
_SPACER_RE = re.compile(r"^:+$")
_RULE_RE = re.compile(r"^(?:_{3,}|-{3,}|\*{3,})$")
_TABLE_DELIM_RE = re.compile(r"^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$")
#: An inline span: ``{{name,classes content}}`` with no nested ``{{``.
INLINE_SPAN_RE = re.compile(
    r"\{\{(?P<name>[A-Za-z][\w-]*)(?P<cls>,[^\s{}]*)?(?:\s+(?P<body>(?:(?!\{\{|\}\}).)*?))?\s*\}\}",
    re.DOTALL,
)
#: Inline spans the LaTeX side knows; anything else is an unknown block.
INLINE_SPANS: frozenset[str] = frozenset({"divine", "mortal", "joined", "f"})
#: Top-level blocks that carry nothing a handout renders.
_IGNORED_BLOCKS: frozenset[str] = frozenset({"resetCounting", "pageNumber"})


def _match_close(text: str, start: int) -> int:
    """Index just past the ``}}`` that closes the ``{{`` at ``start``, or -1."""
    depth = 0
    i = start
    while i < len(text):
        if text.startswith("{{", i):
            depth += 1
            i += 2
        elif text.startswith("}}", i):
            depth -= 1
            i += 2
            if depth == 0:
                return i
        else:
            i += 1
    return -1


def _split_block(inner: str, line: int) -> _Block:
    """``name,class,... content``: the head runs to the first whitespace character."""
    m = re.search(r"\s", inner)
    head = inner[: m.start()] if m else inner
    content = inner[m.end() :] if m else ""
    content_line = line + 1 if m and m.group(0) == "\n" else line
    name, *classes = head.split(",")
    return _Block(name=name, classes=classes, content=content, line=content_line, opened=line)


def _segments(text: str, first_line: int) -> list[tuple[int, str | _Block]]:
    """Split source text into (line, line-of-text | block) items, top level only.

    A ``{{`` that starts a line opens a block when nothing but whitespace follows its
    closing ``}}`` on that line; otherwise it is inline markup in a paragraph line."""
    items: list[tuple[int, str | _Block]] = []
    lines = text.split("\n")
    offsets = [0]
    for ln in lines:
        offsets.append(offsets[-1] + len(ln) + 1)
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        line_no = first_line + i
        if stripped.startswith("{{"):
            start = offsets[i] + lines[i].index("{{")
            end = _match_close(text, start)
            if end < 0:
                raise HandoutError(f"line {line_no}: unclosed '{{{{' block")
            rest_of_line = text[end:].split("\n", 1)[0]
            if not rest_of_line.strip():
                items.append((line_no, _split_block(text[start + 2 : end - 2], line_no)))
                i = text.count("\n", 0, end) + 1  # the line after the closing braces
                continue
        items.append((line_no, lines[i]))
        i += 1
    return items


def _table_cells(row: str) -> list[str]:
    row = row.strip()
    row = row.removeprefix("|").removesuffix("|")
    return [c.strip() for c in row.split("|")]


def _align(delim: str) -> str:
    d = delim.strip()
    if d.startswith(":") and d.endswith(":"):
        return "c"
    return "r" if d.endswith(":") else "l"


Handler = Callable[["_FlowParser", _Block], None]


class _FlowParser:
    """Parses a run of Markdown lines and blocks into elements.

    ``handlers`` maps the block names allowed in this context to their handlers; any
    other block name is an error."""

    def __init__(self, handout: Handout, handlers: Mapping[str, Handler]) -> None:
        self.handout = handout
        self.handlers = handlers
        self.out: list[Element | ColumnBreak] = []
        self.para: list[str] = []
        self.para_line = 0

    def flush(self) -> None:
        if self.para:
            text = " ".join(p.strip() for p in self.para).strip()
            if text:
                self.out.append(Paragraph(text, self.para_line))
            self.para = []

    def parse(self, text: str, first_line: int) -> list[Element | ColumnBreak]:
        items = _segments(text, first_line)
        idx = 0
        while idx < len(items):
            line_no, item = items[idx]
            if isinstance(item, _Block):
                self.flush()
                self.block(item)
                idx += 1
            elif table_end := _table_end(items, idx):
                self.flush()
                self.out.append(_table(items[idx:table_end], line_no))
                idx = table_end
            else:
                self.line(item, line_no)
                idx += 1
        self.flush()
        return self.out

    def line(self, raw: str, line_no: int) -> None:
        stripped = raw.strip()
        if not stripped:
            self.flush()
        elif stripped == "\\column":
            self.flush()
            self.out.append(ColumnBreak(line_no))
        elif stripped == "\\page":
            raise HandoutError(f"line {line_no}: \\page is not supported (a handout is one page)")
        elif _SPACER_RE.match(stripped):
            self.flush()
            self.out.append(Spacer(len(stripped)))
        elif m := _HEADING_RE.match(stripped):
            self.flush()
            self.out.append(Heading(len(m.group(1)), m.group(2).strip(), line_no))
        elif m := _DEFROW_RE.match(stripped):
            self.flush()
            self.out.append(DefRow(m.group(1).strip(), m.group(2).strip(), line_no))
        elif _RULE_RE.match(stripped):
            raise HandoutError(f"line {line_no}: a horizontal rule is only supported in the header")
        else:
            if not self.para:
                self.para_line = line_no
            self.para.append(raw)

    def block(self, b: _Block) -> None:
        if b.name in _IGNORED_BLOCKS:
            return
        handler = self.handlers.get(b.name)
        if handler is None:
            raise HandoutError(f"line {b.opened}: unknown block {{{{{b.name}}}}}")
        handler(self, b)


def _table_end(items: list[tuple[int, str | _Block]], idx: int) -> int:
    """If a table (header row + delimiter row) starts at ``idx``, the index past it, else 0."""
    head = items[idx][1]
    if not (isinstance(head, str) and head.strip().startswith("|")) or idx + 1 >= len(items):
        return 0
    delim = items[idx + 1][1]
    if not (isinstance(delim, str) and _TABLE_DELIM_RE.match(delim.strip())):
        return 0
    end = idx + 2
    while end < len(items):
        row = items[end][1]
        if not (isinstance(row, str) and row.strip().startswith("|")):
            break
        end += 1
    return end


def _table(items: list[tuple[int, str | _Block]], line_no: int) -> Table:
    rows = [_table_cells(str(item)) for _, item in items]
    return Table(rows[0], [_align(d) for d in rows[1]], rows[2:], line_no)


def _parse_inner(
    parser: _FlowParser, b: _Block, handlers: Mapping[str, Handler] | None = None
) -> list[Element]:
    inner = _FlowParser(parser.handout, handlers or {})
    out: list[Element] = []
    for el in inner.parse(b.content, b.line):
        if isinstance(el, ColumnBreak):
            raise HandoutError(f"line {el.line}: \\column inside {{{{{b.name}}}}}")
        out.append(el)
    return out


def _on_chapter(parser: _FlowParser, b: _Block) -> None:
    for offset, raw in enumerate(b.content.split("\n")):
        stripped = raw.strip()
        if not stripped or _RULE_RE.match(stripped):
            continue
        m = _HEADING_RE.match(stripped)
        if m and len(m.group(1)) == 2:
            parser.handout.eyebrow = m.group(2).strip()
        elif m and len(m.group(1)) == 1:
            parser.handout.title = m.group(2).strip()
        else:
            raise HandoutError(f"line {b.line + offset}: unexpected header line {stripped!r}")


def _on_footnote(parser: _FlowParser, b: _Block) -> None:
    parser.handout.footer = " ".join(b.content.split())


def _on_image_wrapper(parser: _FlowParser, b: _Block) -> None:
    caption: list[str] = []
    align = "r"
    for line_no, item in _segments(b.content, b.line):
        if isinstance(item, str):
            if item.strip():
                raise HandoutError(f"line {line_no}: unexpected text in {{{{imageWrapper}}}}")
            continue
        if item.name == "borderImage":
            continue  # the image is the folder's art.* file; the URL and payload are ignored
        if item.name != "caption":
            raise HandoutError(f"line {item.opened}: unknown block {{{{{item.name}}}}}")
        align = "l" if "leftCaption" in item.classes else "r"
        caption = [ln.strip() for ln in item.content.split("\n") if ln.strip()]
    parser.handout.art = Art(caption=caption, caption_align=align, line=b.line)


def _on_right_aligned(parser: _FlowParser, b: _Block) -> None:
    parser.out.append(RightAligned(" ".join(b.content.split()), b.line))


def _on_transcript(parser: _FlowParser, b: _Block) -> None:
    children = _parse_inner(parser, b, {"rightAligned": _on_right_aligned})
    parser.out.append(Transcript(children))


def _spans(b: _Block) -> list[tuple[int, str, str]]:
    """The ``{{name body}}`` spans in a block's content, as (line, name, body)."""
    return [
        (b.line + b.content.count("\n", 0, m.start()), m.group("name"), (m.group("body") or ""))
        for m in INLINE_SPAN_RE.finditer(b.content)
    ]


def _on_rule_block(parser: _FlowParser, b: _Block) -> None:
    card = RuleBlock(title="", kind="", traits=[], definitions=[], body=[], line=b.line)

    def preamble(_: _FlowParser, blk: _Block) -> None:
        kind: list[str] = []
        for line, name, body in _spans(blk):
            if name == "title":
                card.title = body.strip()
            elif name in ("kind", "level"):
                kind.append(body.strip())
            elif name != "spacer":
                raise HandoutError(f"line {line}: unknown block {{{{{name}}}}}")
        card.kind = " ".join(kind)

    def traits(_: _FlowParser, blk: _Block) -> None:
        for line, name, body in _spans(blk):
            if name != "trait":
                raise HandoutError(f"line {line}: unknown block {{{{{name}}}}}")
            card.traits.append(body.strip())

    def definitions(p: _FlowParser, blk: _Block) -> None:
        for el in _parse_inner(p, blk):
            if not isinstance(el, DefRow):
                raise HandoutError(
                    f"line {blk.opened}: {{{{definitions}}}} holds only **Key** :: rows"
                )
            card.definitions.append(el)

    handlers = {"preamble": preamble, "traits": traits, "definitions": definitions}
    card.body = _parse_inner(parser, b, handlers)
    parser.out.append(card)


_TOP_LEVEL: dict[str, Handler] = {
    "chapter": _on_chapter,
    "footnote": _on_footnote,
    "imageWrapper": _on_image_wrapper,
    "transcript": _on_transcript,
    "rightAligned": _on_right_aligned,
    "ruleBlock": _on_rule_block,
}


def parse_handout(source: str) -> Handout:
    """Parse a handout's Markdown into a :class:`Handout`. Raises :class:`HandoutError`."""
    # Comments go first, keeping their newlines so line numbers stay true.
    source = _COMMENT_RE.sub(lambda m: "\n" * m.group(0).count("\n"), source)
    handout = Handout()
    parser = _FlowParser(handout, _TOP_LEVEL)
    for el in parser.parse(source, 1):
        if isinstance(el, ColumnBreak):
            handout.columns.append([])
        else:
            handout.columns[-1].append(el)
    while len(handout.columns) > 1 and not handout.columns[-1]:
        handout.columns.pop()
    if len(handout.columns) > 2:
        raise HandoutError("a handout has at most two columns of content (one \\column)")
    if not handout.title:
        raise HandoutError("no '# Title' found in a {{chapter}} header block")
    _check_inline_spans(handout)
    return handout


def _walk_text(elements: list[Element]) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    for el in elements:
        if isinstance(el, (Heading, Paragraph, RightAligned)):
            out.append((el.line, el.text))
        elif isinstance(el, DefRow):
            out.append((el.line, f"{el.label} {el.value}"))
        elif isinstance(el, Table):
            out.extend((el.line, cell) for row in [el.header, *el.rows] for cell in row)
        elif isinstance(el, Transcript):
            out.extend(_walk_text(el.children))
        elif isinstance(el, RuleBlock):
            out.append((el.line, el.title))
            out.extend(_walk_text([*el.definitions, *el.body]))
    return out


def _check_inline_spans(handout: Handout) -> None:
    """Fail on an inline ``{{name ...}}`` span the LaTeX side does not know."""
    texts = [(0, handout.title), (0, handout.eyebrow), (0, handout.footer)]
    if handout.art:
        texts.extend((handout.art.line, ln) for ln in handout.art.caption)
    for column in handout.columns:
        texts.extend(_walk_text(column))
    for line, text in texts:
        where = f"line {line}: " if line else ""
        for m in INLINE_SPAN_RE.finditer(text):
            if m.group("name") not in INLINE_SPANS:
                raise HandoutError(f"{where}unknown block {{{{{m.group('name')}}}}}")
        rest = INLINE_SPAN_RE.sub("", text)
        if "{{" in rest or "}}" in rest:
            raise HandoutError(f"{where}unbalanced '{{{{' or '}}}}' in {text[:60]!r}")
