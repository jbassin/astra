"""The code location loads, and its names are exactly the pinned set.

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
#: The implicit all-assets job and one anonymous job per asset sensor.
JOBS = {
    "__ASSET_JOB",
    "__anonymous_asset_job_campaign_timeline_sensor",
    "__anonymous_asset_job_craig_drop_sensor",
    "__anonymous_asset_job_heartwood_sensor",
    "__anonymous_asset_job_linguist_output_sensor",
    "__anonymous_asset_job_scribe_output_sensor",
}
#: None since 0037 pipe-10: `campaign_timeline_sensor` replaced the hourly schedule.
SCHEDULES: set[str] = set()
SENSORS = {
    "campaign_timeline_sensor",
    "craig_drop_sensor",
    "heartwood_sensor",
    "linguist_output_sensor",
    "pipeline_failure_alert",
    "scribe_output_sensor",
}
#: One shared set since 0037 pipe-4b (``astra_pipeline_resources.partitions``).
PARTITIONS = {"sessions"}
#: The cross-app dependencies (0037 pipe-4b): downstream asset -> its upstream assets.
CROSS_APP_DEPS = {
    "session_transcripts": {"session_transcript"},
    "session_digest": {"session_transcripts", "session_episode_summary"},
    "session_wiki": {"session_transcripts"},
}
#: The resources the assets declare as parameters; a key is a parameter name.
RESOURCES = {"astra_config", "llm", "pipeline_paths", "tts"}
#: The blocking per-session checks, as ``asset:check``.
CHECKS = {
    "session_tracks:no_undated_recording",
    "session_tracks:single_recording",
    "session_transcript:transcript_not_empty",
}


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


def test_cross_app_dependencies_are_real_edges(definitions: ModuleType) -> None:
    """The apps hand off through asset dependencies, and every upstream is a real asset of
    this code location (not an external stub left by a typo in a key)."""
    graph = _repo(definitions).asset_graph
    for asset, upstream in CROSS_APP_DEPS.items():
        node = graph.get(dg.AssetKey(asset))
        assert {k.to_user_string() for k in node.parent_keys} == upstream
        for key in node.parent_keys:
            assert graph.get(key).is_materializable


def test_every_partitioned_asset_shares_the_sessions_set(definitions: ModuleType) -> None:
    from astra_pipeline_resources.partitions import sessions

    defs = [a.partitions_def for a in _repo(definitions).assets_defs_by_key.values()]
    assert {id(d) for d in defs if d is not None} == {id(sessions)}


def test_asset_checks_are_pinned_blocking_and_per_session(definitions: ModuleType) -> None:
    from astra_pipeline_resources.partitions import sessions

    graph = _repo(definitions).asset_graph
    keys = graph.asset_check_keys
    assert {f"{k.asset_key.to_user_string()}:{k.name}" for k in keys} == CHECKS
    for key in keys:
        spec = graph.get_check_spec(key)
        assert spec.blocking
        assert spec.partitions_def is sessions


def test_stage_gates_name_real_checks_on_their_upstream(definitions: ModuleType) -> None:
    """A gate with a typo would never block: it must be a check of this code location."""
    from astra_heartwood.assets import HEARTWOOD_STAGE
    from astra_linguist.assets import LINGUIST_STAGE
    from astra_mouthpiece.assets import MOUTHPIECE_STAGE

    keys = _repo(definitions).asset_graph.asset_check_keys
    for stage in (LINGUIST_STAGE, MOUTHPIECE_STAGE, HEARTWOOD_STAGE):
        for gate in stage.gates:
            assert gate in keys
            assert gate.asset_key == stage.upstream
    assert [g.name for g in LINGUIST_STAGE.gates] == ["transcript_not_empty"]
