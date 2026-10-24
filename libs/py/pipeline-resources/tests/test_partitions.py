"""The shared sessions set: the sensors' launch rule, their ledger and the migration guard."""

import dagster as dg
from astra_pipeline_resources.partitions import (
    MIGRATION_MARKER,
    SessionStage,
    launch_ready,
    migration_pending,
    read_ledger,
    ready_sessions,
    sessions,
)
from astra_pipeline_resources.testing import (
    cancel_partition,
    fail_partition,
    mark_materialized,
    sessions_instance,
)

UP, STAGE = dg.AssetKey("session_transcripts"), dg.AssetKey("session_wiki")
WIKI = SessionStage(upstream=UP, stage=STAGE, keep=lambda _key: True)


def test_ready_sessions_needs_upstream_done_and_stage_never_tried() -> None:
    instance = sessions_instance("a", "b", "c", "d", "e")
    mark_materialized(instance, "session_transcripts", "a", "b", "c", "d")
    mark_materialized(instance, "session_wiki", "b")
    fail_partition(instance, "session_wiki", "c")
    assert ready_sessions(instance, upstream=UP, stage=STAGE) == ["a", "d"]
    assert ready_sessions(instance, upstream=UP, stage=STAGE, keep=lambda k: k != "d") == ["a"]
    assert ready_sessions(instance, upstream=UP, stage=STAGE, launched={"a"}) == ["d"]


def test_a_canceled_run_counts_as_tried() -> None:
    """Terminating a runaway paid run in the UI must not make the sensor relaunch it."""
    instance = sessions_instance("a")
    mark_materialized(instance, "session_transcripts", "a")
    cancel_partition(instance, "session_wiki", "a")
    # Dagster's partition status does not see the canceled run at all...
    assert instance.get_status_by_partition(STAGE, ["a"], sessions) == {"a": None}
    # ...but its planned materialization counts as tried.
    assert ready_sessions(instance, upstream=UP, stage=STAGE) == []


def test_ready_sessions_ignores_a_materialization_outside_the_set() -> None:
    instance = sessions_instance("a")
    mark_materialized(instance, "session_transcripts", "a", "zz")
    assert ready_sessions(instance, upstream=UP, stage=STAGE) == ["a"]


def _tick(instance: dg.DagsterInstance, cursor: str | None) -> dg.SensorResult:
    return launch_ready(dg.build_sensor_context(instance=instance, cursor=cursor), WIKI)


def test_a_deleted_run_is_not_relaunched() -> None:
    """Each request carries a run key, and the cursor ledger remembers the session even
    after its run, and the run's events, are deleted."""
    instance = sessions_instance("a")
    mark_materialized(instance, "session_transcripts", "a")
    first = _tick(instance, "adopted")  # an old cursor reads as an empty ledger
    (request,) = first.run_requests or []
    assert (request.partition_key, request.run_key) == ("a", "session_wiki:a")
    assert read_ledger(first.cursor) == {"a"}

    run_id = cancel_partition(instance, "session_wiki", "a")
    instance.delete_run(run_id)
    assert ready_sessions(instance, upstream=UP, stage=STAGE) == ["a"]  # the instance forgot
    again = _tick(instance, first.cursor)
    assert not again.run_requests
    assert again.cursor is None  # nothing new: the daemon keeps the ledger as it is


def test_migration_pending_only_with_legacy_partitions_and_no_marker() -> None:
    instance = sessions_instance()
    assert not migration_pending(instance)  # a fresh instance
    instance.add_dynamic_partitions("heartwood_sessions", ["a"])
    assert migration_pending(instance)
    instance.run_storage.set_cursor_values({MIGRATION_MARKER: "pipe-4b"})
    assert not migration_pending(instance)
    instance.run_storage.set_cursor_values({MIGRATION_MARKER: ""})  # blanked by --down
    assert migration_pending(instance)


def test_launch_ready_skips_while_the_migration_is_pending() -> None:
    instance = sessions_instance("a")
    instance.add_dynamic_partitions("heartwood_sessions", ["a"])
    mark_materialized(instance, "session_transcripts", "a")
    result = _tick(instance, None)
    assert not result.run_requests and result.skip_reason
