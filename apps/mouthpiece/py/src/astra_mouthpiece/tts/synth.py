"""Stage 4 orchestration — synthesize a script to clips + a manifest (caster
`tts/index.ts`). Dialogue-capable backends (v3) render runs of turns as pre-paced
"dialogue" chunks (with the pronunciation IPA wrap); everything else falls back to
one clip per turn.

Clips are a cache keyed by content. Each clip is `<out_dir>/clips/<key>.<fmt>`, where
`<key>` hashes everything that changes the audio: the provider's `cache_identity` (its
backend, model and output settings), the render mode, the audio format, and each input's
voice, rendered text and delivery. A clip whose file already exists is reused, not rendered,
so a retry after a mid-render failure pays only for the clips that are missing, and a second
render of the same script pays for none. The manifest lists each clip as
`clips/<key>.<fmt>`, relative to `out_dir`. Next to each clip, `<key>.json` holds its
`duration_ms`. After a whole render succeeds, files in `clips/` that the new manifest does
not use are deleted; a failed render deletes nothing. Delete `clips/` to force fresh takes.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import cast

from astra_observe import get_meter
from astra_sessions import atomic_write_text, temp_sibling
from opentelemetry import trace
from opentelemetry.metrics import Counter

from ..models import AudioManifest, Script, ScriptTurn, TtsClip, VoiceConfig
from .dialogue import chunk_turns
from .mock import MockTTSProvider
from .pronunciation import Lexicon
from .pronunciation import apply_pronunciations as _apply
from .provider import (
    DialogueInput,
    DialogueRequest,
    DialogueTTSProvider,
    SynthesisRequest,
    SynthesisResult,
    TTSProvider,
)
from .tags import render_delivery, strip_audio_tags

_log = logging.getLogger("astra.mouthpiece.tts")

#: Placeholder voice ids for the mock provider; real providers override these.
DEFAULT_VOICES = VoiceConfig(a="mock-voice-a", b="mock-voice-b")

#: Part of every clip key; bump it when the key's inputs change shape, so old clips stop
#: matching.
CLIP_KEY_VERSION = 1


@dataclass(frozen=True, slots=True)
class _Instruments:
    #: Clips the provider rendered (paid), by render mode.
    clips: Counter
    #: Every clip in a manifest: reused from the clip cache (hit) or rendered (miss).
    cache: Counter
    #: Turns dropped because they carry no spoken words (an all-tag line like
    #: "[stunned silence]"). ElevenLabs Text-to-Dialogue 400s on an empty input.
    skipped: Counter


@cache
def _instruments() -> _Instruments:
    """The TTS counters, created on first use (no-ops until init_telemetry)."""
    meter = get_meter("astra.mouthpiece")
    return _Instruments(
        clips=meter.create_counter(
            "astra.mouthpiece.tts.clips", description="TTS clips synthesized"
        ),
        cache=meter.create_counter(
            "astra.mouthpiece.tts.clip_cache",
            description="TTS clips reused from the clip cache (hit) or rendered (miss)",
        ),
        skipped=meter.create_counter(
            "astra.mouthpiece.tts.skipped_turns",
            description="TTS turns skipped (no spoken words)",
        ),
    )


def provider_cache_identity(provider: TTSProvider) -> str:
    """The provider's `cache_identity` (backend, model, output settings), or its class
    name for a provider that does not declare one."""
    identity = getattr(provider, "cache_identity", None)
    return identity if isinstance(identity, str) and identity else type(provider).__qualname__


def clip_key(identity: str, mode: str, fmt: str, inputs: list[dict[str, str | None]]) -> str:
    """The content hash naming one clip. ``inputs`` holds each spoken line's ``voice``,
    rendered ``text`` and ``emotion`` (None in dialogue mode, where it is in the text)."""
    payload = json.dumps(
        {
            "v": CLIP_KEY_VERSION,
            "provider": identity,
            "mode": mode,
            "format": fmt,
            "inputs": inputs,
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


@dataclass(slots=True)
class _ClipStore:
    """The clips dir as a cache: `<key>.<fmt>` audio plus a `<key>.json` duration."""

    root: Path
    fmt: str
    mode: str
    reused: int = 0
    rendered: int = 0

    def audio_path(self, key: str) -> Path:
        return self.root / f"{key}.{self.fmt}"

    def manifest_path(self, key: str) -> str:
        """The clip's path in the manifest: relative to the session dir (``out_dir``)."""
        return f"{self.root.name}/{key}.{self.fmt}"

    def meta_path(self, key: str) -> Path:
        return self.root / f"{key}.json"

    def cached_duration(self, key: str) -> int | None:
        """The stored duration, when both files exist and the metadata parses."""
        audio, meta = self.audio_path(key), self.meta_path(key)
        if not (audio.is_file() and meta.is_file()):
            return None
        try:
            duration = json.loads(meta.read_text(encoding="utf-8"))["duration_ms"]
        except (ValueError, KeyError, TypeError):
            return None
        return duration if isinstance(duration, int) else None

    def clip(self, key: str, render: Callable[[], SynthesisResult]) -> tuple[Path, int]:
        """The clip for ``key``: the cached file, or ``render()`` written atomically. The
        audio is written before its metadata, so a crash between them costs a re-render,
        never a clip with the wrong audio."""
        duration = self.cached_duration(key)
        if duration is not None:
            self.reused += 1
            _instruments().cache.add(1, {"outcome": "hit", "mode": self.mode})
            return self.audio_path(key), duration
        result = render()
        audio = self.audio_path(key)
        tmp = temp_sibling(audio)
        tmp.write_bytes(result.audio)
        tmp.replace(audio)
        atomic_write_text(self.meta_path(key), json.dumps({"duration_ms": result.duration_ms}))
        self.rendered += 1
        _instruments().cache.add(1, {"outcome": "miss", "mode": self.mode})
        _instruments().clips.add(1, {"mode": self.mode})
        return audio, result.duration_ms

    def prune(self, keep: set[str]) -> int:
        """Delete every file in the dir that is not a kept clip or its metadata."""
        names = {self.audio_path(k).name for k in keep} | {self.meta_path(k).name for k in keep}
        removed = 0
        for path in self.root.iterdir():
            if path.is_file() and path.name not in names:
                path.unlink()
                removed += 1
        return removed


