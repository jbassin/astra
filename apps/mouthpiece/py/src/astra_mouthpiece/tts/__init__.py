"""Stage 4 — TTS: script → audio clips (Cartesia Sonic-3 / ElevenLabs v3 / Edge / mock).

Cartesia (the live backend since 2026-09, `mouthpiece.tts-provider`) renders one clip
per turn, translating the script's delivery tags into Sonic-3 controls (cartesia.py).
The dialogue-capable ElevenLabs v3 path renders runs of turns as pre-paced clips with
the pronunciation IPA wrap + tag pass-through (M6). CI uses the offline
`MockTTSProvider` — both live backends are paid.
"""

from __future__ import annotations

from .cartesia import CartesiaTTSProvider, render_for_cartesia
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
    "CartesiaTTSProvider",
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
    "render_for_cartesia",
    "strip_audio_tags",
    "synthesize_script",
]
