"""Handout inline markup -> LaTeX: spans, emphasis, ``<br>``, escapes and dashes, the
first line's words for handout.sty's small-caps fitting, and the header's colours.

Split from ``handout_latex``, which emits the elements and the document around these runs.
"""

from __future__ import annotations

import colorsys
import itertools
import re

from .book import latex_escape_text
from .handout_model import ACTION_GLYPHS, INLINE_SPAN_RE, HandoutError

_SPAN_CMD = {"divine": "\\hodivine", "mortal": "\\homortal", "joined": "\\hojoined"}

#: Markdown backslash escapes. Each escaped character is parked in the Private Use Area
#: while emphasis is parsed, then restored as a literal.
_ESCAPABLE = "\\`*_{}[]()#+-.!|<>~"
_PUA = 0xE000
_ESCAPE_RE = re.compile(r"\\([" + re.escape(_ESCAPABLE) + r"])")
#: ``_italic_``: opens before a word character, closes after a non-space.
_UNDERSCORE_EM_RE = re.compile(r"(?<![\w\\])_(?=\w)(.+?)(?<=\S)_(?!\w)")
_INLINE_RE = re.compile(
    r"(?P<span>" + INLINE_SPAN_RE.pattern + r")|(?P<bold>\*\*)|(?P<ital>\*)|(?P<br><br\s*/?>)",
    re.DOTALL,
)
_BR_RE = re.compile(r"<br\s*/?>")
#: Exactly two hyphens: Homebrewery's en dash.
_EN_DASH_RE = re.compile(r"(?<!-)(--)(?!-)")


def _text(raw: str, small_caps: bool = False) -> str:
    """A plain run: LaTeX-escaped, non-ASCII glyphs wrapped for font fallback. With
    ``small_caps``, each run of lowercase letters is set as ``\\hosc{RUN}`` (handout.sty's
    synthesized small caps)."""
    if small_caps:
        out_sc: list[str] = []
        for lower, chars in itertools.groupby(raw, key=str.islower):
            piece = "".join(chars)
            out_sc.append(f"\\hosc{{{_text(piece.upper())}}}" if lower else _text(piece))
        return "".join(out_sc)
    # Homebrewery's "--" is an en dash ("---" an em dash). The book maps both to em dashes
    # (latex_escape_text), since its faces lack the en dash; \hochar falls back for it, as the
    # browser does.
    if _EN_DASH_RE.search(raw):
        return "".join(
            "\\hochar{\u2013}" if part == "--" else _text(part) for part in _EN_DASH_RE.split(raw)
        )
    out: list[str] = []
    for ch in latex_escape_text(raw):
        code = ord(ch)
        if _PUA <= code < _PUA + len(_ESCAPABLE):
            out.append(latex_escape_text(_ESCAPABLE[code - _PUA]))
        elif code > 0x7F:
            out.append(f"\\hochar{{{ch}}}")
        else:
            out.append(ch)
    return "".join(out)


def _protect(text: str) -> str:
    """Park backslash escapes in the Private Use Area and turn ``_x_`` into ``*x*``."""
    text = _ESCAPE_RE.sub(lambda m: chr(_PUA + _ESCAPABLE.index(m.group(1))), text)
    return _UNDERSCORE_EM_RE.sub(r"*\1*", text)


def _toggle(open_cmds: list[str], marker: str) -> int:
    """Open or close an emphasis marker; returns how many groups closed (0 when it opened)."""
    if marker in open_cmds:
        closed = 0
        while open_cmds and open_cmds.pop() != marker:
            closed += 1
        return closed + 1
    open_cmds.append(marker)
    return 0


