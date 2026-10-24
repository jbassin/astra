"""The mouthpiece episode chain through ``dg.materialize`` with fake resources (0037 PIPE-16).

Paths point under ``tmp_path``, the LLM client is a stub, TTS is the offline mock and ffmpeg
is a fake runner, so no key, no network and no money. The two LLM stages' prompt logic is
unit-tested elsewhere; here they are stand-ins that record which client and model they got.
The being.kdl roster and hosts are the real ones (read-only repo files).
"""

import functools
import subprocess
from pathlib import Path
from typing import Any

import dagster as dg
import pytest
from astra_linguist.chronicle import show_index
from astra_mouthpiece import assets as mp
from astra_mouthpiece.assemble import assemble_episode
from astra_mouthpiece.models import DigestStats, Script, ScriptTurn, SessionDigest
from astra_mouthpiece.resources import TtsResource
from astra_pipeline_resources.testing import FakeConfig, FakeLlm, paths_under

DATE = "2026-7-6"
CHAIN = [
    mp.session_digest,
    mp.session_brief,
    mp.session_script,
    mp.session_audio_clips,
    mp.session_episode,
]


def _fake_ffmpeg(args: list[str]) -> subprocess.CompletedProcess[str]:
    if args[0] == "ffprobe":
        return subprocess.CompletedProcess(
            args, 0, stdout='{"streams":[{"sample_rate":"24000","channels":1,"codec_name":"mp3"}]}'
        )
    Path(args[-1]).write_bytes(b"\x00")
    return subprocess.CompletedProcess(args, 0, stdout="", stderr="")


def _stub_stages(monkeypatch: pytest.MonkeyPatch, seen: dict[str, Any]) -> None:
    """Stand-ins for the paid stages that record their client, model and roots."""

    def clean_session(client: Any, session_id: str, turns: list[Any], *, model: str) -> Any:
        seen["digest"] = (client, model)
        return SessionDigest(
            session_id=session_id,
            synopsis="syn",
            kept_ranges=[(1, len(turns))],
            stats=DigestStats(
                lines=len(turns), kept_lines=len(turns), windows=1, dropped_windows=0
            ),
        )

    def build_episode_script(client: Any, digest: Any, cleaned: Any, *a: Any, **kw: Any) -> Any:
        seen["script"] = (client, kw["model"], len(cleaned))
        hosts = a[1]
        return Script(
            session_id=digest.session_id,
            title="The Episode",
            hosts=hosts,
            turns=[ScriptTurn(speaker="A", text="hey"), ScriptTurn(speaker="B", text="hi")],
        )

    def produce_brief(key: str, *, root: Path) -> dict[str, Any]:
        seen["brief_root"] = root
        return {"status": "failed", "error": "no producer in tests"}

    monkeypatch.setattr(mp.clean, "clean_session", clean_session)
    monkeypatch.setattr(mp, "build_episode_script", build_episode_script)
    monkeypatch.setattr(mp, "produce_brief", produce_brief)
    monkeypatch.setattr(
        mp, "assemble_episode", functools.partial(assemble_episode, run=_fake_ffmpeg)
    )


def test_the_chain_writes_every_output_under_the_injected_paths(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    paths = paths_under(tmp_path)
    slug = next(iter(show_index()))
    paths.transcripts.mkdir(parents=True)
    (paths.transcripts / f"000.{slug}.{DATE}.txt").write_text(
        "000001\tArchie: a thing happened\n000002\tBree: and another\n", encoding="utf-8"
    )
    Path(paths.akasha_content).mkdir(parents=True)
    config = FakeConfig()
    config.cfg.mouthpiece.model = "test/mouthpiece-model"
    stub = object()
    llm = FakeLlm(stub)
    seen: dict[str, Any] = {}
    _stub_stages(monkeypatch, seen)
    instance = dg.DagsterInstance.ephemeral()
    instance.add_dynamic_partitions(mp.SESSIONS_NAME, [DATE])

    result = dg.materialize(
        CHAIN,
        partition_key=DATE,
        instance=instance,
        resources={
            "astra_config": config,
            "pipeline_paths": paths,
            "llm": llm,
            "tts": TtsResource(provider="mock", elevenlabs_model="unused"),
        },
    )

    assert result.success
    session = paths.episodes / DATE
    for name in ("digest.json", "script.json", "manifest.json"):
        assert (session / name).is_file(), name
    assert list(session.glob("*.episode.mp3")) and list(session.glob("*.transcript.md"))
    assert (paths.episodes / ".last-rendered").read_text() == DATE
    assert seen["digest"] == (stub, "test/mouthpiece-model")
    assert seen["script"] == (stub, "test/mouthpiece-model", 2)
    assert seen["brief_root"] == paths.episodes
    assert llm.clients == 2  # one client per paid LLM stage, as before
    clips = result.asset_materializations_for_node("session_audio_clips")[0].metadata
    assert clips["clips"] != dg.IntMetadataValue(0)


def test_defs_bind_the_shared_resources_and_tts() -> None:
    repo = mp.defs.get_repository_def()
    assert {"astra_config", "pipeline_paths", "llm", "tts"} <= set(repo.get_top_level_resources())
