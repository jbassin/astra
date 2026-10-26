"""The stage automation conditions launch exactly what the old stage sensors launched.

A toy stage on the shared ``sessions`` set: ``upstream`` (with a blocking check) feeds
``stage`` (the stage's first asset, `stage_automation`) and ``after`` (`follows`). Each
test seeds an ephemeral instance and ticks the real automation sensor (`stage_sensor`),
which only returns run requests; nothing runs. The rules: launch when the gates pass, at
most once per session, never after any run of the stage, and never for a session that
existed before the sensor's first tick.
"""

from collections.abc import Callable, Iterator

import dagster as dg
import pytest
from astra_pipeline_resources.partitions import (
    MIGRATION_MARKER,
    SessionStage,
    follows,
    session_check,
    sessions,
    stage_automation,
    stage_sensor,
)
from astra_pipeline_resources.stage_audit import adopt
from astra_pipeline_resources.testing import (
    automation_tick,
    cancel_partition,
    fail_partition,
    mark_materialized,
    queue_partition,
    sessions_instance,
)

#: Sessions whose stage file check fails (the stand-in for "no script.json").
NO_FILES: set[str] = set()
#: Sessions whose upstream check fails (the stand-in for an empty transcript).
EMPTY: set[str] = set()


@pytest.fixture(autouse=True)
def _reset() -> Iterator[None]:
    NO_FILES.clear()
    EMPTY.clear()
    yield
    NO_FILES.clear()
    EMPTY.clear()


@dg.asset(name="upstream", partitions_def=sessions)
def upstream() -> None: ...


@session_check(asset=upstream, name="not_empty", description="the session is not empty")
def not_empty(context: dg.AssetCheckExecutionContext) -> dg.AssetCheckResult:
    return dg.AssetCheckResult(passed=context.partition_key not in EMPTY)


STAGE = SessionStage(
    upstream=upstream.key,
    stage=dg.AssetKey("stage"),
    keep=lambda key: key not in NO_FILES,
    gates=(dg.AssetCheckKey(upstream.key, "not_empty"),),
)


@dg.asset(
    name="stage",
    partitions_def=sessions,
    deps=[upstream],
    automation_condition=stage_automation(STAGE),
)
def stage() -> None: ...


@dg.asset(name="after", partitions_def=sessions, deps=[stage], automation_condition=follows(stage))
def after() -> None: ...


@dg.asset(name="sibling", partitions_def=sessions, deps=[upstream])
def sibling() -> None: ...


RUN_TAGS = {"astra/heartwood": "session_wiki"}
SENSOR = stage_sensor("toy_automation", [stage, after], description="toy", run_tags=RUN_TAGS)
DEFS = dg.Definitions(
    assets=[upstream, stage, after, sibling], asset_checks=[not_empty], sensors=[SENSOR]
)


class Ticker:
    """Ticks the toy sensor and carries its cursor, as the daemon does."""

    def __init__(self, instance: dg.DagsterInstance) -> None:
        self.instance = instance
        self.cursor: str | None = None

    def __call__(self) -> list[dg.RunRequest]:
        requests, self.cursor = automation_tick(DEFS, SENSOR.name, self.instance, self.cursor)
        return requests

    def partitions(self) -> list[str | None]:
        return [r.partition_key for r in self()]


def upstream_done(instance: dg.DagsterInstance, key: str, *, passed: bool | None = True) -> None:
    """Run ``upstream`` and its check for ``key``; ``passed`` is the check's result. None
    records a runless materialization with no check result (a session from before checks)."""
    if passed is None:
        mark_materialized(instance, "upstream", key)
        return
    (EMPTY.discard if passed else EMPTY.add)(key)
    dg.materialize(
        [upstream, not_empty], partition_key=key, instance=instance, raise_on_error=False
    )


def new_session(instance: dg.DagsterInstance, key: str) -> None:
    instance.add_dynamic_partitions("sessions", [key])


