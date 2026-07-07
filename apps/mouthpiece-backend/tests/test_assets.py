"""Dagster wiring structure test (gate J) — the code location builds; no live run.

Importing the assets builds `dg.Definitions` (Dagster validates the dep graph at
construction); this asserts the 4-asset graph + the linguist sensor are
present with the expected keys.
"""

from __future__ import annotations

import dagster as dg
import pytest
from astra_mouthpiece import assets as mp


def test_defs_builds() -> None:
    assert isinstance(mp.defs, dg.Definitions)


def test_the_four_assets_plus_index_have_expected_keys() -> None:
    keys = {
        mp.session_digest.key.to_user_string(),
        mp.session_script.key.to_user_string(),
        mp.session_audio_clips.key.to_user_string(),
        mp.session_episode.key.to_user_string(),
        mp.episodes_index.key.to_user_string(),
    }
    assert keys == {
        "session_digest",
        "session_script",
        "session_audio_clips",
        "session_episode",
        "episodes_index",
    }


def test_partition_and_sensor_present() -> None:
    assert mp.mouthpiece_sessions.name == "mouthpiece_sessions"
    assert mp.linguist_output_sensor.name == "linguist_output_sensor"


def test_session_script_depends_on_digest() -> None:
    upstream = {k.to_user_string() for k in mp.session_script.dependency_keys}
    assert "session_digest" in upstream


def test_llm_model_comes_from_config_not_the_client_constant() -> None:
    """distill/script use the configured `llm.default-model` (config-single-source),
    so changing config.kdl actually moves the pipeline's model."""
    from astra_ontology_config import load

    assert mp._llm_model() == load().llm.default_model


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


def _added_keys(result: dg.SensorResult) -> list[str]:
    return sorted(k for r in result.dynamic_partitions_requests or [] for k in r.partition_keys)


def test_linguist_sensor_runs_ready_session_after_adoption(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Once adopted, a transcript whose chronicle episode is ready IS run + partitioned."""
    monkeypatch.setattr(mp.linguist_io, "new_sessions", lambda _existing: {"2026-6-22": "p"})
    monkeypatch.setattr(mp.linguist_io, "chronicle_gate_open", lambda _date: True)
    result = mp.linguist_output_sensor(
        dg.build_sensor_context(instance=dg.DagsterInstance.ephemeral(), cursor="adopted")
    )
    assert isinstance(result, dg.SensorResult)
    assert [rr.partition_key for rr in result.run_requests or []] == ["2026-6-22"]
    assert _added_keys(result) == ["2026-6-22"]


def test_linguist_sensor_defers_session_without_chronicle_episode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A matched session whose episode hasn't landed is NOT run AND NOT partitioned — it
    stays re-discoverable and fires the eval its episode appears (0021 Change B gate)."""
    monkeypatch.setattr(mp.linguist_io, "new_sessions", lambda _existing: {"2026-7-1": "p"})
    monkeypatch.setattr(mp.linguist_io, "chronicle_gate_open", lambda _date: False)
    result = mp.linguist_output_sensor(
        dg.build_sensor_context(instance=dg.DagsterInstance.ephemeral(), cursor="adopted")
    )
    assert isinstance(result, dg.SensorResult)
    assert not result.run_requests  # deferred — waits for chronicle
    assert not result.dynamic_partitions_requests  # un-partitioned → still "new" next eval


def test_linguist_sensor_gate_runs_ready_and_carve_out_defers_rest(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Mixed eval: a chronicled session + an excluded/unmatched one (carve-out) both run;
    a matched-but-unchronicled session is deferred (no run, not partitioned)."""
    monkeypatch.setattr(
        mp.linguist_io,
        "new_sessions",
        lambda _existing: {"2026-6-22": "p1", "2025-8-11": "p2", "2026-7-1": "p3"},
    )
    # 2026-6-22 chronicled; 2025-8-11 excluded (carve-out → gate open); 2026-7-1 deferred.
    ready = {"2026-6-22", "2025-8-11"}
    monkeypatch.setattr(mp.linguist_io, "chronicle_gate_open", lambda date: date in ready)
    result = mp.linguist_output_sensor(
        dg.build_sensor_context(instance=dg.DagsterInstance.ephemeral(), cursor="adopted")
    )
    assert isinstance(result, dg.SensorResult)
    ran = sorted(rr.partition_key for rr in result.run_requests or [])
    assert ran == ["2025-8-11", "2026-6-22"]  # ready + carve-out run
    assert _added_keys(result) == ["2025-8-11", "2026-6-22"]  # the deferred one is NOT partitioned
