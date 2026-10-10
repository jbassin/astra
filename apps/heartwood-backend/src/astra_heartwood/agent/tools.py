"""The agent's host-side tools (0033 §3, D33-3..D33-6).

``make_tools(ws, target_date=…, validator=…)`` returns the eleven tool callables the
RLM sees, bound to one staging ``Workspace`` and one target session. Each tool's
docstring is its whole contract to the agent (dspy flattens it to one line), so it
states the return shape and the error behaviour.

Rules every tool follows: errors **raise** ``ValueError`` (the sandbox bridge turns it
into a catchable ``RuntimeError``); only ``read_page`` / ``write_page`` / ``read_transcript``
return strings; returns are plain JSON types and never ``None`` (``None`` crosses the
bridge as ``""``). Wiki tools touch staging only. Transcript tools serve only the
permitted sessions: faerrin-world, ``EXCLUDED_DATES`` honored, dated ≤ the target (D6).
"""

from __future__ import annotations

import re
import tempfile
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

from astra_akasha_backend.corpus import load_corpus
from astra_akasha_backend.crossref import resolve_corpus
from astra_linguist.chronicle import TRANSCRIPT_DIR, date_key
from astra_ontology import Resolution
from astra_ontology.models import Being
from astra_ontology_entity import resolve

from .dates import iso_date
from .sessions import faerrin_session, ingestible_dates, read_transcript
from .validate import Validator
from .workspace import PAGE_SUFFIX, Workspace, check_path_key

#: Cap on search results (both wiki and transcript searches).
MAX_RESULTS = 200
#: How many ``resolve_name`` candidates to surface.
MAX_CANDIDATES = 5

_FRONTMATTER = re.compile(r"\A---[ \t]*\n(.*?)^---[ \t]*$\n?", re.S | re.M)
_DATE_LINE = re.compile(r"^date:[ \t]*(.*?)[ \t]*$", re.M)
_TRANSCRIPT_LINE = re.compile(r"^(\d+)\t([^:]*):[ \t]?(.*)$")
#: Naive corpus dates are read in the campaign's zone (matches ``iso_date``'s -04:00).
_DEFAULT_OFFSET = datetime.fromisoformat("2000-01-01T00:00:00-04:00").tzinfo


def _parse_date(value: str) -> datetime | None:
    try:
        dt = datetime.fromisoformat(value.strip().strip("'\""))
    except ValueError:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=_DEFAULT_OFFSET)


def frontmatter_date(text: str) -> str | None:
    """The raw ``date:`` value of ``text``'s frontmatter, if any."""
    fm = _FRONTMATTER.match(text)
    if fm is None:
        return None
    m = _DATE_LINE.search(fm.group(1))
    return m.group(1) if m else None


def stamp_date(text: str, *, existing: str | None, target_iso: str) -> str:
    """Set ``text``'s frontmatter ``date`` to ``max(existing, target)`` (D33-5).

    ``existing`` is the ``date:`` value of the page being replaced (``None`` for a new
    page); the agent's own ``date`` is ignored. The winning value is written verbatim
    (an existing later date keeps its exact spelling). Other frontmatter lines are kept
    byte-for-byte; a missing ``date:`` line is appended to the block; a page with no
    frontmatter gets ``---\\ndate: <iso>\\ntags: []\\n---\\n`` prepended.
    """
    stamped = target_iso
    old = _parse_date(existing) if existing is not None else None
    new = _parse_date(target_iso)
    if old is not None and existing is not None and new is not None and old > new:
        stamped = existing.strip()

    fm = _FRONTMATTER.match(text)
    if fm is None:
        sep = "" if text.startswith("\n") else "\n"
        return f"---\ndate: {stamped}\ntags: []\n---\n{sep}{text}"
    block = fm.group(1).removesuffix("\n")  # the group runs up to the closing '---' line
    if _DATE_LINE.search(block):
        block = _DATE_LINE.sub(lambda _: f"date: {stamped}", block, count=1)
    else:
        block = f"{block.rstrip(chr(10))}\ndate: {stamped}" if block.strip() else f"date: {stamped}"
    return f"---\n{block}\n---\n{text[fm.end() :]}"


def _matcher(pattern: str, regex: bool) -> Callable[[str], bool]:
    if not isinstance(pattern, str) or not pattern:
        raise ValueError("pattern must be a non-empty string")
    if regex:
        try:
            rx = re.compile(pattern, re.I)
        except re.error as exc:
            raise ValueError(f"invalid regex {pattern!r}: {exc}") from exc
        return lambda line: rx.search(line) is not None
    needle = pattern.casefold()
    return lambda line: needle in line.casefold()


