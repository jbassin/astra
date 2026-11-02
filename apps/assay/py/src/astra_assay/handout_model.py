"""The parsed form of a player handout: what ``handout`` parses and ``handout_latex`` emits.

``handout.parse_handout`` reads the source into a flat flow of elements and markers
(``\\column``, ``\\page``, the ``{{chapter}}`` header, the art), and ``handout_pages``
assembles that flow into :class:`Page` objects.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

#: An inline span: ``{{name,classes content}}`` with no nested ``{{``.
INLINE_SPAN_RE = re.compile(
    r"\{\{(?P<name>[A-Za-z][\w-]*)(?P<cls>,[^\s{}]*)?(?:\s+(?P<body>(?:(?!\{\{|\}\}).)*?))?\s*\}\}",
    re.DOTALL,
)
#: The action-glyph spans: one, two and three actions, reaction, free. Each name is also
#: its Pathfinder2eActions character (``\\actglyph``); a ``,style`` payload is ignored.
ACTION_GLYPHS: frozenset[str] = frozenset({"a", "d", "t", "r", "f"})
#: Inline spans the LaTeX side knows; anything else is an unknown block.
INLINE_SPANS: frozenset[str] = frozenset({"divine", "mortal", "joined"}) | ACTION_GLYPHS


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
    #: The action glyph after the title (``{{r}}`` -> ``"r"``), or "".
    glyph: str = ""


Element = Heading | Paragraph | DefRow | Spacer | Table | RightAligned | Transcript | RuleBlock


@dataclass
class ColumnBreak:
    line: int


@dataclass
class PageBreak:
    line: int


@dataclass
class Header:
    """A ``{{chapter}}`` block: ``## eyebrow`` and ``# Title``."""

    eyebrow: str
    title: str
    line: int
    #: The block's class list: ``gradient`` and ``--color:#rrggbb`` set the header's colours.
    classes: list[str] = field(default_factory=list)


@dataclass
class Art:
    caption: list[str]  # caption lines, inline markup still raw
    caption_align: str  # "l" | "r"
    line: int
    #: The imageWrapper's class list (it names the placement and the mask window) and the
    #: borderImage's ``{top:..,left:..,width:..}`` payload, raw; ``handout_art`` reads them.
    wrapper_classes: list[str] = field(default_factory=list)
    placement: str = ""
    #: The ``![](...)`` target, raw: a bare file name in the handout folder, or a URL.
    src: str = ""
    #: The caption's class list: ``leftCaption``/``rightCaption`` and its ``top:``/``left:``
    #: (or ``right:``/``bottom:``) position, raw; ``handout_art.caption_place`` reads them.
    caption_classes: list[str] = field(default_factory=list)


#: One item of the parsed flow, before ``handout_pages`` splits it into pages.
Flow = Element | ColumnBreak | PageBreak | Header | Art


@dataclass
class Page:
    """One source page: up to two columns, its art, and its own header if it has one."""

    columns: list[list[Element]] = field(default_factory=lambda: [[]])
    arts: list[Art] = field(default_factory=list)
    header: Header | None = None
    number: int = 1


@dataclass
class Handout:
    eyebrow: str = ""
    title: str = ""
    footer: str = ""
    pages: list[Page] = field(default_factory=lambda: [Page()])

    @property
    def arts(self) -> list[Art]:
        """Every image, in source order."""
        return [art for page in self.pages for art in page.arts]
