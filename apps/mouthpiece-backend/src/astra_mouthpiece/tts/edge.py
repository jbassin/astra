"""Edge TTS provider (free, per-turn) — a network-deferred fallback (gate K).

Edge reads no v3 audio tags, so the orchestrator strips them before synthesis
(via `render_delivery(..., v3=False)`). The synth seam is injectable so the
request-building is testable; the default uses the `edge-tts` package if present.
"""

from __future__ import annotations

from collections.abc import Callable

from .mock import estimate_duration_ms
from .provider import SynthesisRequest, SynthesisResult
from .tags import strip_audio_tags

#: Default Edge neural voices for the three hosts.
DEFAULT_EDGE_VOICES = {
    "a": "en-US-GuyNeural",
    "b": "en-US-JennyNeural",
    "c": "en-US-EricNeural",
}

#: A `synth(text, voice) -> mp3 bytes` seam; the default uses edge-tts.
SynthFn = Callable[[str, str], bytes]


def _edge_synth(text: str, voice: str) -> bytes:
    import asyncio

    import edge_tts  # ty: ignore[unresolved-import]  # optional runtime dep

    async def run() -> bytes:
        chunks: list[bytes] = []
        async for chunk in edge_tts.Communicate(text, voice).stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)

    return asyncio.run(run())


class EdgeTTSProvider:
    """Free per-turn TTS via Microsoft Edge neural voices (tags stripped)."""

    format = "mp3"
    dialogue = False

    def __init__(self, *, synth: SynthFn = _edge_synth) -> None:
        self._synth = synth

    def synthesize(self, req: SynthesisRequest) -> SynthesisResult:
        spoken = strip_audio_tags(req.text)
        audio = self._synth(spoken, req.voice)
        return SynthesisResult(audio=audio, duration_ms=estimate_duration_ms(spoken))
