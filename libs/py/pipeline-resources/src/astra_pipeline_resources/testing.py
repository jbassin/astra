"""Test stand-ins for the shared resources, for ``dg.materialize(resources=...)``.

Dagster passes a plain object through to the asset unchanged, so a fake only needs the
methods the asset calls. (A ``ConfigurableResource`` subclass would not do: Dagster rebuilds
resources from their fields and drops private state.)
"""

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
    """`LlmResource` that hands out one stub client and counts how often it was asked."""

    def __init__(self, client: Any) -> None:
        self.stub = client
        self.clients = 0

    def client(self) -> Any:
        self.clients += 1
        return self.stub


def sessions_instance(*keys: str) -> dg.DagsterInstance:
    """An ephemeral instance whose shared ``sessions`` set holds ``keys``."""
    instance = dg.DagsterInstance.ephemeral()
    instance.add_dynamic_partitions(SESSIONS_NAME, list(keys))
    return instance


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


def cancel_partition(instance: dg.DagsterInstance, asset: str, key: str) -> str:
    """Create a run of ``asset`` for session ``key`` and cancel it; return its run id.

    Dagster's partition status reports a canceled run as neither failed nor materialized,
    the case that would make a sensor relaunch a terminated paid run."""

    @dg.asset(name=asset, partitions_def=sessions)
    def _never_runs() -> None: ...

    job = dg.Definitions(assets=[_never_runs]).resolve_implicit_global_asset_job_def()
    run = instance.create_run_for_job(
        job_def=job, asset_selection=frozenset({_never_runs.key}), tags={"dagster/partition": key}
    )
    instance.report_run_canceled(run)
    return run.run_id
