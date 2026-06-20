"""ElevenLabs v3 Text-to-Dialogue provider (network-deferred — gate K).

The credential resolves via `astra_config` (verified), but the live v3 dialogue
call is paid/tier-gated, so it is NOT exercised in CI (hermetic, M11). The HTTP
seam is injectable (`post`) so the request-building is unit-testable without a
network; the default `post` uses httpx. Edge/mock are the offline fallbacks.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .mock import estimate_duration_ms
from .provider import DialogueRequest, SynthesisRequest, SynthesisResult
from .tags import strip_audio_tags

#: Default ElevenLabs voice ids (overridden by ontology-being voice ids).
DEFAULT_ELEVENLABS_VOICES = {"a": "", "b": "", "c": ""}
_DIALOGUE_URL = "https://api.elevenlabs.io/v1/text-to-dialogue"
_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
_MODEL_ID = "eleven_v3"

#: A `post(url, headers, json) -> bytes` seam; the default calls httpx.
PostFn = Callable[[str, dict[str, str], dict[str, Any]], bytes]


def _httpx_post(url: str, headers: dict[str, str], json: dict[str, Any]) -> bytes:
    import httpx

    resp = httpx.post(url, headers=headers, json=json, timeout=120.0)
    resp.raise_for_status()
    return resp.content


class ElevenLabsTTSProvider:
    """v3 Text-to-Dialogue (multi-turn) provider. `synthesize_dialogue` is the
    primary path; `synthesize` covers the single-turn fallback."""

    format = "mp3"
    dialogue = True

    def __init__(
        self, api_key: str, *, post: PostFn = _httpx_post, model_id: str = _MODEL_ID
    ) -> None:
        self._key = api_key
        self._post = post
        self._model_id = model_id

    def _headers(self) -> dict[str, str]:
        return {"xi-api-key": self._key, "Content-Type": "application/json"}

    def synthesize(self, req: SynthesisRequest) -> SynthesisResult:
        body: dict[str, Any] = {"text": req.text, "model_id": self._model_id}
        audio = self._post(f"{_TTS_URL}/{req.voice}", self._headers(), body)
        return SynthesisResult(
            audio=audio, duration_ms=estimate_duration_ms(strip_audio_tags(req.text))
        )

    def synthesize_dialogue(self, req: DialogueRequest) -> SynthesisResult:
        body: dict[str, Any] = {
            "model_id": self._model_id,
            "inputs": [{"text": i.text, "voice_id": i.voice} for i in req.inputs],
        }
        audio = self._post(_DIALOGUE_URL, self._headers(), body)
        spoken = " ".join(strip_audio_tags(i.text) for i in req.inputs)
        return SynthesisResult(audio=audio, duration_ms=estimate_duration_ms(spoken))
