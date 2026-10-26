"""Read-only pre-flight for the stage automation sensors: would they launch anything now?

Run it in ``dagster-code`` before starting the sensors (``just pipeline-automation-preflight``).
It evaluates each stage automation sensor exactly as the daemon would on its first tick
(no cursor), then a second tick from that cursor, against the live instance, and prints
every run they would request. It launches nothing and writes nothing: it sets
``PGOPTIONS=-c default_transaction_read_only=on`` before it connects, so Postgres refuses
any write for the whole process, and a refused write aborts the pre-flight.

It also lists, per stage, the old sessions the no-backfill rule holds back: upstream done,
gates passed, file check passing, stage never tried. None of them launches on its own, but
a new materialization of its upstream (a manual re-run) would launch it, as the old sensors
would have.

Exit codes: 0 no run would be requested, 1 at least one would (do not start the sensors),
2 the pre-flight could not finish (a refused write, or no automation sensors).
"""

import os

# Before anything connects: every transaction in this process is read-only. libpq reads
# PGOPTIONS when it opens each connection, so this covers every storage the instance uses.
os.environ["PGOPTIONS"] = "-c default_transaction_read_only=on"

import importlib.util
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

import dagster as dg
from astra_heartwood.assets import HEARTWOOD_STAGE
from astra_linguist.assets import LINGUIST_STAGE
from astra_mouthpiece.assets import MOUTHPIECE_STAGE
from astra_pipeline_resources.partitions import (
    SessionStage,
    migration_pending,
    ready_sessions,
)
from dagster._core.definitions.sensor_definition import SensorType

STAGES: Sequence[SessionStage] = (LINGUIST_STAGE, MOUTHPIECE_STAGE, HEARTWOOD_STAGE)


def automation_sensors(defs: dg.Definitions) -> list[dg.AutomationConditionSensorDefinition]:
    repo = defs.get_repository_def()
    return sorted(
        (
            s
            for s in repo.sensor_defs
            if isinstance(s, dg.AutomationConditionSensorDefinition)
            and s.sensor_type == SensorType.AUTOMATION
        ),
        key=lambda s: s.name,
    )


def _describe(request: dg.RunRequest) -> str:
    assets = ",".join(sorted(k.to_user_string() for k in request.asset_selection or []))
    return f"partition={request.partition_key} assets={assets}"


def preflight(
    defs: dg.Definitions,
    instance: dg.DagsterInstance,
    emit: Callable[[str], None] = print,
    stages: Sequence[SessionStage] = STAGES,
) -> int:
    """Print what each automation sensor's first two ticks would request; return the count."""
    repo = defs.get_repository_def()
    sensors = automation_sensors(defs)
    if not sensors:
        raise LookupError("no stage automation sensors in these definitions")
    if migration_pending(instance):
        emit("the sessions migration is pending: the stages launch nothing until it is done")
    total = 0
    for sensor in sensors:
        cursor: str | None = None
        for tick in (1, 2):
            context = dg.build_sensor_context(instance=instance, repository_def=repo, cursor=cursor)
            data = sensor.evaluate_tick(context)
            requests = list(data.run_requests or [])
            cursor = data.cursor
            total += len(requests)
            emit(f"{sensor.name} tick {tick}: {len(requests)} run(s) requested")
            for request in requests:
                emit(f"  WOULD LAUNCH {_describe(request)}")
    for stage in stages:
        held = ready_sessions(
            instance,
            upstream=stage.upstream,
            stage=stage.stage,
            keep=stage.keep,
            gates=stage.gates,
        )
        emit(
            f"{stage.stage.to_user_string()}: {len(held)} old session(s) never tried with "
            f"{stage.upstream.to_user_string()} done; a new {stage.upstream.to_user_string()} "
            f"materialization would launch them: {', '.join(held) or '-'}"
        )
    emit(f"total: {total} run(s) would be requested")
    return total


def _load_definitions() -> dg.Definitions:
    path = Path(__file__).resolve().with_name("definitions.py")
    spec = importlib.util.spec_from_file_location("astra_dagster_definitions", path)
    if spec is None or spec.loader is None:
        raise LookupError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.defs


def main() -> int:
    try:
        defs = _load_definitions()
        with dg.DagsterInstance.get() as instance:
            total = preflight(defs, instance)
    except LookupError as exc:
        sys.stderr.write(f"pre-flight failed: {exc}\n")
        return 2
    except Exception as exc:
        if "read-only transaction" in str(exc):
            sys.stderr.write(
                "pre-flight aborted: the evaluation tried to write, and the read-only "
                f"session refused it, so nothing was written ({exc.__class__.__name__})\n"
            )
            return 2
        raise
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
