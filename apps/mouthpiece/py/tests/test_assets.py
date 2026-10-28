"""Dagster wiring structure test — the code location builds; no live run.

Importing the assets builds `dg.Definitions` (Dagster validates the dep graph at
construction); this asserts the episode graph and its automation sensor are present
with the expected keys, and ticks that sensor over an ephemeral instance.
"""

from __future__ import annotations

import dagster as dg
import pytest
from astra_linguist.assets import session_episode_summary, session_transcripts
from astra_mouthpiece import assets as mp
from astra_pipeline_resources.partitions import sessions
from astra_pipeline_resources.testing import (
    automation_tick,
    fail_partition,
    mark_materialized,
    sessions_instance,
)


def test_defs_builds() -> None:
    assert isinstance(mp.defs, dg.Definitions)


def test_the_episode_assets_have_expected_keys() -> None:
    keys = {
        mp.session_digest.key.to_user_string(),
        mp.session_brief.key.to_user_string(),
        mp.session_script.key.to_user_string(),
        mp.session_audio_clips.key.to_user_string(),
        mp.session_episode.key.to_user_string(),
    }
    assert keys == {
        "session_digest",
        "session_brief",
        "session_script",
        "session_audio_clips",
        "session_episode",
    }


def test_partition_and_sensor_present() -> None:
    assert mp.session_digest.partitions_def is sessions
    assert mp.mouthpiece_automation.name == "mouthpiece_automation"


def test_session_script_depends_on_digest() -> None:
    upstream = {k.to_user_string() for k in mp.session_script.dependency_keys}
    assert "session_digest" in upstream


def test_session_brief_sits_between_digest_and_script_and_has_no_retry() -> None:
    """Brief after digest, script after brief; no retry (a paid ~10-min RLM);
    the automation sensor launches it and the module defs carry it."""
    assert {k.to_user_string() for k in mp.session_brief.dependency_keys} == {"session_digest"}
    assert "session_brief" in {k.to_user_string() for k in mp.session_script.dependency_keys}
    assert mp.session_brief.op.retry_policy is None
    repo = mp.defs.get_repository_def()
    targets = mp.mouthpiece_automation.asset_selection.resolve(repo.asset_graph)
    assert {"session_brief", "session_script"} <= {k.to_user_string() for k in targets}


def test_llm_model_is_mouthpieces_own_pin_with_the_shared_default_as_fallback() -> None:
    """clean/enrich/script use mouthpiece's OWN `mouthpiece.model` pin, not the shared
    `llm.default-model` (linguist's judge) and not the client constant; an empty pin falls
    back to the shared default."""
    from astra_pipeline_resources.testing import FakeConfig

    cfg = FakeConfig().cfg
    cfg.mouthpiece.model = "test/mouthpiece-pin"
    cfg.llm.default_model = "test/shared-default"
    assert mp._llm_model(cfg) == "test/mouthpiece-pin"
    cfg.mouthpiece.model = ""
    assert mp._llm_model(cfg) == "test/shared-default"


def test_script_model_overrides_the_pin_for_the_script_only() -> None:
    """session_script reads `mouthpiece.script-model` (Kimi `kimi-k3.1-pro`); clean/enrich keep
    `mouthpiece.model`. An empty script-model falls back to the pin."""
    from astra_pipeline_resources.testing import FakeConfig

    cfg = FakeConfig().cfg
    cfg.mouthpiece.model = "test/mouthpiece-pin"
    cfg.mouthpiece.script_model = "test/script-model"
    assert mp._script_model(cfg) == "test/script-model"
    assert mp._llm_model(cfg) == "test/mouthpiece-pin"
    cfg.mouthpiece.script_model = ""
    assert mp._script_model(cfg) == "test/mouthpiece-pin"


def test_tts_resource_reads_the_configured_provider_and_model() -> None:
    from astra_mouthpiece.resources import TtsResource, default_tts
    from astra_ontology_config import load

    cfg = load().mouthpiece
    tts = default_tts()
    assert (tts.provider, tts.elevenlabs_model, tts.elevenlabs_stability) == (
        cfg.tts_provider,
        cfg.elevenlabs_model,
        cfg.elevenlabs_stability,
    )
    mock = TtsResource(provider="mock", elevenlabs_model="unused", elevenlabs_stability=0.0).build()
    assert type(mock).__name__ == "MockTTSProvider"


