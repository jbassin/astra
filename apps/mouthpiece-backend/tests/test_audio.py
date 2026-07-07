"""Stage 4/5 tests — TTS render + ffmpeg assembly (gates G, H) — hermetic.

No live ElevenLabs and no ffmpeg-on-PATH: the mock provider produces silent WAVs,
ffmpeg is a fake runner that just touches output files, and the arg-builders are
pure. The end-to-end `produce_episode` runs digest→script→clips→episode with a
stubbed LLM client + mock TTS + fake ffmpeg.
"""

from __future__ import annotations

import subprocess
import wave
from pathlib import Path
from typing import Any

from astra_llm import TextRequest, ToolCallRequest
from astra_mouthpiece.assemble import (
    BedOptions,
    GapOptions,
    bed_filter,
    build_concat_list,
    compute_gaps,
    concat_loudnorm_args,
    fade_args,
    make_silence_args,
    parse_probe,
    probe_args,
    render_transcript,
)
from astra_mouthpiece.models import (
    DigestStats,
    HostConfig,
    HostPersona,
    Script,
    ScriptTurn,
    SessionDigest,
    VoiceConfig,
)
from astra_mouthpiece.session import produce_episode
from astra_mouthpiece.tts import (
    MockTTSProvider,
    apply_pronunciations,
    chunk_turns,
    render_delivery,
    strip_audio_tags,
    synthesize_script,
)
from astra_mouthpiece.tts.mock import silent_wav

HOSTS = HostConfig(
    a=HostPersona(name="Bram", persona="x", voice_id="va"),
    b=HostPersona(name="Maeve", persona="x", voice_id="vb"),
    c=HostPersona(name="Pip", persona="x", voice_id="vc"),
)
VOICES = VoiceConfig(a="va", b="vb", c="vc")


# ── tags + pronunciation (verbatim ports) ──────────────────────────────────
def test_strip_audio_tags() -> None:
    assert strip_audio_tags("[warm] Hey — [laughs] big week.") == "Hey — big week."
    assert (
        strip_audio_tags("end [sighs] .") == "end."
    )  # punctuation not stranded after a removed tag


def test_render_delivery_v3_vs_plain() -> None:
    assert render_delivery("[warm] hi", "amused", v3=True) == "[amused] [warm] hi"
    assert render_delivery("[warm] hi", None, v3=False) == "hi"


def test_apply_pronunciations_first_occurrence_skips_tags() -> None:
    out = apply_pronunciations("Faerrin and Faerrin [Faerrin] done", {"Faerrin": "ˈfɛrɪn"})
    # First spoken occurrence wrapped; second left; inside [tag] untouched.
    assert out == "/ˈfɛrɪn/ and Faerrin [Faerrin] done"


# ── dialogue chunking ──────────────────────────────────────────────────────
def test_chunk_turns_respects_budget() -> None:
    turns = [ScriptTurn(speaker="A", text="x" * 40) for _ in range(5)]
    chunks = chunk_turns(turns, budget=100)
    assert [len(c) for c in chunks] == [2, 2, 1]  # 40+40 ≤100, third would overflow


# ── mock provider ──────────────────────────────────────────────────────────
def test_silent_wav_is_valid(tmp_path: Path) -> None:
    p = tmp_path / "s.wav"
    p.write_bytes(silent_wav(500))
    with wave.open(str(p)) as w:
        assert w.getnchannels() == 1 and w.getframerate() == 8000


def test_synthesize_script_mock_writes_clips(tmp_path: Path) -> None:
    script = Script(
        session_id="sid",
        title="t",
        hosts=HOSTS,
        turns=[ScriptTurn(speaker="A", text="hello"), ScriptTurn(speaker="B", text="hi there")],
    )
    manifest = synthesize_script(
        script, provider=MockTTSProvider(), voices=VOICES, out_dir=tmp_path
    )
    assert manifest.mode == "turns"
    assert len(manifest.clips) == 2
    assert all(Path(c.path).exists() for c in manifest.clips)


# ── assemble: pure arg-builders ────────────────────────────────────────────
def test_probe_parse_and_arg_builders() -> None:
    params = parse_probe('{"streams":[{"sample_rate":"24000","channels":1,"codec_name":"mp3"}]}')
    assert params.sample_rate == 24000
    assert "anullsrc=channel_layout=mono:sample_rate=24000" in " ".join(
        make_silence_args("g.mp3", 250, params, "mp3")
    )
    assert probe_args("x.mp3")[0] == "ffprobe"
    assert "loudnorm" in " ".join(concat_loudnorm_args("list.txt", "out.mp3"))
    assert "amix=inputs=2:duration=first:normalize=0" in bed_filter(
        BedOptions(path="b.mp3", gain=0.22, total_ms=10000)
    )
    assert "afade" in " ".join(fade_args("a.mp3", "b.mp3", params, "mp3", 10, 80))


def test_compute_gaps_changes_vs_within() -> None:
    gaps = compute_gaps(["A", "A", "B"], GapOptions(jitter_ms=0))
    assert gaps == [200, 400]  # within-run, then a speaker change


def test_build_concat_list_interleaves_silence() -> None:
    out = build_concat_list(["c1.mp3", "c2.mp3"], [250], lambda ms: f"gap-{ms}.mp3")
    assert out == "file 'c1.mp3'\nfile 'gap-250.mp3'\nfile 'c2.mp3'\n"


def test_render_transcript() -> None:
    script = Script(
        session_id="s", title="The Ep", hosts=HOSTS, turns=[ScriptTurn(speaker="A", text="hi")]
    )
    md = render_transcript(script)
    assert md.startswith("# The Ep")
    assert "**Bram:** hi" in md


# ── end-to-end: produce_episode (digest → episode) with fakes ──────────────
class StubClient:
    def __init__(self, text: str, tool: dict[str, Any]) -> None:
        self._text, self._tool = text, tool

    def call_text(self, req: TextRequest) -> str:
        return self._text

    def call_tool(self, req: ToolCallRequest) -> dict[str, Any]:
        return self._tool


def _fake_ffmpeg(args: list[str]) -> subprocess.CompletedProcess[str]:
    if args[0] == "ffprobe":
        return subprocess.CompletedProcess(
            args, 0, stdout='{"streams":[{"sample_rate":"24000","channels":1,"codec_name":"mp3"}]}'
        )
    Path(args[-1]).write_bytes(b"\x00")  # ffmpeg writes its output path
    return subprocess.CompletedProcess(args, 0, stdout="", stderr="")


def test_produce_episode_end_to_end(tmp_path: Path) -> None:
    digest = SessionDigest(
        session_id="sid",
        synopsis="syn",
        wiki_refs=[],
        kept_ranges=[(1, 1)],
        stats=DigestStats(lines=1, kept_lines=1, windows=1, dropped_windows=0),
    )
    cleaned_turns = [(1, "Archie", "a thing happened")]
    client = StubClient(
        text="Bram: hey\nMaeve: hi\nPip: what",
        tool={
            "title": "The Episode",
            "turns": [
                {"speaker": "A", "text": "hey"},
                {"speaker": "B", "text": "hi"},
                {"speaker": "C", "text": "what"},
            ],
        },
    )
    result = produce_episode(
        client,
        digest,
        cleaned_turns,
        [],  # no grounding pages
        HOSTS,
        out_dir=tmp_path,
        provider=MockTTSProvider(),
        voices=VOICES,
        run=_fake_ffmpeg,
    )
    assert result["title"] == "The Episode"
    assert Path(result["episode"]).exists()
    assert Path(result["transcript"]).exists()
    assert "**Bram:** hey" in Path(result["transcript"]).read_text()
