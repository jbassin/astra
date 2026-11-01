"""``assay handout`` — turn a parsed handout into LaTeX and compile it with tectonic.

The look comes from ``books/liturgy_vol2/handout.sty``, which loads the book's
``liturgy.sty``: this module writes content against those macros and never restyles.
tectonic runs in a temporary directory with the book's style directory on its search
path, so the only file written next to the handout source is ``<name>.pdf`` (or
``<name>.tex`` with ``--no-compile``).
"""

from __future__ import annotations

import argparse
import itertools
import re
import shutil
import sys
import tempfile
from pathlib import Path

from astra_observe import get_tracer

from .book import BOOK_SRC_DIR, latex_escape_text, run_tectonic
from .handout import (
    INLINE_SPAN_RE,
    DefRow,
    Element,
    Handout,
    HandoutError,
    Heading,
    Paragraph,
    RightAligned,
    RuleBlock,
    Spacer,
    Table,
    Transcript,
    parse_handout,
)

#: The local image an ``{{imageWrapper}}`` shows, looked up in this order.
ART_NAMES: tuple[str, ...] = ("art.png", "art.jpg", "art.jpeg")
#: The marker handout.sty logs when text spills past the first page.
OVERFLOW_MARKER = "HANDOUT-OVERFLOW"

_HEADING_CMD = {
    1: "section",
    2: "subsection",
    3: "subsubsection",
    4: "paragraph",
    5: "subparagraph",
}
_SPAN_CMD = {"divine": "\\hodivine", "mortal": "\\homortal", "joined": "\\hojoined"}
_ALIGN_COL = {
    "l": r">{\raggedright\arraybackslash}X",
    "c": r">{\centering\arraybackslash}X",
    "r": r">{\raggedleft\arraybackslash}X",
}

# ---------------------------------------------------------------------------
# Inline markup.
# ---------------------------------------------------------------------------

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
_TRAILING_BR_RE = re.compile(r"(?:\s*<br\s*/?>)+\s*$")
_DROPCAP_WORD_RE = re.compile(r"^([A-Za-z])([A-Za-z]*)")


def _text(raw: str) -> str:
    """A plain run: LaTeX-escaped, non-ASCII glyphs wrapped for font fallback."""
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


def render_inline(text: str, line: int = 0) -> str:
    """Homebrewery inline markup -> LaTeX: spans, ``**``/``*``/``_`` emphasis, ``<br>``."""
    text = _ESCAPE_RE.sub(lambda m: chr(_PUA + _ESCAPABLE.index(m.group(1))), text)
    text = _UNDERSCORE_EM_RE.sub(r"*\1*", text)
    out: list[str] = []
    open_cmds: list[str] = []  # "**" / "*" currently open
    pos = 0
    for m in _INLINE_RE.finditer(text):
        out.append(_text(text[pos : m.start()]))
        pos = m.end()
        if m.group("span"):
            out.append(_render_span(m.group("name"), m.group("body") or "", line))
        elif m.group("br"):
            out.append("\\newline{}")
        else:
            marker = "**" if m.group("bold") else "*"
            if marker in open_cmds:
                while open_cmds and open_cmds.pop() != marker:
                    out.append("}")
                out.append("}")
            else:
                open_cmds.append(marker)
                out.append("\\textbf{" if marker == "**" else "\\textit{")
    out.append(_text(text[pos:]))
    out.append("}" * len(open_cmds))
    return "".join(out)


def small_caps(text: str) -> str:
    """Plain text -> LaTeX with each lowercase run set as ``\\hosc{RUN}``: small caps for
    the face (Wolpe Pegasus) that has real lowercase."""
    out: list[str] = []
    for lower, chars in itertools.groupby(text, key=str.islower):
        piece = "".join(chars)
        out.append(f"\\hosc{{{render_inline(piece.upper())}}}" if lower else render_inline(piece))
    return "".join(out)


def _render_span(name: str, body: str, line: int) -> str:
    if name == "f":
        return "\\actglyph{f}"
    cmd = _SPAN_CMD.get(name)
    if cmd is None:
        where = f"line {line}: " if line else ""
        raise HandoutError(f"{where}unknown block {{{{{name}}}}}")
    return f"{cmd}{{{render_inline(body.strip(), line)}}}"


# ---------------------------------------------------------------------------
# Elements.
# ---------------------------------------------------------------------------


def _paragraph(el: Paragraph, dropcap: bool) -> str:
    m = _DROPCAP_WORD_RE.match(el.text)
    if not dropcap or not m:
        return render_inline(el.text, el.line)
    rest = render_inline(el.text[m.end() :], el.line)
    return f"\\noindent\\liturgydropcap{{{m.group(1)}}}{{{m.group(2)}}}{rest}"


