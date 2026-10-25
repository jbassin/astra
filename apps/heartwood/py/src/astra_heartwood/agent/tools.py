"""The agent's host-side tools.

``make_tools(ws, target_date=…, validator=…)`` returns the eleven tool callables the
RLM sees, bound to one staging ``Workspace`` and one target session. Each tool's
docstring is its whole contract to the agent (dspy flattens it to one line), so it
states the return shape and the error behaviour.

Rules every tool follows: errors **raise** ``ValueError`` (the sandbox bridge turns it
into a catchable ``RuntimeError``); only ``read_page`` / ``write_page`` / ``read_transcript``
return strings; returns are plain JSON types and never ``None`` (``None`` crosses the
bridge as ``""``). Wiki tools touch staging only. Transcript tools serve only the
permitted sessions: faerrin-world, `sessions.kdl` skips honored, dated ≤ the target.
"""

from __future__ import annotations

import re
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from astra_akasha_backend.corpus import Page, load_corpus
from astra_akasha_backend.crossref import index_pages, resolve_corpus, resolve_target
from astra_linguist.chronicle import TRANSCRIPT_DIR
from astra_ontology import Resolution
from astra_ontology.models import Being
from astra_ontology_entity import resolve
from astra_sessions import date_key, iso_date
from astra_sessions.tools import SessionToolsMixin

from .sessions import faerrin_session, ingestible_dates, read_transcript
from .validate import Validator
from .workspace import PAGE_SUFFIX, Workspace, check_path_key

#: Pages the agent may read but never write, move or delete. The Timeline is kept by hand
#: (stakeholder call 2026-10-11, after the first backfill turned it into a session log).
PROTECTED_PAGES = frozenset({"Timeline"})