class HeartwoodTools:
    """The tool implementations; ``make_tools`` exposes the bound methods.

    ``sessions`` maps each permitted date (≤ target, faerrin, not excluded) to its
    campaign slug, oldest first. ``resolver`` defaults to the committed entity registry.
    """

    def __init__(
        self,
        ws: Workspace,
        *,
        target_date: str,
        validator: Validator,
        transcript_dir: Path = TRANSCRIPT_DIR,
        being: Being | None = None,
        resolver: Callable[[str], Resolution] = resolve,
    ) -> None:
        campaign = faerrin_session(target_date, being=being, transcript_dir=transcript_dir)
        if campaign is None:
            raise ValueError(f"{target_date} is not an ingestible faerrin-world session")
        self.ws = ws
        self.target_date = target_date
        self.campaign = campaign
        self.target_iso = iso_date(target_date)
        self.validator = validator
        self.transcript_dir = transcript_dir
        self.resolver = resolver
        limit = date_key(target_date)
        self.sessions: dict[str, str] = {}
        for d in ingestible_dates(being=being, transcript_dir=transcript_dir):
            if date_key(d) <= limit:
                slug = faerrin_session(d, being=being, transcript_dir=transcript_dir)
                if slug is not None:
                    self.sessions[d] = slug
        self._backlink_cache: tuple[int, dict[str, list[str]]] | None = None

    # ── helpers ──
    def _page_file(self, path: str) -> Path:
        file = self.ws.file(path)
        if not file.is_file():
            raise ValueError(f"no page {path!r} (list_pages() shows what exists)")
        return file

    def _backlink_index(self) -> dict[str, list[str]]:
        """``{target: [sources]}`` from akasha's resolver, cached per mutation generation."""
        if self._backlink_cache is None or self._backlink_cache[0] != self.ws.generation:
            index: dict[str, set[str]] = {}
            for edge in resolve_corpus(load_corpus(self.ws.content_dir)):
                if edge.resolved is not None and edge.resolved != edge.source:
                    index.setdefault(edge.resolved, set()).add(edge.source)
            self._backlink_cache = (
                self.ws.generation,
                {k: sorted(v) for k, v in index.items()},
            )
        return self._backlink_cache[1]

    def _permitted(self, date: str) -> None:
        if date not in self.sessions:
            raise ValueError(
                f"session {date!r} is not available (only earlier same-world sessions "
                f"up to {self.target_date}; see list_sessions())"
            )

    # ── wiki ──
    def list_pages(self) -> list[str]:
        """Every wiki page path (e.g. 'Bestiary/Auger'), sorted. Reflects your edits so far."""
        return self.ws.pages()

    def read_page(self, path: str) -> str:
        """The raw vellum source of page `path`. Raises ValueError if the page does not exist."""
        return self._page_file(path).read_text(encoding="utf-8")

    def search_wiki(self, pattern: str, regex: bool = False) -> list[dict[str, Any]]:
        """Case-insensitive search of every page line; regex=False matches `pattern` literally.
        Returns up to 200 [{'path', 'line' (1-based int), 'text'}]. Raises ValueError on an
        empty pattern or invalid regex."""
        match = _matcher(pattern, regex)
        hits: list[dict[str, Any]] = []
        for path in self.ws.pages():
            text = self.ws.file(path).read_text(encoding="utf-8")
            for n, line in enumerate(text.splitlines(), start=1):
                if match(line):
                    hits.append({"path": path, "line": n, "text": line})
                    if len(hits) >= MAX_RESULTS:
                        return hits
        return hits

    def write_page(self, path: str, text: str) -> str:
        """Create or replace page `path` with vellum `text` (parent folders are created; the
        frontmatter date is set for you). Returns 'created <path>', 'updated <path>', or
        'rejected: <validator report>' (nothing written; fix and retry). Raises ValueError on a
        bad path."""
        key = check_path_key(path)
        file = self.ws.file(key)
        if not isinstance(text, str) or not text.strip():
            raise ValueError("text must be non-empty vellum")
        existing = frontmatter_date(file.read_text(encoding="utf-8")) if file.is_file() else None
        candidate = stamp_date(text, existing=existing, target_iso=self.target_iso)
        if not candidate.endswith("\n"):
            candidate += "\n"
        with tempfile.TemporaryDirectory(prefix="heartwood-validate-") as tmp:
            probe = Path(tmp) / f"{key}{PAGE_SUFFIX}"
            probe.parent.mkdir(parents=True, exist_ok=True)
            probe.write_text(candidate, encoding="utf-8")
            report = self.validator(tmp)
            if report is not None:
                return f"rejected: {report.replace(tmp + '/', '').strip()}"
        created = self.ws.write(key, candidate)
        return f"{'created' if created else 'updated'} {key}"

    def move_page(self, src: str, dst: str) -> dict[str, Any]:
        """Move page `src` to path `dst` (empty folders are removed). Returns {'moved': [src,
        dst], 'backlinks': [pages that linked to src before the move — fix or drop their
        links]}. Raises ValueError if src is missing or dst already exists."""
        src, dst = check_path_key(src), check_path_key(dst)
        self._page_file(src)
        if self.ws.file(dst).exists():
            raise ValueError(f"destination {dst!r} already exists")
        links = self.backlinks(src)
        self.ws.move(src, dst)
        return {"moved": [src, dst], "backlinks": links}

    def delete_page(self, path: str) -> dict[str, Any]:
        """Delete page `path` (empty folders are removed). Returns {'deleted': path,
        'backlinks': [pages that linked to it — fix or drop their links]}. Raises ValueError if
        the page does not exist."""
        key = check_path_key(path)
        self._page_file(key)
        links = self.backlinks(key)
        self.ws.delete(key)
        return {"deleted": key, "backlinks": links}

    def backlinks(self, path: str) -> list[str]:
        """Sorted paths of the pages whose [[links]] resolve to page `path` (akasha's own
        resolver: exact path, folder index, else shortest path with the same basename).
        Raises ValueError on a bad path."""
        key = check_path_key(path)
        return list(self._backlink_index().get(key, []))

    # ── transcripts ──
    def list_sessions(self) -> list[dict[str, Any]]:
        """Returns the sessions you may read, oldest first: [{'date', 'campaign', 'is_target'}].
        Only same-world sessions up to and including the target are available."""
        return [
            {"date": d, "campaign": c, "is_target": d == self.target_date}
            for d, c in self.sessions.items()
        ]

    def read_transcript(self, date: str) -> str:
        """The full transcript of session `date` (lines 'NNNNNN<TAB>Speaker: text'). Raises
        ValueError for a date not in list_sessions()."""
        self._permitted(date)
        return read_transcript(date, transcript_dir=self.transcript_dir)

    def search_transcripts(self, pattern: str, regex: bool = False) -> list[dict[str, Any]]:
        """Case-insensitive search of the spoken text of every available session, oldest
        first; regex=False matches `pattern` literally. Returns up to 200 [{'date', 'line'
        (int line number), 'speaker', 'text'}]. Raises ValueError on an empty pattern or
        invalid regex."""
        match = _matcher(pattern, regex)
        hits: list[dict[str, Any]] = []
        for date in self.sessions:
            text = read_transcript(date, transcript_dir=self.transcript_dir)
            for raw in text.splitlines():
                m = _TRANSCRIPT_LINE.match(raw)
                if m is None:
                    continue
                spoken = m.group(3).rstrip()
                if match(spoken):
                    hits.append(
                        {
                            "date": date,
                            "line": int(m.group(1)),
                            "speaker": m.group(2).strip(),
                            "text": spoken,
                        }
                    )
                    if len(hits) >= MAX_RESULTS:
                        return hits
        return hits

    # ── entities ──
    def resolve_name(self, name: str) -> dict[str, Any]:
        """Look a (possibly misheard) name up in the entity registry. Returns {'status':
        'resolved'|'ambiguous'|'unknown', 'canonical', 'kind', 'page' ('' when none),
        'page_exists' (bool, checked against the wiki now), 'confidence' (0-1), 'candidates'
        (up to 5 nearest canonical names)}. Raises ValueError on an empty name."""
        if not isinstance(name, str) or not name.strip():
            raise ValueError("name must be a non-empty string")
        res = self.resolver(name)
        ent = res.entity
        page = (ent.page or "") if ent is not None else ""
        page_exists = False
        if page:
            try:
                page_exists = self.ws.exists(page)
            except ValueError:
                page_exists = False
        return {
            "status": res.status,
            "canonical": ent.canonical if ent is not None else "",
            "kind": (ent.kind or "") if ent is not None else "",
            "page": page,
            "page_exists": page_exists,
            "confidence": round(float(res.confidence), 3),
            "candidates": [ref.canonical for ref, _ in res.candidates[:MAX_CANDIDATES]],
        }

    def tools(self) -> list[Callable[..., Any]]:
        """The bound tool callables, in §3 order."""
        return [
            self.list_pages,
            self.read_page,
            self.search_wiki,
            self.write_page,
            self.move_page,
            self.delete_page,
            self.backlinks,
            self.list_sessions,
            self.read_transcript,
            self.search_transcripts,
            self.resolve_name,
        ]


def make_tools(
    ws: Workspace,
    *,
    target_date: str,
    validator: Validator,
    transcript_dir: Path = TRANSCRIPT_DIR,
    being: Being | None = None,
    resolver: Callable[[str], Resolution] = resolve,
) -> list[Callable[..., Any]]:
    """The agent's tools bound to ``ws`` and ``target_date`` (raises ``ValueError`` if the
    target is not an ingestible faerrin session). ``transcript_dir`` / ``being`` /
    ``resolver`` are test seams."""
    return HeartwoodTools(
        ws,
        target_date=target_date,
        validator=validator,
        transcript_dir=transcript_dir,
        being=being,
        resolver=resolver,
    ).tools()