def _table(el: Table) -> str:
    n = len(el.header)
    aligns = (el.aligns + ["l"] * n)[:n]
    colspec = "@{}" + " ".join(_ALIGN_COL[a] for a in aligns) + "@{}"

    def cells(row: list[str], head: bool = False) -> str:
        row = (row + [""] * n)[:n]
        rendered = [render_inline(c, el.line) for c in row]
        if head:
            rendered = [f"\\tblhead{{{c}}}" for c in rendered]
        return " & ".join(rendered) + " \\\\"

    lines = ["\\par\\smallskip", "\\begingroup", "\\renewcommand{\\arraystretch}{1.15}"]
    lines.append("\\setlength{\\parskip}{0pt}")
    lines.append(f"\\tblrow{{{colspec}}}{{\\hline {cells(el.header, head=True)} \\hline}}")
    for idx, row in enumerate(el.rows):
        color = "TableBlue" if idx % 2 == 0 else "TableWhite"
        end = " \\hline" if idx == len(el.rows) - 1 else ""
        lines.append("")
        lines.append(f"\\tblrow{{{colspec}}}{{\\rowcolor{{{color}}}{cells(row)}{end}}}")
    lines.append("\\endgroup")
    return "\n".join(lines)


def _transcript(el: Transcript) -> str:
    parts: list[str] = []
    for child in el.children:
        if isinstance(child, Paragraph):
            text = _TRAILING_BR_RE.sub("", child.text)
            parts.append(render_inline(text, child.line))
        else:
            parts.append(_element(child))
    return "\\begin{hotranscript}\n" + "\n\n".join(parts) + "\n\\end{hotranscript}"


def _card(el: RuleBlock) -> str:
    title = render_inline(el.title, el.line)
    parts = [
        "\\begin{hocard}",
        f"\\spelltitle{{\\MakeUppercase{{{title}}}}}{{}}{{{render_inline(el.kind, el.line)}}}",
    ]
    if el.traits:
        pills = " ".join(f"\\pill{{{render_inline(t, el.line)}}}" for t in el.traits)
        parts.append(f"\\hotraits{{{pills}}}")
    if el.definitions:
        rows = [
            f"\\textbf{{{render_inline(d.label, d.line)}}} {render_inline(d.value, d.line)}"
            for d in el.definitions
        ]
        parts.append("\\noindent " + "\\\\\n".join(rows))
        parts.append("\\hocardrule")
    parts.append(_flow(el.body, first_noindent=True))
    parts.append("\\end{hocard}")
    return "\n".join(parts)


def _element(el: Element) -> str:
    if isinstance(el, Paragraph):
        return _paragraph(el, dropcap=False)
    if isinstance(el, Heading):
        return f"\\{_HEADING_CMD[el.level]}*{{{render_inline(el.text, el.line)}}}"
    if isinstance(el, DefRow):
        label, value = render_inline(el.label, el.line), render_inline(el.value, el.line)
        return f"\\noindent\\textbf{{{label}}} {value}"
    if isinstance(el, Spacer):
        return f"\\vspace{{{el.lines}\\baselineskip}}"
    if isinstance(el, Table):
        return _table(el)
    if isinstance(el, RightAligned):
        return f"\\begin{{flushright}}\n{render_inline(el.text, el.line)}\n\\end{{flushright}}"
    if isinstance(el, Transcript):
        return _transcript(el)
    return _card(el)


def _flow(elements: list[Element], dropcap: bool = False, first_noindent: bool = False) -> str:
    parts: list[str] = []
    for idx, el in enumerate(elements):
        if idx == 0 and isinstance(el, Paragraph) and (dropcap or first_noindent):
            tex = _paragraph(el, dropcap=dropcap)
            parts.append(tex if tex.startswith("\\noindent") else "\\noindent " + tex)
        else:
            parts.append(_element(el))
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# The document.
# ---------------------------------------------------------------------------


def find_art(handout_dir: Path) -> Path | None:
    for name in ART_NAMES:
        if (handout_dir / name).is_file():
            return handout_dir / name
    return None


def build_handout_tex(handout: Handout, art_name: str | None, source_label: str = "") -> str:
    """The full ``.tex`` for a parsed handout. ``art_name`` is the image's file name in the
    compile directory, or ``None`` to build without art."""
    if handout.art is not None and art_name is None:
        raise HandoutError(
            f"line {handout.art.line}: the handout has an {{{{imageWrapper}}}} but its folder "
            f"has no {' / '.join(ART_NAMES)}"
        )
    columns = [*handout.columns, []][:2]
    one, two = columns[0], columns[1]
    if handout.art is not None and two and isinstance(two[0], Spacer):
        two = two[1:]  # Homebrewery's room for the art; the layout reserves it itself
    footer = " \\textbar\\ ".join(small_caps(p.strip()) for p in handout.footer.split("|"))
    lines = [
        f"% Generated by `assay handout`{source_label} — DO NOT EDIT BY HAND.",
        "\\documentclass[10pt,letterpaper]{article}",
        f"\\newcommand{{\\liturgyroot}}{{{_tex_path(BOOK_SRC_DIR)}/}}",
        "\\usepackage{handout}",
        "\\hypersetup{hidelinks}",
        f"\\renewcommand{{\\liturgyfootnotelabel}}{{{footer}}}",
        "\\begin{document}",
        "\\begin{handouthead}",
        f"\\hoeyebrow{{{render_inline(handout.eyebrow)}}}" if handout.eyebrow else "",
        f"\\hotitle{{{small_caps(handout.title)}}}",
        "\\chapterrule",
        "\\end{handouthead}",
        "\\begin{handoutcolumnone}",
        _flow(one, dropcap=True),
        "\\end{handoutcolumnone}",
        "\\begin{handoutcolumntwo}",
        _flow(two),
        "\\end{handoutcolumntwo}",
    ]
    if handout.art is not None and art_name is not None:
        caption = "\\\\".join(render_inline(c, handout.art.line) for c in handout.art.caption)
        lines.append(f"\\handoutart{{{art_name}}}{{{caption}}}{{{handout.art.caption_align}}}")
    lines += ["\\handoutpage", "\\end{document}", ""]
    return "\n".join(line for line in lines if line != "")


