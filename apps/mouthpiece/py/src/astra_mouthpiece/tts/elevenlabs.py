"""ElevenLabs Text-to-Dialogue provider (needs the network, so CI never calls it).

The model is `mouthpiece.elevenlabs-model` (eleven_v4 since 2026-09-28).
The credential resolves via `astra_config` (verified), but the live dialogue
call is paid/tier-gated, so it is NOT exercised in CI (hermetic, M11). The HTTP
seam is injectable (`post`) so the request-building is unit-testable without a
network; the default `post` uses httpx. mock is the offline fallback.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Mapping
from typing import Any

from astra_observe import get_meter

from .dialogue import DEFAULT_DIALOGUE_BUDGET
from .mock import estimate_duration_ms
from .provider import DialogueRequest, SynthesisRequest, SynthesisResult, TtsClientError
from .tags import strip_audio_tags

# The TTS HTTP round-trip is the dominant cost of the audio stage; time it (success or
# failure). No-op until init_telemetry runs; in unit tests the `post` seam is stubbed so
# this never fires.
_tts_duration = get_meter("astra.mouthpiece").create_histogram(
    "astra.mouthpiece.tts.duration_ms", unit="ms", description="ElevenLabs TTS HTTP round-trip"
)

#: Default ElevenLabs voice ids (overridden by ontology-being voice ids).
DEFAULT_ELEVENLABS_VOICES = {"a": "", "b": "", "c": ""}
_DIALOGUE_URL = "https://api.elevenlabs.io/v1/text-to-dialogue"
_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
_MODEL_ID = "eleven_v4"

#: Per-model dialogue chunk budget (rendered chars per request). v3 is capped ~2,000
#: chars. v4 takes 10,000 (probed 2026-09-28: 8,955 chars → 200, 9.3 min audio), and
#: ran at 9,000 briefly, but the stakeholder chose the v3-sized chunks for v4 too
#: (2026-09-28). Unknown models get the same conservative budget.
_DIALOGUE_BUDGETS = {
    "eleven_v3": DEFAULT_DIALOGUE_BUDGET,
    "eleven_v4": DEFAULT_DIALOGUE_BUDGET,
}

#: The API takes up to 3 `previous_request_ids`; the orchestrator sends 1 (the chunk just
#: before), and this caps anything longer to the newest 3.
_MAX_PREVIOUS_IDS = 3

#: HTTP timeout. A 9k-char v4 chunk took 146 s to render (the old 120 s would have timed
#: out, and the RetryPolicy would have re-billed the chunk). Kept generous so a larger
#: v4 budget stays safe to turn back on.
_TIMEOUT_S = 600.0

#: A `post(url, headers, json) -> (body, response headers)` seam; the default calls httpx.
PostFn = Callable[[str, dict[str, str], dict[str, Any]], tuple[bytes, Mapping[str, str]]]

#: The response header that carries a render's ID (for `previous_request_ids`).
_REQUEST_ID_HEADER = "request-id"


def _httpx_post(
    url: str, headers: dict[str, str], json: dict[str, Any]
) -> tuple[bytes, Mapping[str, str]]:
    import httpx

    started = time.perf_counter()
    try:
        resp = httpx.post(url, headers=headers, json=json, timeout=_TIMEOUT_S)
        if 400 <= resp.status_code < 500:
            raise TtsClientError(resp.status_code, url, resp.text)
        resp.raise_for_status()
        return resp.content, resp.headers
    finally:
        _tts_duration.record((time.perf_counter() - started) * 1000.0)


def _request_id(headers: Mapping[str, str]) -> str | None:
    """The render's ID from the response headers (matched case-insensitively), if any."""
    for name, value in headers.items():
        if name.lower() == _REQUEST_ID_HEADER and value:
            return value
    return None


class ElevenLabsTTSProvider:
    """Text-to-Dialogue (multi-turn) provider. `synthesize_dialogue` is the
    primary path; `synthesize` covers the single-turn fallback."""

    format = "mp3"
    dialogue = True

    def __init__(
        self,
        api_key: str,
        *,
        post: PostFn = _httpx_post,
        model_id: str = _MODEL_ID,
        stability: float | None = None,
    ) -> None:
        self._key = api_key
        self._post = post
        self._model_id = model_id
        #: Voice stability (0-1, `mouthpiece.elevenlabs-stability`). None sends no settings,
        #: so the API's default (0.5) applies.
        self._stability = stability
        self.dialogue_budget = _DIALOGUE_BUDGETS.get(model_id, DEFAULT_DIALOGUE_BUDGET)
        #: Names the clip cache's entries (`synth.clip_key`): everything besides the voice
        #: and text that changes the audio. The requests send no `output_format`, so the
        #: API's default applies; add any other setting you start sending here.
        identity = f"elevenlabs:{model_id}:{self.format}"
        if stability is not None:
            identity += f":stability={stability:g}"
        self.cache_identity = identity

    def _headers(self) -> dict[str, str]:
        return {"xi-api-key": self._key, "Content-Type": "application/json"}

    def synthesize(self, req: SynthesisRequest) -> SynthesisResult:
        body: dict[str, Any] = {"text": req.text, "model_id": self._model_id}
        if self._stability is not None:
            body["voice_settings"] = {"stability": self._stability}
        audio, headers = self._post(f"{_TTS_URL}/{req.voice}", self._headers(), body)
        return SynthesisResult(
            audio=audio,
            duration_ms=estimate_duration_ms(strip_audio_tags(req.text)),
            request_id=_request_id(headers),
        )

    def synthesize_dialogue(self, req: DialogueRequest) -> SynthesisResult:
        body: dict[str, Any] = {
            "model_id": self._model_id,
            "inputs": [{"text": i.text, "voice_id": i.voice} for i in req.inputs],
        }
        if self._stability is not None:
            body["settings"] = {"stability": self._stability}
        if req.previous_request_ids:
            body["previous_request_ids"] = req.previous_request_ids[-_MAX_PREVIOUS_IDS:]
        try:
            audio, headers = self._post(_DIALOGUE_URL, self._headers(), body)
        except TtsClientError:
            # The link is best-effort: a stored ID can be days old, and a rejected one must
            # not fail the episode. Retry once unlinked; a 4xx that persists raises as before.
            if "previous_request_ids" not in body:
                raise
            del body["previous_request_ids"]
            audio, headers = self._post(_DIALOGUE_URL, self._headers(), body)
        spoken = " ".join(strip_audio_tags(i.text) for i in req.inputs)
        return SynthesisResult(
            audio=audio, duration_ms=estimate_duration_ms(spoken), request_id=_request_id(headers)
        )
