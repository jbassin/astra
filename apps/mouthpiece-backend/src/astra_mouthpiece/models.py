"""Pydantic models — the caster pipeline contracts (ported from caster `types.ts`).

Typed I/O comes from these models, NOT dspy signatures (H1): clean+enrich (0024 §3)
returns a `SessionDigest`, the two-pass script returns a `Script`.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

#: Which host is speaking. A=Recapper (Bram), B=the grounded foil (Maeve). "C" is a
#: retired third host (Pip) kept only so the pre-2026-06 three-host episodes still parse.
SpeakerId = Literal["A", "B", "C"]


class DroppedRange(BaseModel):
    """One inclusive line-id span the Stage-2 filter dropped — the human-reviewable
    audit trail (0024 §3.3)."""

    range: tuple[int, int]
    category: str


class DigestStats(BaseModel):
    """Coverage stats for one session's filter pass (mirrors the §8 span attrs)."""

    lines: int
    kept_lines: int
    windows: int
    dropped_windows: int
    #: Whisper silence-hallucination lines dropped deterministically pre-windowing
    #: (default 0 so pre-existing new-schema digests still parse).
    hallucination_lines: int = 0


class SessionDigest(BaseModel):
    """The clean+enrich artifact for one session (0024 §3.3 — replaces beats/discarded).

    The cleaned transcript itself is NOT stored — Stage 3 re-derives it from the
    canonical transcript + `kept_ranges` (single source of truth; auditable; keeps
    the artifact small). The only externally consumed key is the top-level
    `synopsis` string (`episodes_index.py` reads old- and new-schema digests
    identically — historical episodes keep their old digests forever)."""

    session_id: str
    synopsis: str
    wiki_refs: list[str] = []
    kept_ranges: list[tuple[int, int]] = []
    dropped: list[DroppedRange] = []
    stats: DigestStats


class ScriptTurn(BaseModel):
    """One line of host dialogue. Speaker A/B/C map to TTS voices in Stage 4."""

    speaker: SpeakerId
    text: str
    #: Legacy one-word delivery hint; superseded by inline v3 tags in `text`.
    emotion: str | None = None


class HostPersona(BaseModel):
    """One host's identity for the script. Speaker A/B (and legacy C) resolve to these."""

    name: str
    #: One-line persona used in the (static, cacheable) system prompt.
    persona: str
    #: Provider voice id (ElevenLabs) — carried from ontology-being.
    voice_id: str = ""


class HostConfig(BaseModel):
    """The podcast hosts read from ontology-being. The current roster is two
    (A=Bram, B=Maeve); `c` is an optional retired third host (Pip), present only on the
    legacy three-host episodes recorded before the 2026-06 two-host change."""

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
    """A two-host podcast script for one session (legacy episodes carry a third)."""

    session_id: str
    title: str
    hosts: HostConfig
    turns: list[ScriptTurn]


class GroundingEntry(BaseModel):
    """A wiki/akasha page matched to one or more of a digest's wikiRefs."""

    refs: list[str]
    title: str
    path: str
    text: str


# ── Stage 4/5: TTS + assembly ────────────────────────────────────────────────


class VoiceConfig(BaseModel):
    """Provider voice ids for the hosts (speaker A/B, plus legacy C)."""

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
    path: str
    duration_ms: int


class AudioManifest(BaseModel):
    """The audio output for one session: ordered clips + metadata for assembly."""

    session_id: str
    #: "turns" (jittered per-turn silence) or "dialogue" (pre-paced chunks).
    mode: Literal["turns", "dialogue"] = "turns"
    format: str
    voices: VoiceConfig
    clips: list[TtsClip]
