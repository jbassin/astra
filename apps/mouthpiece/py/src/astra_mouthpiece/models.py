"""Pydantic models — the caster pipeline contracts (ported from caster `types.ts`).

Typed I/O comes from these models, NOT dspy signatures: clean+enrich
returns a `SessionDigest`, the two-pass script returns a `Script`.
"""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any, Literal, get_args

from astra_ontology.sessions import EpisodeKind, SessionOverrides
from pydantic import BaseModel, model_validator

#: A capstone's id embeds this marker (``…<lastDate>-recap-of-<firstDate>``). Before
#: ``kind`` was stored, the marker was the only sign of a non-session episode.
RECAP_MARKER = "-recap-of-"


def kind_from_id(session_id: str) -> EpisodeKind:
    """The kind an episode file without a ``kind`` field has: ``recap`` for a recap-form
    id, else ``session``. Files written before episode kinds were stored carry no ``kind``."""
    return "recap" if RECAP_MARKER in session_id else "session"


def stored_kind(
    raw: Mapping[str, Any], session_id: str, overrides: SessionOverrides | None = None
) -> EpisodeKind:
    """An episode's kind: the `sessions.kdl` ``kind`` for its id if ``overrides`` has one,
    else the ``kind`` of its raw script or digest dict, else `kind_from_id`."""
    entry = overrides.for_episode(session_id) if overrides is not None else None
    if entry is not None and entry.kind is not None:
        return entry.kind
    kind = raw.get("kind")
    for known in get_args(EpisodeKind):
        if kind == known:
            return known
    return kind_from_id(session_id)


def _fill_kind(data: Any) -> Any:
    """``mode="before"`` hook: give an old file (no ``kind``) its `kind_from_id`."""
    if isinstance(data, dict) and "kind" not in data:
        sid = data.get("session_id")
        if isinstance(sid, str):
            return {**data, "kind": kind_from_id(sid)}
    return data


#: Which host is speaking. A=Recapper (Bram), B=the grounded foil (Maeve), C=the
#: newcomer (Nell, since 2026-09; on pre-2026-06 episodes "C" was the retired Pip).
SpeakerId = Literal["A", "B", "C"]


class DroppedRange(BaseModel):
    """One inclusive line-id span the Stage-2 filter dropped — the human-reviewable
    audit trail."""

    range: tuple[int, int]
    category: str


class DigestStats(BaseModel):
    """Coverage stats for one session's filter pass (mirrors the filter span's attributes)."""

    lines: int
    kept_lines: int
    windows: int
    dropped_windows: int
    #: Whisper silence-hallucination lines dropped deterministically pre-windowing
    #: (default 0 so pre-existing new-schema digests still parse).
    hallucination_lines: int = 0


class SessionDigest(BaseModel):
    """The clean+enrich artifact for one session (replaces beats/discarded).

    The cleaned transcript itself is NOT stored — Stage 3 re-derives it from the
    canonical transcript + `kept_ranges` (single source of truth; auditable; keeps
    the artifact small). The only externally consumed key is the top-level
    `synopsis` string (`episodes_index.py` reads old- and new-schema digests
    identically — historical episodes keep their old digests forever)."""

    session_id: str
    synopsis: str
    #: An older file without this field gets `kind_from_id`.
    kind: EpisodeKind = "session"
    wiki_refs: list[str] = []
    kept_ranges: list[tuple[int, int]] = []
    dropped: list[DroppedRange] = []
    #: The clean pass's coverage. A ``session`` digest must have it; a recap or special
    #: had no clean pass, so its digest is just ``session_id``, ``synopsis`` and ``kind``.
    stats: DigestStats | None = None

    @model_validator(mode="before")
    @classmethod
    def default_kind(cls, data: Any) -> Any:
        return _fill_kind(data)

    @model_validator(mode="after")
    def session_has_stats(self) -> SessionDigest:
        if self.kind == "session" and self.stats is None:
            raise ValueError("a session digest needs stats")
        return self

    def session_stats(self) -> DigestStats:
        """`stats`, which a ``session`` digest always has (the validator ensures it)."""
        if self.stats is None:
            raise ValueError(f"digest {self.session_id!r} ({self.kind}) has no clean stats")
        return self.stats


class ScriptTurn(BaseModel):
    """One line of host dialogue. Speaker A/B/C map to TTS voices in Stage 4."""

    speaker: SpeakerId
    text: str
    #: Legacy one-word delivery hint; superseded by inline v3 tags in `text`.
    emotion: str | None = None


class HostPersona(BaseModel):
    """One host's identity for the script. Speaker A/B/C resolve to these."""

    name: str
    #: One-line persona used in the (static, cacheable) system prompt.
    persona: str
    #: ElevenLabs voice id — carried from ontology-being.
    voice_id: str = ""


class HostConfig(BaseModel):
    """The podcast hosts read from ontology-being. The current roster is three
    (A=Bram, B=Maeve, C=Nell). `c` stays optional because the episodes rendered between
    the 2026-06 two-host change and the 2026-09 newcomer seat store `c=None` (and the
    pre-2026-06 ones store Pip there)."""

    a: HostPersona
    b: HostPersona
    c: HostPersona | None = None

    def by_id(self, speaker: SpeakerId) -> HostPersona:
        host = {"A": self.a, "B": self.b, "C": self.c}.get(speaker)
        if host is None:
            raise KeyError(f"no host configured for speaker {speaker!r}")
        return host

    def voice_of(self, speaker: SpeakerId) -> str:
        return self.by_id(speaker).voice_id


class Script(BaseModel):
    """A podcast script for one session (three hosts; legacy episodes carry two)."""

    session_id: str
    title: str
    #: An older file without this field gets `kind_from_id`.
    kind: EpisodeKind = "session"
    hosts: HostConfig
    turns: list[ScriptTurn]

    @model_validator(mode="before")
    @classmethod
    def default_kind(cls, data: Any) -> Any:
        return _fill_kind(data)


class GroundingEntry(BaseModel):
    """A wiki/akasha page matched to one or more of a digest's wikiRefs."""

    refs: list[str]
    title: str
    path: str
    text: str


# ── Stage 4/5: TTS + assembly ────────────────────────────────────────────────


class VoiceConfig(BaseModel):
    """Provider voice ids for the hosts (speaker A/B/C; C absent on two-host scripts)."""

    a: str
    b: str
    c: str | None = None

    def by_id(self, speaker: SpeakerId) -> str:
        voice = {"A": self.a, "B": self.b, "C": self.c}.get(speaker)
        if voice is None:
            raise KeyError(f"no voice configured for speaker {speaker!r}")
        return voice


class TtsClip(BaseModel):
    """One synthesized audio clip (a turn, or a dialogue chunk)."""

    index: int
    speaker: SpeakerId
    #: Relative to the session dir (``clips/<key>.<fmt>``). Manifests written before
    #: 2026-10-26 hold absolute paths; `resolve` reads both.
    path: str
    duration_ms: int

    def resolve(self, session_dir: Path | str) -> Path:
        """The clip's file: ``path`` under ``session_dir``, or ``path`` itself when absolute."""
        return Path(session_dir) / self.path


class AudioManifest(BaseModel):
    """The audio output for one session: ordered clips + metadata for assembly."""

    session_id: str
    #: "turns" (jittered per-turn silence) or "dialogue" (pre-paced chunks).
    mode: Literal["turns", "dialogue"] = "turns"
    format: str
    voices: VoiceConfig
    clips: list[TtsClip]
