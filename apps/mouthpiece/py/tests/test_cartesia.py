"""Cartesia Sonic-3 provider — hermetic (the `post` seam is stubbed; no network).

Covers the delivery-tag translation (pauses → <break/>, direction → emotion, the rest
stripped), the request body shape, headers, and the per-turn ("turns" mode) render.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from astra_mouthpiece.models import HostConfig, HostPersona, Script, ScriptTurn, VoiceConfig
from astra_mouthpiece.tts import CartesiaTTSProvider, render_for_cartesia, synthesize_script
from astra_mouthpiece.tts.cartesia import CARTESIA_EMOTIONS, CARTESIA_VERSION, emotion_for
from astra_mouthpiece.tts.provider import SynthesisRequest


def test_emotion_for_maps_script_tags_onto_the_enum() -> None:
    assert emotion_for("happy") == "happy"
    assert emotion_for("Excited") == "excited"
    assert emotion_for("annoyed") == "frustrated"  # alias
    assert emotion_for("thoughtful") == "contemplative"  # alias
    assert emotion_for("deadpan") == "neutral"
    assert emotion_for("laughing") is None  # non-verbal, not an emotion
    assert emotion_for("interrupts") is None
    assert all(emotion_for(e) == e for e in CARTESIA_EMOTIONS)


def test_render_translates_pauses_and_picks_first_direction_tag() -> None:
    text = "[excited] Okay so [short pause] the door, right? [laughing] The DOOR. [sad] Anyway."
    out, emotion = render_for_cartesia(text)
    assert emotion == "excited"  # first direction tag wins; [sad] later is dropped
    assert out == 'Okay so <break time="300ms"/> the door, right? The DOOR. Anyway.'
    assert "[" not in out and "]" not in out


def test_render_legacy_emotion_field_wins_over_inline_tags() -> None:
    out, emotion = render_for_cartesia("[happy] Fine.", emotion="annoyed")
    assert (out, emotion) == ("Fine.", "frustrated")


def test_render_collapses_consecutive_breaks_and_strays() -> None:
    out, emotion = render_for_cartesia("Well [short pause] [long pause] ... no [sighs], yes.")
    assert emotion is None
    # Two adjacent pauses → one break (Cartesia warns consecutive breaks hallucinate);
    # a stripped tag never strands a comma.
    assert out == 'Well <break time="300ms"/> ... no, yes.'


def test_unknown_tags_are_stripped_not_read_aloud() -> None:
    out, emotion = render_for_cartesia("[French accent] Bonjour [clears throat] friends.")
    assert (out, emotion) == ("Bonjour friends.", None)


def test_build_body_and_headers() -> None:
    p = CartesiaTTSProvider("sk_car_test")
    body = p.build_body(
        SynthesisRequest(text="[curious] Wait, WAIT— [short pause] what?", voice="v1")
    )
    assert body["model_id"] == "sonic-3"
    assert body["voice"] == {"mode": "id", "id": "v1"}
    assert body["output_format"] == {"container": "mp3", "sample_rate": 44100, "bit_rate": 128000}
    assert body["language"] == "en"
    assert body["transcript"] == 'Wait, WAIT— <break time="300ms"/> what?'
    assert body["generation_config"] == {"emotion": "curious"}
    plain = p.build_body(SynthesisRequest(text="No tags here.", voice="v1"))
    assert "generation_config" not in plain  # no emotion → Cartesia's default delivery
    h = p._headers()
    assert h["Authorization"] == "Bearer sk_car_test"
    assert h["Cartesia-Version"] == CARTESIA_VERSION


def test_synthesize_script_renders_one_clip_per_turn_in_turns_mode(tmp_path: Path) -> None:
    calls: list[tuple[str, dict[str, str], dict[str, Any]]] = []

    def fake_post(url: str, headers: dict[str, str], json: dict[str, Any]) -> bytes:
        calls.append((url, headers, json))
        return b"ID3fake-mp3"

    provider = CartesiaTTSProvider("k", post=fake_post)
    assert provider.dialogue is False and provider.format == "mp3"
    hosts = HostConfig(
        a=HostPersona(name="Bram", persona="x", cartesia_voice_id="ca"),
        b=HostPersona(name="Maeve", persona="x", cartesia_voice_id="cb"),
    )
    script = Script(
        session_id="s",
        title="t",
        hosts=hosts,
        turns=[
            ScriptTurn(speaker="A", text="[excited] So the vault opens."),
            ScriptTurn(speaker="B", text="And nobody looks up."),
            ScriptTurn(speaker="B", text="[sighs] Of course."),
        ],
    )
    manifest = synthesize_script(
        script, provider=provider, voices=VoiceConfig(a="ca", b="cb"), out_dir=tmp_path
    )
    assert manifest.mode == "turns" and manifest.format == "mp3"
    assert [c.speaker for c in manifest.clips] == ["A", "B", "B"]
    assert len(calls) == 3
    assert all(url == "https://api.cartesia.ai/tts/bytes" for url, _, _ in calls)
    assert [c[2]["voice"]["id"] for c in calls] == ["ca", "cb", "cb"]
    assert calls[0][2]["generation_config"] == {"emotion": "excited"}
    assert "generation_config" not in calls[2][2]  # [sighs] is non-verbal → stripped
    assert calls[2][2]["transcript"] == "Of course."
    for clip in manifest.clips:
        assert Path(clip.path).read_bytes() == b"ID3fake-mp3"
        assert clip.duration_ms >= 300