def _tex_path(path: Path) -> str:
    text = path.resolve().as_posix()
    if not re.fullmatch(r"[A-Za-z0-9/._+-]+", text):
        raise HandoutError(f"path {text!r} has characters LaTeX cannot take in a file name")
    return text


def compile_handout(tex: str, art: Path | None, pdf_path: Path, tectonic: str) -> bool:
    """Compile ``tex`` in a temporary directory and copy the PDF to ``pdf_path``.
    Returns True when the text overflowed onto a second page."""
    with tempfile.TemporaryDirectory(prefix="assay-handout-") as tmp:
        work = Path(tmp)
        (work / "handout.tex").write_text(tex, encoding="utf-8")
        if art is not None:
            shutil.copyfile(art, work / art.name)
        proc = run_tectonic(
            tectonic,
            "handout.tex",
            cwd=work,
            out_dir=work,
            extra_args=["-Z", f"search-path={BOOK_SRC_DIR}", "--keep-logs"],
        )
        if proc.returncode != 0:
            tail = "\n".join((proc.stdout + proc.stderr).strip().splitlines()[-30:])
            raise HandoutError(f"tectonic compile failed (exit {proc.returncode}):\n{tail}")
        log = (work / "handout.log").read_text(encoding="utf-8", errors="replace")
        shutil.copyfile(work / "handout.pdf", pdf_path)
    return OVERFLOW_MARKER in log


# ---------------------------------------------------------------------------
# CLI.
# ---------------------------------------------------------------------------

_tracer = get_tracer("astra.assay")


def default_handouts_dir() -> Path:
    """``cfg.assay.handouts_path`` via astra_config: the runtime dir holding handout folders."""
    from astra_config import load_config

    return Path(load_config().assay.handouts_path)


def build_handout(
    name: str, handout_dir: Path, tectonic: str | None, no_compile: bool = False
) -> tuple[Path, bool]:
    """Build one handout folder. Returns the written file (the PDF, or the ``.tex`` with
    ``no_compile``) and whether the text overflowed the page. Raises :class:`HandoutError`."""
    source = handout_dir / "handout.md"
    if not source.is_file():
        raise HandoutError(f"no {source}")
    handout = parse_handout(source.read_text(encoding="utf-8"))
    art = find_art(handout_dir) if handout.art is not None else None
    tex = build_handout_tex(handout, art.name if art else None, f" from {name}")
    if no_compile:
        tex_path = handout_dir / f"{name}.tex"
        tex_path.write_text(tex, encoding="utf-8")
        return tex_path, False
    if not tectonic:
        raise HandoutError("tectonic not found on PATH (pass --tectonic-path)")
    pdf_path = handout_dir / f"{name}.pdf"
    return pdf_path, compile_handout(tex, art, pdf_path, tectonic)


def cmd_handout(args: argparse.Namespace) -> None:
    """Build ``<dir>/<name>.pdf`` from ``<dir>/handout.md`` (and ``art.*``)."""
    with _tracer.start_as_current_span("assay.handout") as span:
        span.set_attribute("assay.handout.name", args.name)
        handout_dir = Path(args.dir).resolve() if args.dir else default_handouts_dir() / args.name
        tectonic = args.tectonic_path or shutil.which("tectonic")
        try:
            out_path, overflow = build_handout(args.name, handout_dir, tectonic, args.no_compile)
        except HandoutError as e:
            span.set_attribute("assay.handout.compiled", False)
            raise SystemExit(f"assay handout {args.name}: {e}") from e
        span.set_attribute("assay.handout.compiled", not args.no_compile)
        span.set_attribute("assay.handout.overflow", overflow)
        if overflow:
            sys.stdout.write(
                f"warning: {args.name} does not fit one page; it continues on a second\n"
            )
        sys.stdout.write(f"-> {out_path}\n")


def register_subparsers(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser(
        "handout",
        help=(
            "build a one-page player handout PDF from <assay.handouts-path>/<name>/handout.md "
            "-> <name>.pdf in the same folder"
        ),
    )
    p.add_argument("name", help="the handout folder's name; also names the PDF")
    p.add_argument(
        "--dir", default=None, help="the handout folder (default: assay.handouts-path/<name>)"
    )
    p.add_argument(
        "--no-compile", action="store_true", help="write <name>.tex into the folder; no PDF"
    )
    p.add_argument("--tectonic-path", default=None, help="the tectonic binary (default: PATH)")
    p.set_defaults(func=cmd_handout)