def render_inline(text: str, line: int = 0, small_caps: bool = False) -> str:
    """Homebrewery inline markup -> LaTeX: spans, ``**``/``*``/``_`` emphasis, ``<br>``.
    ``small_caps`` sets the plain runs' lowercase as small caps (not the spans)."""
    text = _protect(text)
    out: list[str] = []
    open_cmds: list[str] = []  # "**" / "*" currently open
    pos = 0
    for m in _INLINE_RE.finditer(text):
        out.append(_text(text[pos : m.start()], small_caps))
        pos = m.end()
        if m.group("span"):
            out.append(_render_span(m.group("name"), m.group("body") or "", line))
        elif m.group("br"):
            out.append("\\newline{}")
        else:
            marker = "**" if m.group("bold") else "*"
            if closed := _toggle(open_cmds, marker):
                out.append("}" * closed)
            else:
                out.append("\\textbf{" if marker == "**" else "\\textit{")
    out.append(_text(text[pos:], small_caps))
    out.append("}" * len(open_cmds))
    return "".join(out)


def _words(text: str) -> list[str]:
    """Split at whitespace outside ``{{...}}`` spans."""
    words: list[str] = []
    depth = 0
    cur: list[str] = []
    i = 0
    while i < len(text):
        if text.startswith("{{", i):
            depth += 1
            cur.append("{{")
            i += 2
        elif text.startswith("}}", i) and depth:
            depth -= 1
            cur.append("}}")
            i += 2
        elif text[i].isspace() and not depth:
            if cur:
                words.append("".join(cur))
                cur = []
            i += 1
        else:
            cur.append(text[i])
            i += 1
    if cur:
        words.append("".join(cur))
    return words


def first_line_words(text: str, line: int = 0) -> tuple[list[tuple[str, str]], str]:
    """The paragraph's words as (small caps, plain) LaTeX pairs for handout.sty's first-line
    fitting, and the plain LaTeX of what follows a ``<br>`` (which ends the fitting).
    Emphasis open across words is reopened in each word."""
    pairs: list[tuple[str, str]] = []
    open_cmds: list[str] = []
    words = _words(_protect(text))
    for idx, word in enumerate(words):
        if _BR_RE.search(word):
            prefix = "".join(open_cmds)
            return pairs, render_inline(prefix + " ".join(words[idx:]), line)
        source = "".join(open_cmds) + word
        pairs.append((render_inline(source, line, small_caps=True), render_inline(source, line)))
        for m in _INLINE_RE.finditer(word):
            if m.group("bold") or m.group("ital"):
                _toggle(open_cmds, "**" if m.group("bold") else "*")
    return pairs, ""


#: ``.chapter``'s default ``--color``.
DEFAULT_CHAPTER_COLOR = "bc9e5c"
_CHAPTER_COLOR_RE = re.compile(r"--color\s*:\s*#([0-9a-fA-F]{6})\b")


def _hsl_hex(h: float, s: float, lum: float) -> str:
    r, g, b = colorsys.hls_to_rgb(h, lum, s)
    return "".join(f"{round(c * 255):02X}" for c in (r, g, b))


def chapter_colors(classes: list[str]) -> tuple[str, str]:
    """(eyebrow, glow) hex colours for a ``{{chapter}}`` block's class list, as the Vol.1 CSS
    derives them from ``--color`` with ``hsl(from ...)``: the eyebrow is ``h s
    clamp(40, l, 60)``; the glow (only with the ``gradient`` class, else "") is
    ``h max(s/2, 30) clamp(30, l*0.75, 70)``."""
    color = DEFAULT_CHAPTER_COLOR
    for cls in classes:
        if m := _CHAPTER_COLOR_RE.search(cls):
            color = m.group(1)
    h, lum, s = colorsys.rgb_to_hls(*(int(color[i : i + 2], 16) / 255 for i in (0, 2, 4)))
    eyebrow = _hsl_hex(h, s, min(max(lum, 0.40), 0.60))
    glow = ""
    if "gradient" in classes:
        glow = _hsl_hex(h, max(s / 2, 0.30), min(max(lum * 0.75, 0.30), 0.70))
    return eyebrow, glow


def _render_span(name: str, body: str, line: int) -> str:
    if name in ACTION_GLYPHS:
        return f"\\actglyph{{{name}}}"
    cmd = _SPAN_CMD.get(name)
    if cmd is None:
        where = f"line {line}: " if line else ""
        raise HandoutError(f"{where}unknown block {{{{{name}}}}}")
    return f"{cmd}{{{render_inline(body.strip(), line)}}}"