def test_elevenlabs_tts_fails_loud_without_key(monkeypatch, tmp_path) -> None:
    """A missing/empty key (what `${KEY:-}` injects when the SOPS entry is absent) raises
    instead of silently falling back to the mock."""
    from astra_mouthpiece.resources import TtsResource

    # An empty env var now counts as unset and falls through to SOPS (0037); point that at
    # a missing file — the in-container state — so a host with the age key can't decrypt.
    monkeypatch.setenv("ELEVENLABS_API_KEY", "")
    monkeypatch.setenv("ASTRA_SOPS_FILE", str(tmp_path / "absent.enc.yaml"))
    with pytest.raises(RuntimeError, match="elevenlabs_api_key"):
        TtsResource(
            provider="elevenlabs", elevenlabs_model="eleven_v4", elevenlabs_stability=0.0
        ).build()


def test_voices_read_the_elevenlabs_ids() -> None:
    from astra_mouthpiece.models import HostConfig, HostPersona

    hosts = HostConfig(
        a=HostPersona(name="Bram", persona="x", voice_id="ea"),
        b=HostPersona(name="Maeve", persona="x", voice_id="eb"),
    )
    voices = mp._voices(hosts)
    assert (voices.a, voices.b, voices.c) == ("ea", "eb", None)


def test_external_api_assets_have_a_retry_policy() -> None:
    """distill/script/clips hit OpenRouter/ElevenLabs → must retry transient outages;
    the local ffmpeg episode assembly needs no retry."""
    for asset in (mp.session_digest, mp.session_script, mp.session_audio_clips):
        policy = asset.op.retry_policy
        assert policy is not None and policy.max_retries >= 1
    assert mp.session_episode.op.retry_policy is None


#: mouthpiece's definitions with linguist's partitioned assets, as the code location loads
#: them (alone, the upstream would be an unpartitioned stub).
DEFS = dg.Definitions.merge(
    mp.defs, dg.Definitions(assets=[session_transcripts, session_episode_summary])
)
EPISODE_GRAPH = {
    "session_digest",
    "session_brief",
    "session_script",
    "session_audio_clips",
    "session_episode",
}


class _Ticker:
    def __init__(self, instance: dg.DagsterInstance) -> None:
        self.instance, self.cursor = instance, None

    def __call__(self) -> list[str | None]:
        requests, self.cursor = automation_tick(
            DEFS, "mouthpiece_automation", self.instance, self.cursor
        )
        for request in requests:
            assert {k.to_user_string() for k in request.asset_selection or []} == EPISODE_GRAPH
        return [r.partition_key for r in requests]


def test_automation_runs_new_chronicled_sessions_never_tried(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The chronicle gate is the trigger: a session runs once its episode summary gets a new
    materialization, if it has a canonical transcript and mouthpiece never tried it."""
    for date in ("2026-6-22", "2026-6-29", "2026-7-6", "2026-7-13"):
        (tmp_path / f"000.show.{date}.txt").write_text("x")
    monkeypatch.setattr(mp.linguist_io, "TRANSCRIPT_DIR", tmp_path)
    instance = sessions_instance("2026-6-22", "2026-6-29", "2026-7-6", "2026-8-3")
    # Before the first tick: 2026-6-22 summarized and never tried (it predates the sensor),
    # 2026-6-29 already has an episode run, 2026-7-6 failed.
    mark_materialized(instance, "session_episode_summary", "2026-6-22", "2026-6-29", "2026-7-6")
    mark_materialized(instance, "session_digest", "2026-6-29")
    fail_partition(instance, "session_digest", "2026-7-6")  # failed stays failed
    tick = _Ticker(instance)
    assert tick() == []

    # New: 2026-7-13 summarized; 2026-8-3 has no canonical transcript (an unmatched
    # campaign). The summaries of 2026-6-29 and 2026-7-6 are re-run by hand.
    instance.add_dynamic_partitions("sessions", ["2026-7-13"])
    mark_materialized(
        instance, "session_episode_summary", "2026-7-13", "2026-8-3", "2026-6-29", "2026-7-6"
    )
    assert tick() == ["2026-7-13"]
    assert tick() == []


def test_automation_waits_for_the_sessions_migration(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "000.show.2026-6-22.txt").write_text("x")
    monkeypatch.setattr(mp.linguist_io, "TRANSCRIPT_DIR", tmp_path)
    instance = sessions_instance("2026-6-22")
    instance.add_dynamic_partitions("mouthpiece_sessions", ["2026-6-22"])
    tick = _Ticker(instance)
    tick()
    mark_materialized(instance, "session_episode_summary", "2026-6-22")
    assert tick() == []


def test_session_digest_waits_on_the_transcript_and_the_chronicle_summary() -> None:
    assert mp.session_digest.partitions_def is sessions
    assert {k.to_user_string() for k in mp.session_digest.dependency_keys} == {
        "session_transcripts",
        "session_episode_summary",
    }
