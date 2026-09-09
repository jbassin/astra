"""Stage 4 orchestration — synthesize a script to clips + a manifest (caster
`tts/index.ts`). Dialogue-capable backends (v3) render runs of turns as pre-paced
"dialogue" chunks (with the pronunciation IPA wrap); everything else falls back to
one clip per turn. Writes `<out_dir>/clips/NNN.<fmt>`.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import cast

from astra_observe import get_meter

from ..models import AudioManifest, Script, ScriptTurn, TtsClip, VoiceConfig
from .dialogue import DEFAULT_DIALOGUE_BUDGET, chunk_turns
from .mock import MockTTSProvider
from .pronunciation import Lexicon
from .pronunciation import apply_pronunciations as _apply
from .provider import (
    DialogueInput,
    DialogueRequest,
    DialogueTTSProvider,
    SynthesisRequest,
    TTSProvider,
)
from .tags import render_delivery, strip_audio_tags

_log = logging.getLogger("astra.mouthpiece.tts")

#: Placeholder voice ids for the mock provider; real providers override these.
DEFAULT_VOICES = VoiceConfig(a="mock-voice-a", b="mock-voice-b")

# Clips emitted, by render mode (dialogue chunks vs per-turn). No-op until init_telemetry.
_tts_clips = get_meter("astra.mouthpiece").create_counter(
    "astra.mouthpiece.tts.clips", description="TTS clips synthesized"
)


# Turns dropped because they carry no spoken words (an all-tag line like
# "[stunned silence]"). ElevenLabs Text-to-Dialogue 400s on an empty input.
_tts_skipped = get_meter("astra.mouthpiece").create_counter(
    "astra.mouthpiece.tts.skipped_turns", description="TTS turns skipped (no spoken words)"
)


def _clip_name(index: int, fmt: str) -> str:
    return f"{index:03d}.{fmt}"


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
            _tts_skipped.add(1, {"speaker": turn.speaker})
    return kept


def synthesize_script(
    script: Script,
    *,
    provider: TTSProvider | None = None,
    voices: VoiceConfig = DEFAULT_VOICES,
    out_dir: Path | str,
    pronunciations: Lexicon | None = None,
) -> AudioManifest:
    """Synthesize a script to audio clips and return a manifest."""
    provider = provider or MockTTSProvider()
    lexicon = pronunciations or {}
    clips_dir = Path(out_dir) / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    for stale in clips_dir.glob(f"*.{provider.format}"):
        stale.unlink()

    use_dialogue = provider.dialogue and hasattr(provider, "synthesize_dialogue")
    if use_dialogue:
        clips = _synthesize_dialogue_chunks(script, provider, voices, clips_dir, lexicon)
    else:
        clips = _synthesize_per_turn(script, provider, voices, clips_dir)

    return AudioManifest(
        session_id=script.session_id,
        mode="dialogue" if use_dialogue else "turns",
        format=provider.format,
        voices=voices,
        clips=clips,
    )


def _synthesize_per_turn(
    script: Script, provider: TTSProvider, voices: VoiceConfig, clips_dir: Path
) -> list[TtsClip]:
    clips: list[TtsClip] = []
    for i, turn in enumerate(speakable_turns(script.turns)):
        index = i + 1
        result = provider.synthesize(
            SynthesisRequest(text=turn.text, voice=voices.by_id(turn.speaker), emotion=turn.emotion)
        )
        path = clips_dir / _clip_name(index, provider.format)
        path.write_bytes(result.audio)
        clips.append(
            TtsClip(
                index=index, speaker=turn.speaker, path=str(path), duration_ms=result.duration_ms
            )
        )
        _tts_clips.add(1, {"mode": "turns"})
    return clips


def _synthesize_dialogue_chunks(
    script: Script, provider: TTSProvider, voices: VoiceConfig, clips_dir: Path, lexicon: Lexicon
) -> list[TtsClip]:
    # v3 path: render delivery tags, then inline IPA for known terms (M6).
    def render(turn: ScriptTurn) -> str:
        return _apply(render_delivery(turn.text, turn.emotion, True), lexicon)

    chunks = chunk_turns(
        speakable_turns(script.turns), DEFAULT_DIALOGUE_BUDGET, lambda t: len(render(t))
    )
    synth_dialogue = cast(DialogueTTSProvider, provider).synthesize_dialogue

    clips: list[TtsClip] = []
    for i, chunk in enumerate(chunks):
        inputs = [DialogueInput(text=render(t), voice=voices.by_id(t.speaker)) for t in chunk]
        result = synth_dialogue(DialogueRequest(inputs=inputs))
        index = i + 1
        path = clips_dir / _clip_name(index, provider.format)
        path.write_bytes(result.audio)
        clips.append(
            TtsClip(
                index=index,
                speaker=chunk[0].speaker,
                path=str(path),
                duration_ms=result.duration_ms,
            )
        )
        _tts_clips.add(1, {"mode": "dialogue"})
    return clips