#: Every state a session can be in when the sensor first ticks. Each seeds one session.
EXISTING: dict[str, Callable[[dg.DagsterInstance, str], object]] = {
    "never-tried": upstream_done,
    "no-check-result": lambda i, k: upstream_done(i, k, passed=None),
    "check-failed": lambda i, k: upstream_done(i, k, passed=False),
    "no-upstream": lambda _i, _k: None,
    "materialized": lambda i, k: (upstream_done(i, k), mark_materialized(i, "stage", k)),
    "failed": lambda i, k: (upstream_done(i, k), fail_partition(i, "stage", k)),
    "canceled": lambda i, k: (upstream_done(i, k), cancel_partition(i, "stage", k)),
    "queued": lambda i, k: (upstream_done(i, k), queue_partition(i, "stage", k)),
}

#: What the daemon's run for a requested session can end as.
RUN_OUTCOMES: dict[str, Callable[[dg.DagsterInstance, str], object]] = {
    "succeeded": lambda i, k: mark_materialized(i, "stage", k),
    "failed": lambda i, k: fail_partition(i, "stage", k),
    "canceled": lambda i, k: cancel_partition(i, "stage", k),
    "queued": lambda i, k: queue_partition(i, "stage", k),
    "not created yet": lambda _i, _k: None,
}


def existing_instance() -> dg.DagsterInstance:
    instance = sessions_instance(*EXISTING)
    for key, seed in EXISTING.items():
        seed(instance, key)
    return instance


# ── rule: no backfill ────────────────────────────────────────────────────────


def test_the_first_evaluation_requests_nothing_for_existing_sessions() -> None:
    """Dagster's own test entry point and the real sensor agree: zero requests on the first
    evaluation over sessions in every state, and on the next one with nothing new."""
    instance = existing_instance()
    first = dg.evaluate_automation_conditions(defs=DEFS, instance=instance)
    assert first.total_requested == 0
    second = dg.evaluate_automation_conditions(defs=DEFS, instance=instance, cursor=first.cursor)
    assert second.total_requested == 0

    tick = Ticker(instance)
    assert tick() == []
    assert tick() == []


# ── rule: launch when the gates pass, once ───────────────────────────────────


def test_a_new_session_launches_its_whole_stage_in_one_tagged_run() -> None:
    instance = sessions_instance()
    tick = Ticker(instance)
    assert tick() == []
    new_session(instance, "2026-10-29")
    upstream_done(instance, "2026-10-29")

    (request,) = tick()
    assert request.partition_key == "2026-10-29"
    assert set(request.asset_selection or []) == {stage.key, after.key}  # not `sibling`
    assert request.tags.items() >= RUN_TAGS.items()
    assert request.tags["dagster/partition"] == "2026-10-29"
    assert request.run_key is None  # dedup is the condition's job, below


@pytest.mark.parametrize("outcome", RUN_OUTCOMES)
def test_one_request_per_session_whatever_its_run_did(outcome: str) -> None:
    instance = sessions_instance()
    tick = Ticker(instance)
    tick()
    new_session(instance, "2026-10-29")
    upstream_done(instance, "2026-10-29")
    assert tick.partitions() == ["2026-10-29"]
    RUN_OUTCOMES[outcome](instance, "2026-10-29")
    assert tick() == []
    assert tick() == []


def test_two_new_sessions_get_one_run_each() -> None:
    instance = sessions_instance()
    tick = Ticker(instance)
    tick()
    for key in ("2026-10-29", "2026-11-5"):
        new_session(instance, key)
        upstream_done(instance, key)
    assert sorted(k or "" for k in tick.partitions()) == ["2026-10-29", "2026-11-5"]
    assert tick() == []


