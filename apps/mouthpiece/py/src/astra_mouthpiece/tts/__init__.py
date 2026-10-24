"""Stage 4 — TTS: script → audio clips (ElevenLabs / mock).

ElevenLabs (`mouthpiece.tts-provider`, the only live backend) renders runs of turns as
pre-paced Text-to-Dialogue clips with the pronunciation IPA wrap + tag pass-through
(M6). It is paid; CI uses the offline `MockTTSProvider`.
"""

from __future__ import annotations

from .dialogue import DEFAULT_DIALOGUE_BUDGET, chunk_turns
from .mock import MockTTSProvider
from .pronunciation import Lexicon, apply_pronunciations, load_lexicon
from .provider import (
    DialogueInput,
    DialogueRequest,
    SynthesisRequest,
    SynthesisResult,
    TTSProvider,
)
from .synth import DEFAULT_VOICES, synthesize_script
from .tags import render_delivery, strip_audio_tags

__all__ = [
    "DEFAULT_DIALOGUE_BUDGET",
    "DEFAULT_VOICES",
    "DialogueInput",
    "DialogueRequest",
    "Lexicon",
    "MockTTSProvider",
    "SynthesisRequest",
    "SynthesisResult",
    "TTSProvider",
    "apply_pronunciations",
    "chunk_turns",
    "load_lexicon",
    "render_delivery",
    "strip_audio_tags",
    "synthesize_script",
]
