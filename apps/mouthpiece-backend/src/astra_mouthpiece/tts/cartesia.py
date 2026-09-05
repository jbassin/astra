"""Cartesia Sonic-3 TTS provider (`/tts/bytes`, one clip per turn) — the live backend
since 2026-09, replacing ElevenLabs v3 Text-to-Dialogue.

Cartesia has no multi-speaker dialogue endpoint, so this provider is `dialogue = False`
and the orchestrator renders one clip per turn ("turns" mode: jittered inter-turn gaps +
per-clip fades in assemble.py). The script's inline delivery tags (the `[happy]` /
`[short pause]` vocabulary Pass B writes) are translated here, not passed through:
pauses become Cartesia `<break time="…"/>` SSML, the first direction tag (or the turn's
legacy `emotion`) becomes `generation_config.emotion` when it maps onto Cartesia's
emotion enum, and everything else is stripped so a bracket is never read aloud.

The HTTP seam is injectable (`post`) so request-building is unit-testable without a
network; the default `post` uses httpx. The live call is paid, so CI never exercises it.
"""

from __future__ import annotations

import re
import time
from collections.abc import Callable
from typing import Any

from astra_observe import get_meter

from .mock import estimate_duration_ms
from .provider import SynthesisRequest, SynthesisResult

_tts_duration = get_meter("astra.mouthpiece").create_histogram(
    "astra.mouthpiece.tts.cartesia.duration_ms",
    unit="ms",
    description="Cartesia TTS HTTP round-trip",
)

_BYTES_URL = "https://api.cartesia.ai/tts/bytes"
#: The Cartesia API version header (a date; pinned so a server-side default bump can't
#: silently change request semantics under us).
CARTESIA_VERSION = "2026-08-14"
_MODEL_ID = "sonic-3"
#: mp3 to match the ElevenLabs clips assemble.py already handles (fade/concat/loudnorm).
OUTPUT_FORMAT: dict[str, Any] = {"container": "mp3", "sample_rate": 44100, "bit_rate": 128000}

#: Cartesia's `generation_config.emotion` enum (Sonic-3 docs, volume-speed-emotion).
CARTESIA_EMOTIONS: frozenset[str] = frozenset(
    {
        "neutral", "happy", "excited", "enthusiastic", "elated", "euphoric", "triumphant",
        "amazed", "surprised", "flirtatious", "curious", "content", "peaceful", "serene",
        "calm", "grateful", "affectionate", "trust", "sympathetic", "anticipation",
        "mysterious", "angry", "mad", "outraged", "frustrated", "agitated", "threatened",
        "disgusted", "contempt", "envious", "sarcastic", "ironic", "sad", "dejected",
        "melancholic", "disappointed", "hurt", "guilty", "bored", "tired", "rejected",
        "nostalgic", "wistful", "apologetic", "hesitant", "insecure", "confused", "resigned",
        "anxious", "panicked", "alarmed", "scared", "proud", "confident", "distant",
        "skeptical", "contemplative", "determined",
    }
)  # fmt: skip

#: Script delivery-tag → Cartesia emotion, for the tags that aren't already enum members.
_EMOTION_ALIASES: dict[str, str] = {
    "annoyed": "frustrated",
    "thoughtful": "contemplative",
    "deadpan": "neutral",
    "dry": "neutral",
    "serious": "neutral",
    "amused": "happy",
    "delighted": "happy",
    "gleeful": "elated",
    "warm": "content",
    "warmly": "content",
    "fond": "affectionate",
    "fondly": "affectionate",
    "teasing": "flirtatious",
    "wry": "ironic",
    "doubtful": "skeptical",
    "unsure": "hesitant",
    "grim": "sad",
    "impressed": "amazed",
    "eager": "enthusiastic",
    "wistfully": "wistful",
    "sheepish": "apologetic",
}

#: Pause tags → break length. Cartesia warns against consecutive breaks, so runs collapse.
_PAUSE_MS: dict[str, int] = {"short pause": 300, "pause": 500, "long pause": 800, "beat": 300}

