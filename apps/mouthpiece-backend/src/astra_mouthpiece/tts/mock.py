"""Offline mock TTS — ported from caster `tts/mock.ts`. The hermetic default.

Produces valid silent mono 16-bit PCM WAV clips whose length tracks the text, so
the rest of the pipeline (and assembly) runs end-to-end without a network/key.
"""

from __future__ import annotations

import struct

from .provider import SynthesisRequest, SynthesisResult
from .tags import strip_audio_tags

_SAMPLE_RATE = 8000  # mono 16-bit PCM


def estimate_duration_ms(text: str) -> int:
    """Rough spoken duration: ~165 wpm, floored so even short lines are audible."""
    words = len([w for w in text.strip().split() if w])
    return min(60_000, max(300, round((words / 165) * 60_000)))


def silent_wav(duration_ms: int) -> bytes:
    """Encode `duration_ms` of silence as a valid mono 16-bit PCM WAV."""
    samples = round(_SAMPLE_RATE * duration_ms / 1000)
    data_bytes = samples * 2
    header = b"".join(
        (
            b"RIFF",
            struct.pack("<I", 36 + data_bytes),
            b"WAVE",
            b"fmt ",
            struct.pack("<I", 16),  # PCM chunk size
            struct.pack("<H", 1),  # audio format = PCM
            struct.pack("<H", 1),  # channels = mono
            struct.pack("<I", _SAMPLE_RATE),
            struct.pack("<I", _SAMPLE_RATE * 2),  # byte rate
            struct.pack("<H", 2),  # block align
            struct.pack("<H", 16),  # bits per sample
            b"data",
            struct.pack("<I", data_bytes),
        )
    )
    return header + b"\x00" * data_bytes


class MockTTSProvider:
    """Deterministic, offline TTS provider for tests and dry runs."""

    format = "wav"
    dialogue = False

    def synthesize(self, req: SynthesisRequest) -> SynthesisResult:
        # Estimate from the spoken words only — inline v3 tags aren't read aloud.
        duration_ms = estimate_duration_ms(strip_audio_tags(req.text))
        return SynthesisResult(audio=silent_wav(duration_ms), duration_ms=duration_ms)
