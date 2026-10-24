"""The code location loads, and its names are exactly the pinned set (0037 PIPE-15).

Dagster keys run history, dynamic partitions and sensor cursors on these names, so a
rename silently orphans that state. A change here must be deliberate: update the pinned
set in the same commit, and read the dagster README's "Add or rename a stage" first.
"""

from types import ModuleType

import dagster as dg

ASSETS = {
    "campaign_timeline",
    "session_audio",
    "session_audio_clips",
    "session_brief",
    "session_cleanup",
    "session_digest",
    "session_episode",
    "session_episode_summary",
    "session_script",
    "session_tracks",
    "session_transcript",
    "session_transcripts",
    "session_wiki",
}
#: The explicit job, the implicit all-assets job, and one anonymous job per asset sensor.
JOBS = {
    "__ASSET_JOB",
    "__anonymous_asset_job_craig_drop_sensor",
    "__anonymous_asset_job_heartwood_sensor",
    "__anonymous_asset_job_linguist_output_sensor",
    "__anonymous_asset_job_scribe_output_sensor",
    "campaign_timeline_job",
}
SCHEDULES = {"campaign_timeline_schedule"}
SENSORS = {
    "craig_drop_sensor",
    "heartwood_sensor",
    "linguist_output_sensor",
    "pipeline_failure_alert",
    "scribe_output_sensor",
}
PARTITIONS = {"heartwood_sessions", "linguist_sessions", "mouthpiece_sessions", "scribe_sessions"}
#: The resources the assets declare as parameters (0037 PIPE-16); a key is a parameter name.
RESOURCES = {"astra_config", "llm", "pipeline_paths", "tts"}


def _repo(definitions: ModuleType) -> dg.RepositoryDefinition:
    return definitions.defs.get_repository_def()


def test_definitions_are_loadable(definitions: ModuleType) -> None:
    dg.Definitions.validate_loadable(definitions.defs)


def test_asset_keys_are_pinned(definitions: ModuleType) -> None:
    keys = {key.to_user_string() for key in _repo(definitions).assets_defs_by_key}
    assert keys == ASSETS


def test_jobs_schedules_and_sensors_are_pinned(definitions: ModuleType) -> None:
    repo = _repo(definitions)
    assert set(repo.job_names) == JOBS
    assert {s.name for s in repo.schedule_defs} == SCHEDULES
    assert {s.name for s in repo.sensor_defs} == SENSORS


def test_resource_keys_are_pinned(definitions: ModuleType) -> None:
    assert set(_repo(definitions).get_top_level_resources()) == RESOURCES


def test_schedules_and_sensors_start_running(definitions: ModuleType) -> None:
    """A deploy must not leave the pipeline paused: every schedule and sensor defaults on."""
    repo = _repo(definitions)
    schedules = [
        s.name for s in repo.schedule_defs if s.default_status != dg.DefaultScheduleStatus.RUNNING
    ]
    sensors = [
        s.name for s in repo.sensor_defs if s.default_status != dg.DefaultSensorStatus.RUNNING
    ]
    assert schedules == []
    assert sensors == []


def test_dynamic_partition_names_are_pinned(definitions: ModuleType) -> None:
    names = {
        a.partitions_def.name
        for a in _repo(definitions).assets_defs_by_key.values()
        if isinstance(a.partitions_def, dg.DynamicPartitionsDefinition)
    }
    assert names == PARTITIONS
