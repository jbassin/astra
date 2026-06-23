"""The cross-episode catalog — `episodes_index` (D1, plan 0012).

mouthpiece-backend's per-session graph writes a flat tree under
``episodes_path/<session_id>/`` (script.json, digest.json, ``<id>.episode.mp3``,
``<id>.transcript.md``) but emits **no cross-episode index**. mouthpiece-frontend
(0012) needs one to build its grid + episode pages, so this asset globs the
session dirs and writes a single sorted **``episodes-index.json``** manifest.

This is the producer half of the producer/consumer split (spec 0012, D6): the
**backend owns** what it is authoritative for — id-parse, the sort
(``date_sort_key``, already here in :mod:`mega`), the per-arc episode numbering,
the arc display title (from ontology-being ``campaign.name`` — Python is the
ontology truth), the audio duration (``ffprobe`` over the seeded mp3s, D5) and
the cache-bust token. The **frontend** ports only the display-shaping helpers it
still needs (``stripAudioTags`` over turn text, ``stripCampaignPrefix``).

Ported faithfully from faerrin ``pkg/face/src/lib/episodes.ts`` (``parseId``,
``dateKey``, ``stripCampaignPrefix``, ``stripAudioTags``, the arc/episode
numbering and the arc-then-date sort). Two deliberate, documented refinements
over face (not silent cuts):

* **Episode numbering** ranks the *materialized* sessions in ``episodes_path``
  (face ranks every transcript in the corpus, rendered or not). They agree when
  an arc is fully rendered — the realistic case for the seeded corpus and the
  live pipeline; the asset has no need to reach into linguist's transcript dir.
* **Sort tiebreak.** face leaves equal-``dateKey`` ties (a recap shares its
  ``lastDate`` with that day's regular session) to filesystem ``readdir`` order
  — non-deterministic. We make the recap (the capstone) sort *after* a same-key
  regular session, realizing face's stated "sorts to the END of its arc" intent
  deterministically.
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from .mega import date_sort_key

EPISODE_SUFFIX = ".episode.mp3"
TRANSCRIPT_SUFFIX = ".transcript.md"
INDEX_FILENAME = "episodes-index.json"

#: A recap/mega id embeds this marker (``…<lastDate>-recap-of-<firstDate>``).
_RECAP_MARKER = "-recap-of-"

#: Inline ElevenLabs v3 audio tag, e.g. "[laughs]" — ported from caster `tags.ts`.
_TAG_RE = re.compile(r"\[[^\][]*\]")
_PUNCT_SPACE_RE = re.compile(r"\s+([,.!?;:])")
_MULTI_SPACE_RE = re.compile(r"\s{2,}")


# ── pure helpers (ported 1:1 from face `episodes.ts`) ────────────────────────


def strip_audio_tags(text: str) -> str:
    """Remove inline v3 audio tags + tidy the whitespace (port of `stripAudioTags`).

    "[warm] Hey — [laughs] big week." → "Hey — big week."
    """
    out = _TAG_RE.sub(" ", text)
    out = _PUNCT_SPACE_RE.sub(r"\1", out)
    out = _MULTI_SPACE_RE.sub(" ", out)
    return out.strip()


def parse_id(session_id: str) -> tuple[int, str, str]:
    """Split "NNN.arc-slug.YYYY-M-D" → (arc_no, slug, date) (port of `parseId`).

    The slug may not contain dots; the date is the final dotted segment (for a
    recap that final segment is the whole "<lastDate>-recap-of-<firstDate>" token).
    """
    parts = session_id.split(".")
    arc_part = parts[0] if parts else ""
    arc_no = int(arc_part) if arc_part.lstrip("-").isdigit() else 0
    date = parts[-1] if parts else ""
    slug = ".".join(parts[1:-1]) if len(parts) > 2 else ""
    return arc_no, slug, date


def is_recap(session_id: str) -> bool:
    """Whether this is a mega/recap capstone (no own linguist transcript)."""
    return _RECAP_MARKER in session_id


def episode_title(title: str, arc_title: str) -> str:
    """Strip a leading "<ArcTitle> — " campaign prefix (port of `stripCampaignPrefix`).

    Tolerant of em/en dash, colon, or hyphen separators; falls back to the full
    title when there is no such prefix.
    """
    t = title.strip()
    if not arc_title:
        return t
    if t.lower().startswith(arc_title.lower()):
        rest = re.sub(r"^\s*[—–:-]\s*", "", t[len(arc_title) :]).strip()
        if rest:
            return rest
    return t


def build_episode_numbers(session_ids: list[str]) -> dict[str, int]:
    """session_id → 1-based episode number, ranked by date within each arc.

    Recaps get 0 (they are capstones, not numbered sessions — matches face's
    ``episodeNumbers.get(id) ?? 0`` for the synthetic id absent from the corpus).
    """
    by_arc: dict[str, list[tuple[int, str]]] = {}
    for sid in session_ids:
        if is_recap(sid):
            continue
        _, slug, date = parse_id(sid)
        by_arc.setdefault(slug, []).append((date_sort_key(date), sid))

    numbers: dict[str, int] = {}
    for entries in by_arc.values():
        for rank, (_, sid) in enumerate(sorted(entries), start=1):
            numbers[sid] = rank
    return {sid: numbers.get(sid, 0) for sid in session_ids}


# ── the manifest shape (camelCase on the wire for the TS consumer) ───────────


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class EpisodeHost(_CamelModel):
    """One host's display identity (voice ids stay TTS-only, not emitted)."""

    name: str
    persona: str


