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

from . import handout_art
from .book import BOOK_SRC_DIR, latex_escape_text, run_tectonic
from .handout import parse_handout
from .handout_model import (
    ACTION_GLYPHS,
    INLINE_SPAN_RE,
    Art,
    DefRow,
    Element,
    Handout,
    HandoutError,
    Heading,
    Page,
    Paragraph,
    RightAligned,
    RuleBlock,
    Spacer,
    Table,
    Transcript,
)

#: The marker handout.sty logs when text runs past the source's last page.
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
    if name in ACTION_GLYPHS:
        return f"\\actglyph{{{name}}}"
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
        f"\\spelltitle{{\\MakeUppercase{{{title}}}}}{{{el.glyph}}}"
        f"{{{render_inline(el.kind, el.line)}}}",
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


def handout_images(handout: Handout, handout_dir: Path | None) -> list[Path]:
    """The image file for each of ``handout.arts``, in order (``handout_art.resolve_images``)."""
    try:
        return handout_art.resolve_images([(a.line, a.src) for a in handout.arts], handout_dir)
    except handout_art.ArtError as e:
        raise HandoutError(str(e)) from e


def build_handout_tex(handout: Handout, handout_dir: Path | None, source_label: str = "") -> str:
    """The full ``.tex`` for a parsed handout. Its images come from ``handout_dir`` (each is
    compiled under its own file name, next to the ``.tex``); ``None`` builds without a folder,
    which fails if the handout has art."""
    images = iter(handout_images(handout, handout_dir))
    footer = " \\textbar\\ ".join(small_caps(p.strip()) for p in handout.footer.split("|"))
    lines = [
        f"% Generated by `assay handout`{source_label} — DO NOT EDIT BY HAND.",
        "\\documentclass[10pt,letterpaper]{article}",
        f"\\newcommand{{\\liturgyroot}}{{{_tex_path(BOOK_SRC_DIR)}/}}",
        "\\usepackage{handout}",
        "\\hypersetup{hidelinks}",
        f"\\renewcommand{{\\liturgyfootnotelabel}}{{{footer}}}",
        "\\begin{document}",
    ]
    for page in handout.pages:
        lines += _page(page, [next(images) for _ in page.arts])
    lines += ["\\handoutfinish", "\\end{document}", ""]
    return "\n".join(line for line in lines if line != "")


def _page(page: Page, images: list[Path]) -> list[str]:
    """One source page: its header, its two columns, its art, then ``\\handoutpage``."""
    first = page.number == 1
    lines = ["\\hopagebegin"]
    if page.header is not None:
        lines += [
            "\\begin{handouthead}",
            f"\\hoeyebrow{{{render_inline(page.header.eyebrow)}}}" if page.header.eyebrow else "",
            f"\\hotitle{{{small_caps(page.header.title)}}}",
            "\\chapterrule",
            "\\end{handouthead}",
        ]
    one, two = [*page.columns, []][:2]
    slots = {handout_art.slot_of(a.wrapper_classes)[:2] for a in page.arts}
    # A leading spacer is Homebrewery's room for art the layout now reserves itself.
    if one and isinstance(one[0], Spacer) and slots & {("one", "t"), ("band", "t")}:
        one = one[1:]
    if two and isinstance(two[0], Spacer) and slots & {("two", "t"), ("band", "t")}:
        two = two[1:]
    lines += [
        "\\begin{handoutcolumnone}",
        _flow(one, dropcap=first),
        "\\end{handoutcolumnone}",
        "\\begin{handoutcolumntwo}",
        _flow(two),
        "\\end{handoutcolumntwo}",
    ]
    for art, path in zip(page.arts, images, strict=True):
        lines += _art(art, path)
    lines.append("\\handoutpage")
    return lines


