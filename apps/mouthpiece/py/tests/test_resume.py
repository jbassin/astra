"""Paid stages resume: the TTS clip cache and the saved script passes.

Fake providers count every paid call, so these prove what a retry pays for. No network.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from astra_llm import TextRequest, ToolCallRequest
from astra_mouthpiece.models import (
    DigestStats,
    HostConfig,
    HostPersona,
    Script,
    ScriptTurn,
    SessionDigest,
    VoiceConfig,
)
from astra_mouthpiece.script import PASS_B_CHUNK_WORDS, generate_script
from astra_mouthpiece.script_cache import ScriptPassCache
from astra_mouthpiece.tts.mock import MockTTSProvider
from astra_mouthpiece.tts.provider import (
    DialogueRequest,
    SynthesisRequest,
    SynthesisResult,
)
from astra_mouthpiece.tts.synth import synthesize_script

HOSTS = HostConfig(
    a=HostPersona(name="Bram", persona="x", voice_id="va"),
    b=HostPersona(name="Maeve", persona="x", voice_id="vb"),
    c=HostPersona(name="Nell", persona="x", voice_id="vc"),
)
VOICES = VoiceConfig(a="va", b="vb", c="vc")


class Boom(RuntimeError):
    """A provider failure partway through a render."""


# ── TTS clip cache ───────────────────────────────────────────────────────────
class CountingTurns(MockTTSProvider):
    """The per-turn mock, counting renders; fails on the render numbered ``fail_on``."""

    def __init__(self, fail_on: int | None = None) -> None:
        self.texts: list[str] = []
        self.fail_on = fail_on

    def synthesize(self, req: SynthesisRequest) -> SynthesisResult:
        if self.fail_on is not None and len(self.texts) + 1 == self.fail_on:
            raise Boom("provider down")
        self.texts.append(req.text)
        return super().synthesize(req)


class CountingDialogue:
    """A dialogue provider (the ElevenLabs path) with a tiny chunk budget, counting renders."""

    format = "mp3"
    dialogue = True
    dialogue_budget = 12
    cache_identity = "fake-dialogue:m1"

    def __init__(self, fail_on: int | None = None) -> None:
        self.requests: list[list[str]] = []
        self.fail_on = fail_on

    def synthesize(self, req: SynthesisRequest) -> SynthesisResult:
        raise AssertionError("the dialogue path never renders single turns")

    def synthesize_dialogue(self, req: DialogueRequest) -> SynthesisResult:
        if self.fail_on is not None and len(self.requests) + 1 == self.fail_on:
            raise Boom("provider down")
        self.requests.append([i.text for i in req.inputs])
        return SynthesisResult(audio=("|".join(i.text for i in req.inputs)).encode(), duration_ms=7)


def _script(*texts: str) -> Script:
    speakers = ("A", "B", "C")
    return Script(
        session_id="sid",
        title="t",
        hosts=HOSTS,
        turns=[ScriptTurn(speaker=speakers[i % 3], text=t) for i, t in enumerate(texts)],
    )


def _clip_files(out: Path) -> set[str]:
    return {p.name for p in (out / "clips").iterdir()}


def test_a_second_render_of_the_same_script_renders_nothing(tmp_path: Path) -> None:
    script = _script("one", "two", "three")
    first = CountingTurns()
    m1 = synthesize_script(script, provider=first, voices=VOICES, out_dir=tmp_path)
    assert len(first.texts) == 3

    second = CountingTurns()
    m2 = synthesize_script(script, provider=second, voices=VOICES, out_dir=tmp_path)
    assert second.texts == []
    assert m2 == m1
    assert all(Path(c.path).is_file() for c in m2.clips)


def test_changing_one_turn_re_renders_exactly_that_clip(tmp_path: Path) -> None:
    synthesize_script(
        _script("one", "two", "three"), provider=CountingTurns(), voices=VOICES, out_dir=tmp_path
    )

    again = CountingTurns()
    manifest = synthesize_script(
        _script("one", "TWO, edited", "three"), provider=again, voices=VOICES, out_dir=tmp_path
    )
    assert again.texts == ["TWO, edited"]
    assert [c.index for c in manifest.clips] == [1, 2, 3]
    # The old clip for "two" is gone; the three in use (and their metadata) remain.
    used = {Path(c.path).name for c in manifest.clips}
    assert _clip_files(tmp_path) == used | {Path(n).with_suffix(".json").name for n in used}


def test_a_retry_after_a_mid_render_failure_renders_only_the_missing_clips(
    tmp_path: Path,
) -> None:
    script = _script("one", "two", "three", "four")
    failing = CountingTurns(fail_on=3)
    with pytest.raises(Boom):
        synthesize_script(script, provider=failing, voices=VOICES, out_dir=tmp_path)
    assert failing.texts == ["one", "two"]

    retry = CountingTurns()
    manifest = synthesize_script(script, provider=retry, voices=VOICES, out_dir=tmp_path)
    assert retry.texts == ["three", "four"]
    assert len(manifest.clips) == 4


def test_a_failed_render_deletes_nothing(tmp_path: Path) -> None:
    clips = tmp_path / "clips"
    clips.mkdir()
    (clips / "001.wav").write_bytes(b"old take")
    with pytest.raises(Boom):
        synthesize_script(
            _script("one", "two"),
            provider=CountingTurns(fail_on=2),
            voices=VOICES,
            out_dir=tmp_path,
        )
    assert (clips / "001.wav").is_file()


def test_a_successful_render_removes_clips_under_the_old_names(tmp_path: Path) -> None:
    clips = tmp_path / "clips"
    clips.mkdir()
    (clips / "001.wav").write_bytes(b"old take")
    manifest = synthesize_script(
        _script("one"), provider=CountingTurns(), voices=VOICES, out_dir=tmp_path
    )
    assert not (clips / "001.wav").exists()
    assert Path(manifest.clips[0].path).parent == clips


def test_a_changed_voice_or_provider_misses_the_cache(tmp_path: Path) -> None:
    script = _script("one", "two")
    synthesize_script(script, provider=CountingTurns(), voices=VOICES, out_dir=tmp_path)

    new_voice = CountingTurns()
    synthesize_script(
        script, provider=new_voice, voices=VoiceConfig(a="va2", b="vb", c="vc"), out_dir=tmp_path
    )
    assert new_voice.texts == ["one"]

    class OtherModel(CountingTurns):
        cache_identity = "mock:other-model"

    other = OtherModel()
    synthesize_script(script, provider=other, voices=VOICES, out_dir=tmp_path)
    assert other.texts == ["one", "two"]


def test_dialogue_chunks_are_cached_and_resume(tmp_path: Path) -> None:
    # Budget 12 chars: each 10-char turn is its own chunk.
    script = _script("aaaaaaaaaa", "bbbbbbbbbb", "cccccccccc")
    failing = CountingDialogue(fail_on=2)
    with pytest.raises(Boom):
        synthesize_script(script, provider=failing, voices=VOICES, out_dir=tmp_path)
    assert len(failing.requests) == 1

    retry = CountingDialogue()
    manifest = synthesize_script(script, provider=retry, voices=VOICES, out_dir=tmp_path)
    assert [r[0] for r in retry.requests] == ["bbbbbbbbbb", "cccccccccc"]
    assert manifest.mode == "dialogue"
    assert [Path(c.path).read_bytes() for c in manifest.clips] == [
        b"aaaaaaaaaa",
        b"bbbbbbbbbb",
        b"cccccccccc",
    ]
    assert [c.duration_ms for c in manifest.clips] == [7, 7, 7]

    edited = CountingDialogue()
    synthesize_script(
        _script("aaaaaaaaaa", "BBBBBBBBBB", "cccccccccc"),
        provider=edited,
        voices=VOICES,
        out_dir=tmp_path,
    )
    assert edited.requests == [["BBBBBBBBBB"]]


def test_the_pronunciation_lexicon_is_part_of_the_dialogue_key(tmp_path: Path) -> None:
    script = _script("Faerrin rises")
    first = CountingDialogue()
    first.dialogue_budget = 1_000
    synthesize_script(script, provider=first, voices=VOICES, out_dir=tmp_path)
    with_ipa = CountingDialogue()
    with_ipa.dialogue_budget = 1_000
    synthesize_script(
        script,
        provider=with_ipa,
        voices=VOICES,
        out_dir=tmp_path,
        pronunciations={"Faerrin": "ˈfɛrɪn"},
    )
    assert len(with_ipa.requests) == 1


# ── script passes ────────────────────────────────────────────────────────────
#: A Pass A transcript long enough for three Pass B segments.
LONG_PASS_A = "\n".join(
    f"Bram: line {i} " + "word " * 20 for i in range(int(PASS_B_CHUNK_WORDS * 2.5 / 23))
)


class ScriptClient:
    """Counts Pass A (`call_text`) and Pass B (`call_tool`) calls. Pass B call number
    ``fail_on`` raises once."""

    def __init__(self, *, fail_on: int | None = None, text: str = LONG_PASS_A) -> None:
        self.text_calls = 0
        self.tool_segments: list[str] = []
        self.fail_on = fail_on
        self._text = text

    def call_text(self, req: TextRequest) -> str:
        self.text_calls += 1
        return self._text

    def call_tool(self, req: ToolCallRequest) -> dict[str, object]:
        if self.fail_on is not None and len(self.tool_segments) + 1 == self.fail_on:
            self.fail_on = None
            raise Boom("provider down")
        first_line = req.user_content.strip().splitlines()[-1][:20]
        self.tool_segments.append(req.user_content)
        return {"title": "The Title", "turns": [{"speaker": "A", "text": first_line or "x"}]}


def _digest(synopsis: str = "syn") -> SessionDigest:
    return SessionDigest(
        session_id="sid",
        synopsis=synopsis,
        wiki_refs=[],
        kept_ranges=[(1, 1)],
        stats=DigestStats(lines=1, kept_lines=1, windows=1, dropped_windows=0),
    )


def _generate(
    client: ScriptClient,
    cache: ScriptPassCache,
    *,
    synopsis: str = "syn",
    model: str = "glm",
    brief_block: str = "",
    roster_block: str = "",
) -> Script:
    return generate_script(
        client,
        _digest(synopsis),
        [(1, "Archie", "they did a thing")],
        [],
        HOSTS,
        model=model,
        brief_block=brief_block,
        roster_block=roster_block,
        cache=cache,
    )


def test_a_script_retry_after_pass_b_failed_skips_pass_a_and_finished_segments(
    tmp_path: Path,
) -> None:
    cache = ScriptPassCache(tmp_path / "script-cache")
    failing = ScriptClient(fail_on=2)
    with pytest.raises(Boom):
        _generate(failing, cache)
    assert failing.text_calls == 1
    assert len(failing.tool_segments) == 1  # segment 1 done, segment 2 failed

    retry = ScriptClient()
    script = _generate(retry, ScriptPassCache(tmp_path / "script-cache"))
    assert retry.text_calls == 0
    assert len(retry.tool_segments) == 2  # segments 2 and 3 only
    assert len(script.turns) == 3 and script.title == "The Title"

    clean = _generate(ScriptClient(), ScriptPassCache(None))
    assert clean == script


def test_a_finished_script_reruns_nothing_until_the_cache_is_cleared(tmp_path: Path) -> None:
    cache = ScriptPassCache(tmp_path / "script-cache")
    _generate(ScriptClient(), cache)
    again = ScriptClient()
    _generate(again, cache)
    assert (again.text_calls, len(again.tool_segments)) == (0, 0)
    assert cache.counts["pass_a_hit"] == 1 and cache.counts["pass_b_hit"] == 3

    cache.clear()
    assert not (tmp_path / "script-cache").exists()
    fresh = ScriptClient()
    _generate(fresh, cache)
    assert (fresh.text_calls, len(fresh.tool_segments)) == (1, 3)


@pytest.mark.parametrize(
    "change",
    [
        {"synopsis": "a different synopsis"},
        {"model": "another-model"},
        {"brief_block": "PRODUCER NOTES: new"},
        {"roster_block": "THE TABLE:\n- someone new"},
    ],
)
def test_a_changed_input_invalidates_the_saved_passes(
    tmp_path: Path, change: dict[str, str]
) -> None:
    cache = ScriptPassCache(tmp_path / "script-cache")
    _generate(ScriptClient(), cache)
    changed = ScriptClient()
    _generate(changed, cache, **change)
    assert changed.text_calls == 1
    if "model" in change:
        assert len(changed.tool_segments) == 3  # Pass B keys carry the model too


def test_a_new_pass_a_misses_every_pass_b_segment(tmp_path: Path) -> None:
    cache = ScriptPassCache(tmp_path / "script-cache")
    first = ScriptClient(fail_on=3)
    with pytest.raises(Boom):
        _generate(first, cache)
    # Same request, but the saved Pass A is gone: the model writes a different transcript.
    for f in (tmp_path / "script-cache").glob("pass-a.*"):
        f.unlink()
    rewritten = ScriptClient(text=LONG_PASS_A.replace("line", "row"))
    _generate(rewritten, cache)
    assert rewritten.text_calls == 1
    assert len(rewritten.tool_segments) == 3


def test_an_unparseable_segment_is_not_saved(tmp_path: Path) -> None:
    from astra_mouthpiece.script import ScriptParseError

    class BadOnce(ScriptClient):
        def call_tool(self, req: ToolCallRequest) -> dict[str, object]:
            self.tool_segments.append(req.user_content)
            return {"title": "", "turns": []}

    cache = ScriptPassCache(tmp_path / "script-cache")
    with pytest.raises(ScriptParseError):
        _generate(BadOnce(), cache)
    assert list((tmp_path / "script-cache").glob("pass-b.*")) == []
    assert len(list((tmp_path / "script-cache").glob("pass-a.*"))) == 1
