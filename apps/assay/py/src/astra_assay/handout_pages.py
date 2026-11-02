"""Split a parsed handout flow into pages, and check what the pages hold.

``handout.parse_handout`` reads the source into a flat flow; :func:`assemble` cuts it at
each ``\\page`` into :class:`Page` objects. On each page ``\\column`` splits columns one and
two, the ``{{chapter}}`` header and the art leave the text flow, and trailing empty columns
(Homebrewery sources end with a ``\\column`` before the art) are dropped. It then checks that
each page has at most two columns, one header and one image per slot (``handout_art.SLOTS``),
and that every inline ``{{name ...}}`` span is one the LaTeX side knows.
"""

from __future__ import annotations

from . import handout_art
from .handout_model import (
    INLINE_SPAN_RE,
    INLINE_SPANS,
    Art,
    ColumnBreak,
    DefRow,
    Element,
    Flow,
    Handout,
    HandoutError,
    Header,
    Heading,
    Page,
    PageBreak,
    Paragraph,
    RightAligned,
    RuleBlock,
    Table,
    Transcript,
)


def assemble(handout: Handout, flow: list[Flow]) -> None:
    """Fill ``handout.pages`` (and the title from the first header) from ``flow``."""
    pages = [Page(number=1)]
    for item in flow:
        page = pages[-1]
        if isinstance(item, PageBreak):
            pages.append(Page(number=page.number + 1))
        elif isinstance(item, ColumnBreak):
            page.columns.append([])
        elif isinstance(item, Header):
            if page.header is not None:
                raise HandoutError(f"line {item.line}: page {page.number} has a second header")
            page.header = item
        elif isinstance(item, Art):
            page.arts.append(item)
        else:
            page.columns[-1].append(item)
    for page in pages:
        _close(page)
    while len(pages) > 1 and _empty(pages[-1]):
        pages.pop()
    first = pages[0].header
    if first is None or not first.title:
        raise HandoutError("no '# Title' found in a {{chapter}} header block on the first page")
    handout.eyebrow, handout.title = first.eyebrow, first.title
    handout.pages = pages
    _check_inline_spans(handout)


def _close(page: Page) -> None:
    while len(page.columns) > 1 and not page.columns[-1]:
        page.columns.pop()
    if len(page.columns) > 2:
        raise HandoutError(
            f"page {page.number} has more than two columns of content (one \\column per page)"
        )
    taken: dict[str, Art] = {}
    for art in page.arts:
        slot = handout_art.slot_of(art.wrapper_classes)[0]
        if slot in taken:
            where = "band" if slot == "band" else f"column {slot}"
            raise HandoutError(
                f"line {art.line}: page {page.number} already has art in its {where} "
                f"(line {taken[slot].line}); move one to another page or placement"
            )
        taken[slot] = art


def _empty(page: Page) -> bool:
    return not page.arts and page.header is None and not any(page.columns)


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
    texts = [(0, handout.footer)]
    for page in handout.pages:
        if page.header is not None:
            texts += [
                (page.header.line, page.header.title),
                (page.header.line, page.header.eyebrow),
            ]
        for art in page.arts:
            texts.extend((art.line, ln) for ln in art.caption)
        for column in page.columns:
            texts.extend(_walk_text(column))
    for line, text in texts:
        where = f"line {line}: " if line else ""
        for m in INLINE_SPAN_RE.finditer(text):
            if m.group("name") not in INLINE_SPANS:
                raise HandoutError(f"{where}unknown block {{{{{m.group('name')}}}}}")
        rest = INLINE_SPAN_RE.sub("", text)
        if "{{" in rest or "}}" in rest:
            raise HandoutError(f"{where}unbalanced '{{{{' or '}}}}' in {text[:60]!r}")