def _art(spec: Art, path: Path) -> list[str]:
    """``\\handoutart{slot}{file}{caption}{align}{t|b}{size}`` and its crop, if any. The size
    is a band's height/width (its mask's aspect), 1 for a full column, 0 for a half one."""
    slot, pos, kind = handout_art.slot_of(spec.wrapper_classes)
    try:
        mask = handout_art.mask_size(spec.wrapper_classes)
        width, height = handout_art.image_size(path)
        aspect = height / width
        crop = handout_art.mask_crop(handout_art.parse_placement(spec.placement), mask, aspect)
    except handout_art.ArtError as e:
        raise HandoutError(f"line {spec.line}: {e}") from e
    size = {"band": f"{mask[1] / mask[0]:.5f}", "full": "1", "half": "0"}[kind]
    caption = "\\\\".join(render_inline(c, spec.line) for c in spec.caption)
    lines = [
        f"\\handoutart{{{slot}}}{{{path.name}}}{{{caption}}}{{{spec.caption_align}}}"
        f"{{{pos}}}{{{size}}}"
    ]
    if crop is not None:
        nums = (crop.x, crop.y, crop.width, crop.height, aspect)
        lines.append(f"\\handoutartcrop{{{slot}}}" + "".join(f"{{{n:.5f}}}" for n in nums))
    return lines


def _tex_path(path: Path) -> str:
    text = path.resolve().as_posix()
    if not re.fullmatch(r"[A-Za-z0-9/._+-]+", text):
        raise HandoutError(f"path {text!r} has characters LaTeX cannot take in a file name")
    return text


_OVERFULL_RE = re.compile(
    r"^Overfull \\hbox \((\d+(?:\.\d+)?)pt too wide\) in paragraph at lines (\d+)--"
)


def overfull_lines(log: str, min_pt: float = 1.0) -> list[tuple[float, int]]:
    """``(points too wide, .tex line)`` for each Overfull hbox in a TeX log wider than ``min_pt``:
    a line of text that sticks out past its column."""
    hits = []
    for raw in log.splitlines():
        m = _OVERFULL_RE.match(raw)
        if m and float(m.group(1)) > min_pt:
            hits.append((float(m.group(1)), int(m.group(2))))
    return hits


def compile_handout(tex: str, images: list[Path], pdf_path: Path, tectonic: str) -> bool:
    """Compile ``tex`` in a temporary directory and copy the PDF to ``pdf_path``.
    Returns True when the text ran past the source's last page onto extra pages."""
    with tempfile.TemporaryDirectory(prefix="assay-handout-") as tmp:
        work = Path(tmp)
        (work / "handout.tex").write_text(tex, encoding="utf-8")
        for image in images:
            shutil.copyfile(image, work / image.name)
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
        for pts, line in overfull_lines(log):
            sys.stderr.write(
                f"warning: a line sticks {pts:.1f}pt out of its column (paragraph at .tex line"
                f" {line}; build with --no-compile to see the .tex)\n"
            )
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
    ``no_compile``) and whether the text ran past the source's last page. Raises
    :class:`HandoutError`."""
    source = handout_dir / "handout.md"
    if not source.is_file():
        raise HandoutError(f"no {source}")
    handout = parse_handout(source.read_text(encoding="utf-8"))
    images = handout_images(handout, handout_dir)
    tex = build_handout_tex(handout, handout_dir, f" from {name}")
    if no_compile:
        tex_path = handout_dir / f"{name}.tex"
        tex_path.write_text(tex, encoding="utf-8")
        return tex_path, False
    if not tectonic:
        raise HandoutError("tectonic not found on PATH (pass --tectonic-path)")
    pdf_path = handout_dir / f"{name}.pdf"
    return pdf_path, compile_handout(tex, images, pdf_path, tectonic)


def cmd_handout(args: argparse.Namespace) -> None:
    """Build ``<dir>/<name>.pdf`` from ``<dir>/handout.md`` (and its images)."""
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
                f"warning: {args.name} runs past its last page; the text continues on more\n"
            )
        sys.stdout.write(f"-> {out_path}\n")


def register_subparsers(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser(
        "handout",
        help=(
            "build a player handout PDF from <assay.handouts-path>/<name>/handout.md "
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
