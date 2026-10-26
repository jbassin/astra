"""Test stand-ins for the shared resources, for ``dg.materialize(resources=...)``.

Dagster passes a plain object through to the asset unchanged, so a fake only needs the
methods the asset calls. (A ``ConfigurableResource`` subclass would not do: Dagster rebuilds
resources from their fields and drops private state.)
"""

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import dagster as dg
from astra_config import Config

from . import PipelinePaths, loaded_config
from .partitions import SESSIONS_NAME, sessions


def paths_under(root: Path) -> PipelinePaths:
    """Every pipeline path under ``root``, one subdir each (nothing is created)."""
    return PipelinePaths(
        scribe_incoming=str(root / "scribe" / "incoming"),
        scribe_tmp=str(root / "scribe" / "tmp"),
        scribe_data=str(root / "scribe" / "data"),
        linguist_saved=str(root / "scribe" / "data" / "saved"),
        linguist_data=str(root / "linguist" / "data"),
        linguist_script=str(root / "linguist" / "script"),
        linguist_transcripts=str(root / "linguist" / "transcripts"),
        linguist_timeline=str(root / "linguist" / "timeline"),
        akasha_content=str(root / "akasha" / "content"),
        mouthpiece_episodes=str(root / "mouthpiece" / "episodes"),
        heartwood_requests=str(root / "heartwood" / "requests"),
    )


class FakeConfig:
    """`AstraConfig` over a given `Config` (default: a deep copy of the real one to edit)."""

    def __init__(self, cfg: Config | None = None) -> None:
        self.cfg = cfg if cfg is not None else loaded_config().model_copy(deep=True)

    def get(self) -> Config:
        return self.cfg


class FakeLlm:
    """`LlmResource` that hands out one stub client and records each ``caller`` asked for."""

    def __init__(self, client: Any) -> None:
        self.stub = client
        self.callers: list[str] = []

    @property
    def clients(self) -> int:
        return len(self.callers)

    def client(self, caller: str) -> Any:
        self.callers.append(caller)
        return self.stub


def sessions_instance(*keys: str) -> dg.DagsterInstance:
    """An ephemeral instance whose shared ``sessions`` set holds ``keys``."""
    instance = dg.DagsterInstance.ephemeral()
    instance.add_dynamic_partitions(SESSIONS_NAME, list(keys))
    return instance


@contextmanager
def stored_sessions_instance(*keys: str) -> Iterator[dg.DagsterInstance]:
    """Like `sessions_instance`, on a temporary instance that also stores sensor rows."""
    with dg.instance_for_test() as instance:
        instance.add_dynamic_partitions(SESSIONS_NAME, list(keys))
        yield instance


def mark_materialized(instance: dg.DagsterInstance, asset: str, *keys: str) -> None:
    """Record a runless materialization of ``asset`` for each session key."""
    for key in keys:
        instance.report_runless_asset_event(dg.AssetMaterialization(asset, partition=key))


def fail_partition(
    instance: dg.DagsterInstance, asset: str, key: str, partitions: str = SESSIONS_NAME
) -> None:
    """Record a failed run of ``asset`` for session ``key`` (a stand-in with the same key),
    partitioned by the dynamic set named ``partitions``."""
    partitions_def = (
        sessions if partitions == SESSIONS_NAME else dg.DynamicPartitionsDefinition(name=partitions)
    )

    @dg.asset(name=asset, partitions_def=partitions_def)
    def _fails() -> None:
        raise RuntimeError("failed on purpose")

    dg.materialize([_fails], partition_key=key, instance=instance, raise_on_error=False)


def queue_partition(instance: dg.DagsterInstance, asset: str, key: str) -> dg.DagsterRun:
    """Create a run of ``asset`` for session ``key`` and leave it queued, as the daemon
    does when it submits a run request. Creating it records the planned materialization."""

    @dg.asset(name=asset, partitions_def=sessions)
    def _never_runs() -> None: ...

    job = dg.Definitions(assets=[_never_runs]).resolve_implicit_global_asset_job_def()
    return instance.create_run_for_job(
        job_def=job, asset_selection=frozenset({_never_runs.key}), tags={"dagster/partition": key}
    )


def cancel_partition(instance: dg.DagsterInstance, asset: str, key: str) -> str:
    """Create a run of ``asset`` for session ``key`` and cancel it; return its run id.

    Dagster's partition status reports a canceled run as neither failed nor materialized,
    the case that would make a launch rule relaunch a terminated paid run."""
    run = queue_partition(instance, asset, key)
    instance.report_run_canceled(run)
    return run.run_id


def automation_tick(
    defs: dg.Definitions, sensor: str, instance: dg.DagsterInstance, cursor: str | None = None
) -> tuple[list[dg.RunRequest], str | None]:
    """One tick of the automation sensor ``sensor`` in ``defs``: its run requests and the
    cursor to pass to the next tick. Nothing is launched; the daemon would submit them."""
    repo = defs.get_repository_def()
    context = dg.build_sensor_context(instance=instance, repository_def=repo, cursor=cursor)
    data = repo.get_sensor_def(sensor).evaluate_tick(context)
    return list(data.run_requests or []), data.cursor


def seed_sensor_state(
    instance: dg.DagsterInstance, name: str, *, cursor: str | None = None, running: bool = False
) -> None:
    """Store a sensor's instigator row, as the daemon leaves it: its status and cursor."""
    from dagster._core.remote_origin import (
        RegisteredCodeLocationOrigin,
        RemoteInstigatorOrigin,
        RemoteRepositoryOrigin,
    )
    from dagster._core.scheduler.instigation import (
        InstigatorState,
        InstigatorStatus,
        InstigatorType,
        SensorInstigatorData,
    )

    repo = RemoteRepositoryOrigin(RegisteredCodeLocationOrigin("astra-pipeline"), "__repository__")
    instance.add_instigator_state(
        InstigatorState(
            RemoteInstigatorOrigin(repo, name),
            InstigatorType.SENSOR,
            InstigatorStatus.RUNNING if running else InstigatorStatus.STOPPED,
            SensorInstigatorData(cursor=cursor),
        )
    )