_FRONTMATTER = re.compile(r"\A---[ \t]*\n(.*?)^---[ \t]*$\n?", re.S | re.M)
_DATE_LINE = re.compile(r"^date:[ \t]*(.*?)[ \t]*$", re.M)
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
    """Set ``text``'s frontmatter ``date`` to ``max(existing, target)``.

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


@dataclass(frozen=True)
class LinkState:
    """Staging's link graph at one mutation generation, built with akasha's own resolver."""

    pages: dict[str, Page]
    by_path: dict[str, str]
    by_stem: dict[str, list[str]]
    #: ``{target: [sources]}`` over the resolved edges (self-links excluded).
    backlinks: dict[str, list[str]]

    def resolves(self, target: str) -> bool:
        return resolve_target(target, self.by_path, self.by_stem) is not None

    def suggest(self, target: str) -> str | None:
        """A page ``target`` probably meant, when akasha cannot resolve it.

        A folder's main page is ``<Folder>/index``, whose basename is ``index``, so a bare
        ``[[Folder]]`` link misses it; the same goes for a basename that differs only in
        case. Folder index pages win over plain pages, then akasha's shortest-path rule.
        """
        base = target.strip().removesuffix(".md").rsplit("/", 1)[-1].casefold()
        if not base:
            return None
        folders = [
            p
            for p in self.by_path
            if p.endswith("/index") and p.rsplit("/", 2)[-2].casefold() == base
        ]
        pages = [p for p in self.by_path if p.rsplit("/", 1)[-1].casefold() == base]
        pool = folders or pages
        return min(pool, key=lambda p: (p.count("/"), len(p), p)) if pool else None


def _link_text(target: str, heading: str | None, label: str | None) -> str:
    head = f"#{heading}" if heading else ""
    return f"[[{target}{head}|{label}]]" if label else f"[[{target}{head}]]"


class HeartwoodTools(SessionToolsMixin):
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
        self._link_cache: tuple[int, LinkState] | None = None

    # ── helpers ──
    def _page_file(self, path: str) -> Path:
        file = self.ws.file(path)
        if not file.is_file():
            raise ValueError(f"no page {path!r} (list_pages() shows what exists)")
        return file

    def _links(self) -> LinkState:
        """Staging's ``LinkState`` (akasha's loader + resolver), cached per mutation generation."""
        if self._link_cache is None or self._link_cache[0] != self.ws.generation:
            pages = load_corpus(self.ws.content_dir)
            by_path, by_stem = index_pages(pages)
            index: dict[str, set[str]] = {}
            for edge in resolve_corpus(pages):
                if edge.resolved is not None and edge.resolved != edge.source:
                    index.setdefault(edge.resolved, set()).add(edge.source)
            state = LinkState(
                pages={p.path: p for p in pages},
                by_path=by_path,
                by_stem=by_stem,
                backlinks={k: sorted(v) for k, v in index.items()},
            )
            self._link_cache = (self.ws.generation, state)
        return self._link_cache[1]

    def unresolved_links(self, path: str) -> list[str]:
        """Page ``path``'s links that resolve to no staging page, one entry per distinct
        target in page order, each with a ``(did you mean …?)`` hint when one is found."""
        links = self._links()
        page = links.pages.get(path)
        if page is None:
            return []
        seen: set[str] = set()
        report: list[str] = []
        for ref in page.metadata.crossrefs:
            if ref.target in seen or links.resolves(ref.target):
                continue
            seen.add(ref.target)
            entry = _link_text(ref.target, ref.heading, ref.alias)
            hint = links.suggest(ref.target)
            if hint is not None:
                label = ref.alias or ref.target.strip().rsplit("/", 1)[-1]
                entry += f" (did you mean {_link_text(hint, ref.heading, label)}?)"
            report.append(entry)
        return report

    def _check_writable(self, key: str) -> None:
        if key in PROTECTED_PAGES:
            raise ValueError(f"page {key!r} is read-only; do not change it")

    def _check_new_path(self, key: str, *, moving_from: str | None = None) -> None:
        """Raise unless ``key`` is a sound place for a page that does not exist yet.

        New pages go inside a folder (never at the wiki root), a page never sits beside a
        folder of the same name (a folder's main page is ``<Folder>/index``), and a page
        cannot be created under another page's path. ``moving_from`` is exempt as a parent,
        so ``move_page('Org/X', 'Org/X/index')`` is the way to turn a page into a folder.
        """
        if "/" not in key:
            raise ValueError(
                f"new pages go in a folder, not the wiki root (got {key!r}); "
                "pick the folder that fits, e.g. 'Org/…', 'People/…' or 'Phenomena/…'"
            )
        parts = key.split("/")
        for i in range(1, len(parts)):
            parent = "/".join(parts[:i])
            if parent != moving_from and self.ws.file(parent).is_file():
                raise ValueError(
                    f"{parent!r} is a page, so {key!r} cannot go under it. To give it child "
                    f"pages, first call move_page({parent!r}, {parent + '/index'!r})"
                )
        if (self.ws.content_dir / key).is_dir():
            raise ValueError(f"{key!r} is a folder; its main page is {key + '/index'!r}")

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
        pages = ((p, self.ws.file(p).read_text(encoding="utf-8")) for p in self.ws.pages())
        return self._search_pages(pages, pattern, regex)

    def write_page(self, path: str, text: str) -> str:
        """Create or replace page `path` with vellum `text` (parent folders are created; the
        frontmatter date is set for you). Returns 'created <path>' or 'updated <path>'; when
        some of the page's links match no page, a second line follows: 'unresolved links:
        [[X]] (did you mean [[Y|X]]?), [[Z]]'. The page is written either way; rewrite it to
        fix those links. Returns 'rejected: <validator report>' when the text fails validation
        (nothing written; fix and retry). Raises ValueError on a bad path, a read-only page
        (Timeline), a new page at the wiki root, or a new page beside or under another page
        of the same name."""
        key = check_path_key(path)
        self._check_writable(key)
        file = self.ws.file(key)
        if not isinstance(text, str) or not text.strip():
            raise ValueError("text must be non-empty vellum")
        if not file.is_file():
            self._check_new_path(key)
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
        result = f"{'created' if created else 'updated'} {key}"
        unresolved = self.unresolved_links(key)
        if unresolved:
            result += "\nunresolved links: " + ", ".join(unresolved)
        return result

    def move_page(self, src: str, dst: str) -> dict[str, Any]:
        """Move page `src` to path `dst` (empty folders are removed). Returns {'moved': [src,
        dst], 'backlinks': [pages that linked to src before the move; fix or drop their
        links]}. To give a page child pages, move 'X' to 'X/index'. Raises ValueError if src
        is missing, dst already exists, either is read-only (Timeline), or dst breaks the
        same rules as a new page in write_page."""
        src, dst = check_path_key(src), check_path_key(dst)
        self._check_writable(src)
        self._check_writable(dst)
        self._page_file(src)
        if self.ws.file(dst).exists():
            raise ValueError(f"destination {dst!r} already exists")
        self._check_new_path(dst, moving_from=src)
        links = self.backlinks(src)
        self.ws.move(src, dst)
        return {"moved": [src, dst], "backlinks": links}

    def delete_page(self, path: str) -> dict[str, Any]:
        """Delete page `path` (empty folders are removed). Returns {'deleted': path,
        'backlinks': [pages that linked to it; fix or drop their links]}. Raises ValueError if
        the page does not exist or is read-only (Timeline)."""
        key = check_path_key(path)
        self._check_writable(key)
        self._page_file(key)
        links = self.backlinks(key)
        self.ws.delete(key)
        return {"deleted": key, "backlinks": links}

    def backlinks(self, path: str) -> list[str]:
        """Sorted paths of the pages whose [[links]] resolve to page `path` (akasha's own
        resolver: exact path, folder index, else shortest path with the same basename).
        Raises ValueError on a bad path."""
        key = check_path_key(path)
        return list(self._links().backlinks.get(key, []))

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
        return self._search_transcripts(
            self.sessions,
            lambda d: read_transcript(d, transcript_dir=self.transcript_dir),
            pattern,
            regex,
        )

    # ── entities ──
    def resolve_name(self, name: str) -> dict[str, Any]:
        """Look a (possibly misheard) name up in the entity registry. Returns {'status':
        'resolved'|'ambiguous'|'unknown', 'canonical', 'kind', 'page' ('' when none),
        'page_exists' (bool, checked against the wiki now), 'confidence' (0-1), 'candidates'
        (up to 5 nearest canonical names)}. Raises ValueError on an empty name."""
        return self._resolve_name(name, self.resolver, self._page_exists)

    def _page_exists(self, page: str) -> bool:
        try:
            return self.ws.exists(page)
        except ValueError:
            return False

    def tools(self) -> list[Callable[..., Any]]:
        """The bound tool callables."""
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
