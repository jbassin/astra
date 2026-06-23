"""Dagster wiring structure test (gate J) — the code location builds; no live run.

Importing the assets builds `dg.Definitions` (Dagster validates the dep graph at
construction); this asserts the 4-asset graph + mega + the linguist sensor are
present with the expected keys.
"""

from __future__ import annotations

import dagster as dg
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