_TAG = re.compile(r"\[([^\][]*)\]")
_PUNCT_AFTER = re.compile(r"(?<=\w)\s+([,.!?;:])")  # never glue punctuation onto a <break/>
_MULTI_WS = re.compile(r"[ \t]{2,}")
_CONSECUTIVE_BREAKS = re.compile(r'(<break time="\d+ms"/>)(?:\s*<break time="\d+ms"/>)+')


def emotion_for(tag: str) -> str | None:
    """Map one delivery tag (or legacy `emotion`) onto Cartesia's enum, else None."""
    key = tag.strip().lower()
    key = _EMOTION_ALIASES.get(key, key)
    return key if key in CARTESIA_EMOTIONS else None


def render_for_cartesia(text: str, emotion: str | None = None) -> tuple[str, str | None]:
    """Translate a turn's inline delivery tags for Sonic-3.

    Returns `(transcript, emotion)`: pauses → `<break/>` SSML; the first direction tag
    (or the legacy `emotion` if given) → the request emotion when it maps onto the
    enum; all other bracketed tags dropped (Cartesia would read them aloud).
    """
    chosen: str | None = emotion_for(emotion) if emotion else None

    def sub(m: re.Match[str]) -> str:
        nonlocal chosen
        tag = m.group(1).strip().lower()
        if tag in _PAUSE_MS:
            return f' <break time="{_PAUSE_MS[tag]}ms"/> '
        mapped = emotion_for(tag)
        if mapped is not None and chosen is None:
            chosen = mapped
        return " "

    out = _TAG.sub(sub, text)
    out = _CONSECUTIVE_BREAKS.sub(r"\1", out)
    out = _PUNCT_AFTER.sub(r"\1", out)
    out = _MULTI_WS.sub(" ", out).strip()
    return out, chosen


#: A `post(url, headers, json) -> bytes` seam; the default calls httpx.
PostFn = Callable[[str, dict[str, str], dict[str, Any]], bytes]


def _httpx_post(url: str, headers: dict[str, str], json: dict[str, Any]) -> bytes:
    import httpx

    started = time.perf_counter()
    try:
        resp = httpx.post(url, headers=headers, json=json, timeout=120.0)
        resp.raise_for_status()
        return resp.content
    finally:
        _tts_duration.record((time.perf_counter() - started) * 1000.0)


class CartesiaTTSProvider:
    """Sonic-3 `/tts/bytes`, one request per turn (no dialogue endpoint exists)."""

    format = "mp3"
    dialogue = False

    def __init__(
        self,
        api_key: str,
        *,
        post: PostFn = _httpx_post,
        model_id: str = _MODEL_ID,
        version: str = CARTESIA_VERSION,
        language: str = "en",
    ) -> None:
        self._key = api_key
        self._post = post
        self._model_id = model_id
        self._version = version
        self._language = language

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._key}",
            "Cartesia-Version": self._version,
            "Content-Type": "application/json",
        }

    def build_body(self, req: SynthesisRequest) -> dict[str, Any]:
        """The `/tts/bytes` request body for one turn (pure; unit-tested)."""
        transcript, emotion = render_for_cartesia(req.text, req.emotion)
        body: dict[str, Any] = {
            "model_id": self._model_id,
            "transcript": transcript,
            "voice": {"mode": "id", "id": req.voice},
            "output_format": dict(OUTPUT_FORMAT),
            "language": self._language,
        }
        if emotion is not None:
            body["generation_config"] = {"emotion": emotion}
        return body

    def synthesize(self, req: SynthesisRequest) -> SynthesisResult:
        body = self.build_body(req)
        audio = self._post(_BYTES_URL, self._headers(), body)
        spoken = re.sub(r"<[^>]+>", " ", body["transcript"])
        return SynthesisResult(audio=audio, duration_ms=estimate_duration_ms(spoken))
