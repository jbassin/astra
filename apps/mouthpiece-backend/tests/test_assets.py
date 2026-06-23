"""Dagster wiring structure test (gate J) — the code location builds; no live run.

Importing the assets builds `dg.Definitions` (Dagster validates the dep graph at
construction); this asserts the 4-asset graph + mega + the linguist sensor are
present with the expected keys.
"""

from __future__ import annotations

import dagster as dg
import pytest
from astra_mouthpiece import assets as mp


def test_defs_builds() -> None:
    assert isinstance(mp.defs, dg.Definitions)


def test_the_four_assets_plus_mega_and_index_have_expected_keys() -> None:
    keys = {
        mp.session_digest.key.to_user_string(),
        mp.session_script.key.to_user_string(),
        mp.session_audio_clips.key.to_user_string(),
        mp.session_episode.key.to_user_string(),
        mp.mega_digest.key.to_user_string(),
        mp.episodes_index.key.to_user_string(),
    }
    assert keys == {
        "session_digest",
        "session_script",
        "session_audio_clips",
        "session_episode",
        "mega_digest",
        "episodes_index",
    }


def test_partition_and_sensor_present() -> None:
    assert mp.mouthpiece_sessions.name == "mouthpiece_sessions"
    assert mp.linguist_output_sensor.name == "linguist_output_sensor"


def test_session_script_depends_on_digest() -> None:
    upstream = {k.to_user_string() for k in mp.session_script.dependency_keys}
    assert "session_digest" in upstream


def test_external_api_assets_have_a_retry_policy() -> None:
    """distill/script/clips hit Anthropic/ElevenLabs → must retry transient outages;
    the local ffmpeg episode assembly needs no retry."""
    for asset in (mp.session_digest, mp.session_script, mp.session_audio_clips):
        policy = asset.op.retry_policy
        assert policy is not None and policy.max_retries >= 1
    assert mp.session_episode.op.retry_policy is None


def test_linguist_sensor_first_eval_adopts_backlog_without_running(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """First eval (cursor=None) registers the existing transcripts but emits NO runs —
    so re-enabling never reprocesses the migrated-at-rest seed data."""
    monkeypatch.setattr(
        mp.linguist_io, "new_sessions", lambda _existing: {"2025-10-20": "p1", "2025-10-27": "p2"}
    )
    result = mp.linguist_output_sensor(
        dg.build_sensor_context(instance=dg.DagsterInstance.ephemeral(), cursor=None)
    )
    assert isinstance(result, dg.SensorResult)
    assert not result.run_requests  # adopted, not run
    assert result.dynamic_partitions_requests  # but registered as known partitions
    assert result.cursor == "adopted"


def test_linguist_sensor_runs_new_sessions_after_adoption(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Once adopted (cursor set), a transcript that appears later IS run."""
    monkeypatch.setattr(mp.linguist_io, "new_sessions", lambda _existing: {"2026-6-22": "p"})
    result = mp.linguist_output_sensor(
        dg.build_sensor_context(instance=dg.DagsterInstance.ephemeral(), cursor="adopted")
    )
    assert isinstance(result, dg.SensorResult)
    assert [rr.partition_key for rr in result.run_requests or []] == ["2026-6-22"]
    assert result.dynamic_partitions_requests
