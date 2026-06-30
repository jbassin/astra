"""Per-session orchestration — digest → two-pass script → clips → episode.

Kept free of Dagster + config so it unit-tests with injected deps (an LlmClient
stub, a mock TTSProvider, a fake ffmpeg runner). The asset layer (assets.py)
supplies the real client, akasha corpus, hosts, and paths.
"""

from __future__ import annotations

from pathlib import Path

from astra_llm import LlmClient
from astra_observe import get_tracer

from .assemble import BedOptions, FfmpegRunner, assemble_episode, run_ffmpeg
from .grounding import GroundingPage, ground_digest
from .models import HostConfig, Script, SessionDigest, VoiceConfig
from .script import DEFAULT_SCRIPT_MAX_TOKENS, generate_script
from .tts.pronunciation import Lexicon
from .tts.provider import TTSProvider
from .tts.synth import DEFAULT_VOICES, synthesize_script

_tracer = get_tracer("astra.mouthpiece")


def build_episode_script(
    client: LlmClient,
    digest: SessionDigest,
    pages: list[GroundingPage],
    hosts: HostConfig,
    *,
    two_pass: bool = True,
    model: str | None = None,
    max_tokens: int = DEFAULT_SCRIPT_MAX_TOKENS,
    threads_block: str = "",
    continuity_block: str = "",
    sharpen: bool = False,
) -> Script:
    """Ground the digest against the akasha pages, then run the two-pass script."""
    grounding = ground_digest(digest, pages)
    return generate_script(
        client,
        digest,
        grounding,
        hosts,
        two_pass=two_pass,
        model=model,
        max_tokens=max_tokens,
        threads_block=threads_block,
        continuity_block=continuity_block,
        sharpen=sharpen,
    )


def render_episode_audio(
    script: Script,
    *,
    out_dir: Path | str,
    provider: TTSProvider | None = None,
    voices: VoiceConfig = DEFAULT_VOICES,
    pronunciations: Lexicon | None = None,
    bed: BedOptions | None = None,
    run: FfmpegRunner = run_ffmpeg,
) -> tuple[Path, Path]:
    """Synthesize the script to clips and stitch them into `episode.mp3` + transcript."""
    manifest = synthesize_script(
        script, provider=provider, voices=voices, out_dir=out_dir, pronunciations=pronunciations
    )
    return assemble_episode(manifest, script, out_dir=out_dir, bed=bed, run=run)


def produce_episode(
    client: LlmClient,
    digest: SessionDigest,
    pages: list[GroundingPage],
    hosts: HostConfig,
    *,
    out_dir: Path | str,
    provider: TTSProvider | None = None,
    voices: VoiceConfig = DEFAULT_VOICES,
    pronunciations: Lexicon | None = None,
    two_pass: bool = True,
    model: str | None = None,
    threads_block: str = "",
    continuity_block: str = "",
    sharpen: bool = False,
    bed: BedOptions | None = None,
    run: FfmpegRunner = run_ffmpeg,
) -> dict[str, str]:
    """Full session: digest → script → audio → episode.mp3 + transcript.md."""
    with _tracer.start_as_current_span("mouthpiece.produce_episode") as span:
        script = build_episode_script(
            client,
            digest,
            pages,
            hosts,
            two_pass=two_pass,
            model=model,
            threads_block=threads_block,
            continuity_block=continuity_block,
            sharpen=sharpen,
        )
        episode, transcript = render_episode_audio(
            script,
            out_dir=out_dir,
            provider=provider,
            voices=voices,
            pronunciations=pronunciations,
            bed=bed,
            run=run,
        )
        span.set_attribute("mouthpiece.turns", len(script.turns))
        span.set_attribute("mouthpiece.title", script.title)
        return {"episode": str(episode), "transcript": str(transcript), "title": script.title}
