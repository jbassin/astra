"""The TTS backend protocol — ported from caster `tts/provider.ts` (M6).

Kept minimal so it's trivially mockable. A provider that sets `dialogue = True`
and implements `synthesize_dialogue` renders several turns at once with natural
turn-taking (ElevenLabs v3 Text-to-Dialogue); the orchestrator prefers it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass(slots=True)
class SynthesisRequest:
    """One synthesis request: speakable text + the voice + optional delivery."""

    text: str
    voice: str
    emotion: str | None = None


@dataclass(slots=True)
class SynthesisResult:
    audio: bytes
    duration_ms: int


@dataclass(slots=True)
class DialogueInput:
    """One speaker's line within a multi-turn dialogue request."""

    text: str
    voice: str


@dataclass(slots=True)
class DialogueRequest:
    inputs: list[DialogueInput]


@runtime_checkable
class TTSProvider(Protocol):
    """A text-to-speech backend. `format` is the audio file extension.

    A dialogue-capable backend additionally sets `dialogue = True` and implements
    ``synthesize_dialogue(req: DialogueRequest) -> SynthesisResult`` — duck-typed
    (not on the protocol) so single-clip providers like the mock stay assignable;
    the orchestrator reaches it via ``getattr`` when ``dialogue`` is True.
    """

    format: str
    #: True if this backend can synthesize multi-turn dialogue in one call.
    dialogue: bool

    def synthesize(self, req: SynthesisRequest) -> SynthesisResult: ...


@runtime_checkable
class DialogueTTSProvider(Protocol):
    """A dialogue-capable backend (`dialogue = True`) — the orchestrator casts to
    this to reach `synthesize_dialogue` once `dialogue` is confirmed at runtime."""

    format: str
    dialogue: bool

    def synthesize(self, req: SynthesisRequest) -> SynthesisResult: ...

    def synthesize_dialogue(self, req: DialogueRequest) -> SynthesisResult: ...
