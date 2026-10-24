"""The producer's read-only tools (0034 §3, D34-4, D34-5).

``ProducerTools`` binds one target session and exposes eleven lookups over the live trees:
the akasha wiki, the entity registry, the chronicle, earlier same-show transcripts and
earlier episode scripts. Nothing here writes anywhere.

Boundary (D34-5): transcript, chronicle and script tools serve only sessions of the
target's show dated **strictly before** the target, ``EXCLUDED_DATES`` honoured (via
``show_for_date``), ordered by ``date_key``. The target's own cleaned transcript reaches
the agent as an input, never through a tool.

Rules every tool follows (the 0033 contract): errors **raise** ``ValueError``; returns are
plain JSON types and never ``None``. Each docstring is the tool's whole contract to the agent.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from astra_akasha_backend.corpus import CONTENT_DIR, Page, load_corpus
from astra_akasha_backend.crossref import resolve_corpus
from astra_linguist.chronicle import (
    EPISODES_DIR,
    SEASONS_PATH,
    TRANSCRIPT_DIR,
    EpisodeEntry,
    ShowInfo,
    load_episode_entries,
    season_for,
    show_for_date,
)
from astra_llm.rlm import text_matcher
from astra_ontology import Resolution
from astra_ontology_entity import resolve
from astra_sessions import date_key, find_transcript, transcript_dates
from astra_sessions.tools import MAX_RESULTS, SessionToolsMixin

from ..episodes_index import is_recap, parse_id
from ..models import stored_kind


def permitted_dates(
    target_date: str,
    show: str,
    *,
    transcript_dir: Path = TRANSCRIPT_DIR,
    shows: dict[str, ShowInfo] | None = None,
) -> list[str]:
    """Same-show session dates strictly before ``target_date``, oldest first."""
    limit = date_key(target_date)
    keep = []
    for d in transcript_dates(transcript_dir):
        try:
            key = date_key(d)
        except ValueError:
            continue
        if key >= limit:
            continue
        info = show_for_date(d, transcript_dir=transcript_dir, shows=shows)
        if info is not None and info.slug == show:
            keep.append(d)
    return sorted(keep, key=date_key)


def _script_files(scripts_root: Path, show: str, permitted: set[str]) -> dict[str, Path]:
    """``{date: script.json}`` for permitted dates. Episode dirs are keyed two ways (the live
    ``<date>/`` and the legacy ``000.<slug>.<date>/``), so identity comes from the script's
    own id (``session_id`` or ``sessionId``, else the dir name); recaps are skipped."""
    found: dict[str, Path] = {}
    for file in sorted(scripts_root.glob("*/script.json")):
        try:
            raw = json.loads(file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        sid = raw.get("session_id") or raw.get("sessionId") or file.parent.name
        if not isinstance(sid, str) or is_recap(file.parent.name):
            continue
        if stored_kind(raw, sid) != "session":
            continue
        _arc, slug, date = parse_id(sid)
        if slug == show and date in permitted:
            found[date] = file
    return found


def _speaker_names(raw: dict[str, Any]) -> dict[str, str]:
    """Speaker letter (upper-cased) → host name. Legacy scripts key hosts ``A/B/C``,
    current ones ``a/b/c``."""
    hosts = raw.get("hosts") or {}
    names: dict[str, str] = {}
    for key, host in hosts.items():
        if isinstance(host, dict) and isinstance(host.get("name"), str):
            names[str(key).upper()] = host["name"]
    return names


class ProducerTools(SessionToolsMixin):
    """The tool implementations; ``tools()`` exposes the bound methods."""

    def __init__(
        self,
        *,
        target_date: str,
        show: str,
        content_dir: Path = CONTENT_DIR,
        transcript_dir: Path = TRANSCRIPT_DIR,
        episodes_dir: Path = EPISODES_DIR,
        seasons_path: Path = SEASONS_PATH,
        scripts_root: Path,
        shows: dict[str, ShowInfo] | None = None,
        resolver: Callable[[str], Resolution] = resolve,
    ) -> None:
        self.target_date = target_date
        self.show = show
        self.transcript_dir = transcript_dir
        self.seasons_path = seasons_path
        self.resolver = resolver
        self.dates = permitted_dates(target_date, show, transcript_dir=transcript_dir, shows=shows)
        allowed = set(self.dates)
        self.pages: dict[str, Page] = {p.path: p for p in load_corpus(content_dir)}
        backlinks: dict[str, set[str]] = {}
        for edge in resolve_corpus(list(self.pages.values())):
            if edge.resolved is not None and edge.resolved != edge.source:
                backlinks.setdefault(edge.resolved, set()).add(edge.source)
        self._backlinks = {k: sorted(v) for k, v in backlinks.items()}
        self.episodes: dict[str, EpisodeEntry] = {
            e.date: e
            for e in sorted(load_episode_entries(episodes_dir), key=lambda e: date_key(e.date))
            if e.show == show and e.date in allowed
        }
        self.scripts = _script_files(scripts_root, show, allowed)

    # ── helpers ──
    def _permitted(self, date: str) -> None:
        if date not in self.dates:
            raise ValueError(
                f"session {date!r} is not available (only this show's sessions before "
                f"{self.target_date}; list_episodes() shows them)"
            )

    def _transcript_text(self, date: str) -> str:
        path = find_transcript(date, self.transcript_dir)
        if path is None:
            raise ValueError(f"no transcript for {date!r}")
        return path.read_text(encoding="utf-8")

    def _script_turns(self, date: str) -> list[tuple[str, str]]:
        raw = json.loads(self.scripts[date].read_text(encoding="utf-8"))
        names = _speaker_names(raw)
        turns = []
        for turn in raw.get("turns") or []:
            letter = str(turn.get("speaker", "")).upper()
            turns.append((names.get(letter, letter), str(turn.get("text", ""))))
        return turns

    # ── wiki ──
    def list_pages(self) -> list[str]:
        """Every wiki page path (e.g. 'Bestiary/Auger'), sorted."""
        return sorted(self.pages)

    def read_page(self, path: str) -> str:
        """The raw source of wiki page `path`. Raises ValueError if the page does not exist."""
        page = self.pages.get(path)
        if page is None:
            raise ValueError(f"no page {path!r} (list_pages() shows what exists)")
        return page.source

    def search_wiki(self, pattern: str, regex: bool = False) -> list[dict[str, Any]]:
        """Case-insensitive search of every wiki page line; regex=False matches `pattern`
        literally. Returns up to 200 [{'path', 'line' (1-based int), 'text'}]. Raises
        ValueError on an empty pattern or invalid regex."""
        pages = ((path, self.pages[path].source) for path in sorted(self.pages))
        return self._search_pages(pages, pattern, regex)

    def backlinks(self, path: str) -> list[str]:
        """Sorted paths of the wiki pages whose [[links]] resolve to page `path`. Raises
        ValueError if the page does not exist."""
        if path not in self.pages:
            raise ValueError(f"no page {path!r} (list_pages() shows what exists)")
        return list(self._backlinks.get(path, []))

    def resolve_name(self, name: str) -> dict[str, Any]:
        """Look a (possibly misheard) name up in the entity registry. Returns {'status':
        'resolved'|'ambiguous'|'unknown', 'canonical', 'kind', 'page' ('' when none),
        'page_exists' (bool), 'confidence' (0-1), 'candidates' (up to 5 nearest canonical
        names)}. Raises ValueError on an empty name."""
        return self._resolve_name(name, self.resolver, lambda page: page in self.pages)

    # ── chronicle ──
    def list_episodes(self) -> list[dict[str, Any]]:
        """This show's earlier episodes, oldest first: [{'date', 'title', 'synopsis',
        'has_transcript' (bool), 'has_script' (bool)}]. Every session before the target that
        has a transcript is listed, with '' title/synopsis when no chronicle entry exists."""
        out = []
        for d in self.dates:
            entry = self.episodes.get(d)
            out.append(
                {
                    "date": d,
                    "title": entry.summary.title if entry else "",
                    "synopsis": entry.summary.synopsis if entry else "",
                    "has_transcript": True,
                    "has_script": d in self.scripts,
                }
            )
        return out

    def read_episode(self, date: str) -> dict[str, Any]:
        """The chronicle entry of earlier episode `date`: {'date', 'title', 'synopsis',
        'key_beats', 'cliffhanger', 'characters_present', 'locations', 'factions', 'items',
        'season'
        (season title or '')}. Raises ValueError for an unavailable date or one with no entry."""
        self._permitted(date)
        entry = self.episodes.get(date)
        if entry is None:
            raise ValueError(f"no chronicle entry for {date!r} (read_transcript() still works)")
        s = entry.summary
        season = season_for(date, self.show, seasons_path=self.seasons_path)
        return {
            "date": date,
            "title": s.title,
            "synopsis": s.synopsis,
            "key_beats": list(s.key_beats),
            "cliffhanger": s.cliffhanger,
            "characters_present": list(s.characters_present),
            "locations": list(s.locations),
            "factions": list(s.factions),
            "items": list(s.items),
            "season": season.title if season else "",
        }

    # ── transcripts ──
    def read_transcript(self, date: str) -> str:
        """The full transcript of earlier session `date` (lines 'NNNNNN<TAB>Speaker: text').
        Raises ValueError for an unavailable date."""
        self._permitted(date)
        return self._transcript_text(date)

    def search_transcripts(self, pattern: str, regex: bool = False) -> list[dict[str, Any]]:
        """Case-insensitive search of the spoken text of every earlier session of this show,
        oldest first; regex=False matches `pattern` literally. Returns up to 200 [{'date',
        'line' (int), 'speaker', 'text'}]. Raises ValueError on an empty pattern or invalid
        regex."""
        return self._search_transcripts(self.dates, self._transcript_text, pattern, regex)

    # ── earlier episode scripts ──
    def read_script(self, date: str) -> str:
        """What the podcast hosts said in earlier episode `date`, as 'Name: text' lines.
        Raises ValueError for an unavailable date or one with no script."""
        self._permitted(date)
        if date not in self.scripts:
            raise ValueError(f"no episode script for {date!r}")
        return "\n".join(f"{name}: {text}" for name, text in self._script_turns(date))

    def search_scripts(self, pattern: str, regex: bool = False) -> list[dict[str, Any]]:
        """Case-insensitive search of what the hosts said in every earlier episode, oldest
        first; regex=False matches `pattern` literally. Returns up to 200 [{'date', 'speaker',
        'text'}]. Raises ValueError on an empty pattern or invalid regex."""
        match = text_matcher(pattern, regex)
        hits: list[dict[str, Any]] = []
        for date in self.dates:
            if date not in self.scripts:
                continue
            for name, text in self._script_turns(date):
                if match(text):
                    hits.append({"date": date, "speaker": name, "text": text})
                    if len(hits) >= MAX_RESULTS:
                        return hits
        return hits

    def tools(self) -> list[Callable[..., Any]]:
        """The bound tool callables, in §3 order."""
        return [
            self.list_pages,
            self.read_page,
            self.search_wiki,
            self.backlinks,
            self.resolve_name,
            self.list_episodes,
            self.read_episode,
            self.search_transcripts,
            self.read_transcript,
            self.search_scripts,
            self.read_script,
        ]