class EpisodeEntry(_CamelModel):
    """One episode's catalog row — everything the grid + episode page need."""

    id: str
    arc_no: int
    arc_slug: str
    arc_title: str
    episode_no: int
    is_main: bool
    date: str
    date_sort_key: int
    title: str
    episode_title: str
    hosts: dict[str, EpisodeHost]
    synopsis: str
    duration_ms: int
    has_audio: bool
    has_transcript: bool
    #: Cache-bust token for `mp3Url` (`size36-mtime36`); "" when no mp3 on disk.
    audio_version: str


class EpisodesIndex(_CamelModel):
    """The whole catalog: episodes sorted arc-then-date (recaps as arc capstones)."""

    episodes: list[EpisodeEntry]


# ── pure assembly ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class SessionInput:
    """One discovered session's facts (the impure shell gathers these from disk)."""

    id: str
    title: str
    synopsis: str
    duration_ms: int
    has_audio: bool
    has_transcript: bool
    audio_version: str


def build_index(
    sessions: list[SessionInput],
    *,
    arc_titles: dict[str, str],
    arc_main: dict[str, bool],
    hosts: dict[str, EpisodeHost],
) -> EpisodesIndex:
    """Assemble + sort the catalog (pure — the unit under test).

    `arc_titles`/`arc_main` map an arc slug → its ontology-being `campaign.name`
    / `campaign.main`; `hosts` is the A/B/C persona block (same for every episode,
    carried from ontology-being). Sort: arc asc, then date asc, then the recap
    capstone last within a tie.
    """
    numbers = build_episode_numbers([s.id for s in sessions])
    entries: list[EpisodeEntry] = []
    for s in sessions:
        arc_no, slug, date = parse_id(s.id)
        arc_title = arc_titles.get(slug, slug)
        entries.append(
            EpisodeEntry(
                id=s.id,
                arc_no=arc_no,
                arc_slug=slug,
                arc_title=arc_title,
                episode_no=numbers[s.id],
                is_main=arc_main.get(slug, arc_no < 100),
                date=date,
                date_sort_key=date_sort_key(date),
                title=s.title,
                episode_title=episode_title(s.title, arc_title),
                hosts=hosts,
                synopsis=strip_audio_tags(s.synopsis),
                duration_ms=s.duration_ms,
                has_audio=s.has_audio,
                has_transcript=s.has_transcript,
                audio_version=s.audio_version,
            )
        )
    entries.sort(key=lambda e: (e.arc_no, e.date_sort_key, is_recap(e.id)))
    return EpisodesIndex(episodes=entries)


# ── impure shell: read disk → SessionInput ───────────────────────────────────


def _read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _audio_version(mp3: Path) -> str:
    """`size36-mtime36` cache-bust token (face's `audioVersion`); "" if absent."""
    try:
        st = mp3.stat()
    except OSError:
        return ""
    return f"{format(st.st_size, 'x')}-{format(int(st.st_mtime), 'x')}"


def _probe_duration_ms(mp3: Path) -> int:
    """Exact mp3 length via ffprobe; 0 if ffprobe is missing/failed or no file."""
    if not mp3.is_file():
        return 0
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(mp3)],
            capture_output=True,
            text=True,
            check=True,
        )
        seconds = float(json.loads(out.stdout).get("format", {}).get("duration", 0))
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError, ValueError):
        return 0
    return round(seconds * 1000) if seconds > 0 else 0


def discover_sessions(out_root: Path) -> list[SessionInput]:
    """Glob `out_root/<id>/script.json` → SessionInput (skip a script-less dir).

    `title`/`synopsis` are read by their format-stable keys (faerrin camelCase and
    astra snake_case both use `title`/`synopsis`), so no model parsing is needed.
    """
    sessions: list[SessionInput] = []
    for script_path in sorted(out_root.glob("*/script.json")):
        sid = script_path.parent.name
        script = _read_json(script_path)
        if script is None or not isinstance(script.get("title"), str):
            continue
        digest = _read_json(script_path.parent / "digest.json") or {}
        synopsis = digest.get("synopsis")
        mp3 = script_path.parent / f"{sid}{EPISODE_SUFFIX}"
        transcript = script_path.parent / f"{sid}{TRANSCRIPT_SUFFIX}"
        sessions.append(
            SessionInput(
                id=sid,
                title=script["title"],
                synopsis=synopsis if isinstance(synopsis, str) else "",
                duration_ms=_probe_duration_ms(mp3),
                has_audio=mp3.is_file(),
                has_transcript=transcript.is_file(),
                audio_version=_audio_version(mp3),
            )
        )
    return sessions
