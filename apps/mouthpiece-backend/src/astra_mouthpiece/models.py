"""Pydantic models — the caster pipeline contracts (ported from caster `types.ts`).

Typed I/O comes from these models, NOT dspy signatures (H1): distill returns a
`SessionDigest`, the two-pass script returns a `Script`. Enrichment fields on
`Beat` stay optional so older/mega digests still parse (M3).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

#: Which host is speaking. A=Recapper, B=Lorekeeper, C=Instigator (script prompt).
SpeakerId = Literal["A", "B", "C"]


class Beat(BaseModel):
    """One in-world story beat distilled from a session transcript."""

    order: int
    summary: str
    significance: str | None = None
    details: list[str] | None = None
    tone: str | None = None
    table_angle: str | None = None
    characters: list[str] = []
    locations: list[str] = []
    wiki_refs: list[str] = []


class SessionDigest(BaseModel):
    """The distilled output for one session: ordered beats plus discarded samples."""

    session_id: str
    synopsis: str
    beats: list[Beat]
    discarded: list[str] = []


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
    #: Provider voice id (ElevenLabs) — carried from ontology-being.
    voice_id: str = ""


class HostConfig(BaseModel):
    """The three hosts (A=Bram, B=Maeve, C=Pip) read from ontology-being."""

    a: HostPersona
    b: HostPersona
    c: HostPersona

    def by_id(self, speaker: SpeakerId) -> HostPersona:
        return {"A": self.a, "B": self.b, "C": self.c}[speaker]

    def voice_of(self, speaker: SpeakerId) -> str:
        return self.by_id(speaker).voice_id


class Script(BaseModel):
    """A three-host podcast script for one session."""

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


ThreadKind = Literal["joke", "bit", "grudge", "prediction", "character"]


class Thread(BaseModel):
    """A cross-session running thread (inside joke, grudge, prediction…)."""

    text: str
    kind: ThreadKind


# ── Stage 4/5: TTS + assembly ────────────────────────────────────────────────


class VoiceConfig(BaseModel):
    """Provider voice ids for the hosts (speaker A/B/C)."""

    a: str
    b: str
    c: str

    def by_id(self, speaker: SpeakerId) -> str:
        return {"A": self.a, "B": self.b, "C": self.c}[speaker]


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
