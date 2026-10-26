"""The shared sessions set: the stages' launch rule and the migration guard."""

import dagster as dg
from astra_pipeline_resources.partitions import (
    MIGRATION_MARKER,
    blocked_sessions,
    migration_pending,
    ready_sessions,
    session_check,
    sessions,
)
from astra_pipeline_resources.testing import (
    cancel_partition,
    fail_partition,
    mark_materialized,
    sessions_instance,
)

UP, STAGE = dg.AssetKey("session_transcripts"), dg.AssetKey("session_wiki")


def test_ready_sessions_needs_upstream_done_and_stage_never_tried() -> None:
    instance = sessions_instance("a", "b", "c", "d", "e")
    mark_materialized(instance, "session_transcripts", "a", "b", "c", "d")
    mark_materialized(instance, "session_wiki", "b")
    fail_partition(instance, "session_wiki", "c")
    assert ready_sessions(instance, upstream=UP, stage=STAGE) == ["a", "d"]
    assert ready_sessions(instance, upstream=UP, stage=STAGE, keep=lambda k: k != "d") == ["a"]
    assert ready_sessions(instance, upstream=UP, stage=STAGE, keys=["d", "b", "zz"]) == ["d"]


def test_a_canceled_run_counts_as_tried() -> None:
    """Terminating a runaway paid run must not make the stage relaunch."""
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


def test_migration_pending_only_with_legacy_partitions_and_no_marker() -> None:
    instance = sessions_instance()
    assert not migration_pending(instance)  # a fresh instance
    instance.add_dynamic_partitions("heartwood_sessions", ["a"])
    assert migration_pending(instance)
    marker = "pipe-4b"  # decision-ids: ignore[lane-slug] -- the stored marker value
    instance.run_storage.set_cursor_values({MIGRATION_MARKER: marker})
    assert not migration_pending(instance)
    instance.run_storage.set_cursor_values({MIGRATION_MARKER: ""})  # blanked by --down
    assert migration_pending(instance)


# ── blocking checks gate the next stage ──────────────────────────────────────
@dg.asset(name="session_transcripts", partitions_def=sessions)
def _upstream() -> None: ...


@session_check(asset=_upstream, name="not_empty", description="the session is not 'bad'")
def _not_empty(context: dg.AssetCheckExecutionContext) -> dg.AssetCheckResult:
    return dg.AssetCheckResult(passed=context.partition_key != "bad")


GATE = dg.AssetCheckKey(UP, "not_empty")


def _check_run(instance: dg.DagsterInstance, key: str) -> None:
    dg.materialize(
        [_upstream, _not_empty], partition_key=key, instance=instance, raise_on_error=False
    )


def test_a_failed_blocking_check_keeps_the_next_stage_from_launching() -> None:
    """A failed blocking check leaves its asset materialized, so only the gate stops the
    next stage. A session with no check result (processed before the check) still goes."""
    instance = sessions_instance("bad", "good", "old")
    _check_run(instance, "bad")
    _check_run(instance, "good")
    mark_materialized(instance, "session_transcripts", "old")
    assert instance.get_materialized_partitions(UP) == {"bad", "good", "old"}
    assert blocked_sessions(instance, [GATE]) == {"bad"}
    assert ready_sessions(instance, upstream=UP, stage=STAGE) == ["bad", "good", "old"]
    assert ready_sessions(instance, upstream=UP, stage=STAGE, gates=[GATE]) == ["good", "old"]


def test_a_later_pass_opens_the_gate() -> None:
    instance = sessions_instance("bad")
    _check_run(instance, "bad")
    assert blocked_sessions(instance, [GATE]) == {"bad"}
    instance.report_runless_asset_event(
        dg.AssetCheckEvaluation(asset_key=UP, check_name="not_empty", passed=True, partition="bad")
    )
    assert blocked_sessions(instance, [GATE]) == set()