def test_a_failed_check_holds_the_stage_until_a_pass() -> None:
    """The scribe transcript check: a failed result blocks; a later pass (re-execute from
    failure re-runs only the check) launches the stage without a new upstream run."""
    instance = sessions_instance()
    tick = Ticker(instance)
    tick()
    new_session(instance, "2026-10-29")
    upstream_done(instance, "2026-10-29", passed=False)
    assert tick() == []
    assert tick() == []
    instance.report_runless_asset_event(
        dg.AssetCheckEvaluation(
            asset_key=upstream.key, check_name="not_empty", passed=True, partition="2026-10-29"
        )
    )
    assert tick.partitions() == ["2026-10-29"]


def test_the_file_check_holds_the_stage_until_it_passes() -> None:
    instance = sessions_instance()
    tick = Ticker(instance)
    tick()
    NO_FILES.add("2026-10-29")
    new_session(instance, "2026-10-29")
    upstream_done(instance, "2026-10-29")
    assert tick() == []
    NO_FILES.clear()
    assert tick.partitions() == ["2026-10-29"]


def test_nothing_launches_while_the_sessions_migration_is_pending() -> None:
    instance = sessions_instance()
    instance.add_dynamic_partitions("linguist_sessions", ["2026-6-1"])
    tick = Ticker(instance)
    tick()
    new_session(instance, "2026-10-29")
    upstream_done(instance, "2026-10-29")
    assert tick() == []
    instance.run_storage.set_cursor_values({MIGRATION_MARKER: "done"})
    assert tick.partitions() == ["2026-10-29"]


# ── rule: a re-run upstream never re-launches a tried stage ──────────────────


@pytest.mark.parametrize("outcome", RUN_OUTCOMES)
def test_a_manual_upstream_rerun_never_relaunches_the_stage(outcome: str) -> None:
    instance = sessions_instance()
    tick = Ticker(instance)
    tick()
    new_session(instance, "2026-10-29")
    upstream_done(instance, "2026-10-29")
    assert tick.partitions() == ["2026-10-29"]
    RUN_OUTCOMES[outcome](instance, "2026-10-29")
    upstream_done(instance, "2026-10-29")  # re-run by hand
    assert tick() == []
    assert tick() == []


@pytest.mark.parametrize("state", ["materialized", "failed", "canceled", "queued"])
def test_a_manual_upstream_rerun_of_an_old_session_never_launches_a_tried_stage(
    state: str,
) -> None:
    instance = existing_instance()
    tick = Ticker(instance)
    assert tick() == []
    upstream_done(instance, state)
    assert tick() == []


def test_a_deleted_run_is_not_relaunched() -> None:
    """Deleting a run deletes its planned materialization; the condition's own memory of
    what it requested still holds the session back (the old sensors' run key)."""
    instance = sessions_instance()
    tick = Ticker(instance)
    tick()
    new_session(instance, "2026-10-29")
    upstream_done(instance, "2026-10-29")
    assert tick.partitions() == ["2026-10-29"]
    instance.delete_run(cancel_partition(instance, "stage", "2026-10-29"))
    upstream_done(instance, "2026-10-29")
    assert tick() == []


def test_an_old_never_tried_session_launches_on_a_new_upstream_run() -> None:
    """The stage was never tried for it, so a new upstream materialization launches it, as
    the old sensors' rule would have. Only a stage already tried is protected."""
    instance = existing_instance()
    tick = Ticker(instance)
    assert tick() == []
    upstream_done(instance, "never-tried")
    assert tick.partitions() == ["never-tried"]


def test_the_later_assets_never_launch_on_their_own() -> None:
    instance = sessions_instance("2026-10-29")
    tick = Ticker(instance)
    tick()
    mark_materialized(instance, "stage", "2026-10-29")
    assert tick() == []


def test_an_adopted_old_session_never_launches() -> None:
    """The adoption a held session gets before the sensors start: a later upstream re-run
    launches nothing, like any other tried stage."""
    instance = existing_instance()
    adopt(instance, STAGE, ["never-tried"])
    tick = Ticker(instance)
    assert tick() == []
    upstream_done(instance, "never-tried")
    assert tick() == []