def speakable_turns(turns: list[ScriptTurn]) -> list[ScriptTurn]:
    """Drop turns with nothing to say once the [audio tags] are stripped. The model
    occasionally emits a bare stage direction as a turn ("[stunned silence]"); no
    backend can voice it, and ElevenLabs rejects the whole dialogue chunk over it."""
    kept: list[ScriptTurn] = []
    for turn in turns:
        if strip_audio_tags(turn.text).strip():
            kept.append(turn)
        else:
            _log.warning("skipping tag-only turn for %s: %r", turn.speaker, turn.text)
            _instruments().skipped.add(1, {"speaker": turn.speaker})
    return kept


def synthesize_script(
    script: Script,
    *,
    provider: TTSProvider | None = None,
    voices: VoiceConfig = DEFAULT_VOICES,
    out_dir: Path | str,
    pronunciations: Lexicon | None = None,
) -> AudioManifest:
    """Synthesize a script to audio clips and return a manifest. A clip already in
    `<out_dir>/clips/` under the same key is reused (see the module docstring)."""
    provider = provider or MockTTSProvider()
    lexicon = pronunciations or {}
    clips_dir = Path(out_dir) / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)

    use_dialogue = provider.dialogue and hasattr(provider, "synthesize_dialogue")
    mode = "dialogue" if use_dialogue else "turns"
    store = _ClipStore(clips_dir, provider.format, mode)
    identity = provider_cache_identity(provider)
    if use_dialogue:
        clips, keys = _synthesize_dialogue_chunks(
            script, provider, voices, store, identity, lexicon
        )
    else:
        clips, keys = _synthesize_per_turn(script, provider, voices, store, identity)
    pruned = store.prune(keys)

    span = trace.get_current_span()
    span.set_attribute("mouthpiece.clips_reused", store.reused)
    span.set_attribute("mouthpiece.clips_rendered", store.rendered)
    _log.info(
        "tts %s: %d clips reused, %d rendered, %d stale files removed",
        script.session_id,
        store.reused,
        store.rendered,
        pruned,
    )
    return AudioManifest(
        session_id=script.session_id,
        mode=mode,
        format=provider.format,
        voices=voices,
        clips=clips,
    )


def _synthesize_per_turn(
    script: Script, provider: TTSProvider, voices: VoiceConfig, store: _ClipStore, identity: str
) -> tuple[list[TtsClip], set[str]]:
    clips: list[TtsClip] = []
    keys: set[str] = set()
    for i, turn in enumerate(speakable_turns(script.turns)):
        req = SynthesisRequest(
            text=turn.text, voice=voices.by_id(turn.speaker), emotion=turn.emotion
        )
        key = clip_key(
            identity,
            store.mode,
            store.fmt,
            [{"voice": req.voice, "text": req.text, "emotion": req.emotion}],
        )
        _path, duration = store.clip(key, lambda req=req: provider.synthesize(req))
        keys.add(key)
        clips.append(
            TtsClip(
                index=i + 1,
                speaker=turn.speaker,
                path=store.manifest_path(key),
                duration_ms=duration,
            )
        )
    return clips, keys


def _synthesize_dialogue_chunks(
    script: Script,
    provider: TTSProvider,
    voices: VoiceConfig,
    store: _ClipStore,
    identity: str,
    lexicon: Lexicon,
) -> tuple[list[TtsClip], set[str]]:
    # v3 path: render delivery tags, then inline IPA for known terms.
    def render(turn: ScriptTurn) -> str:
        return _apply(render_delivery(turn.text, turn.emotion, True), lexicon)

    dialogue_provider = cast(DialogueTTSProvider, provider)
    chunks = chunk_turns(
        speakable_turns(script.turns), dialogue_provider.dialogue_budget, lambda t: len(render(t))
    )
    synth_dialogue = dialogue_provider.synthesize_dialogue

    clips: list[TtsClip] = []
    keys: set[str] = set()
    for i, chunk in enumerate(chunks):
        inputs = [DialogueInput(text=render(t), voice=voices.by_id(t.speaker)) for t in chunk]
        key = clip_key(
            identity,
            store.mode,
            store.fmt,
            [{"voice": d.voice, "text": d.text, "emotion": None} for d in inputs],
        )
        req = DialogueRequest(inputs=inputs)
        _path, duration = store.clip(key, lambda req=req: synth_dialogue(req))
        keys.add(key)
        clips.append(
            TtsClip(
                index=i + 1,
                speaker=chunk[0].speaker,
                path=store.manifest_path(key),
                duration_ms=duration,
            )
        )
    return clips, keys
