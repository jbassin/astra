"""Read-only pre-flight for the stage automation sensors: is it safe to start them now?

Run it in ``dagster-code`` immediately before starting the sensors
(``just pipeline-automation-preflight``). It launches nothing and writes nothing: it sets
``PGOPTIONS=-c default_transaction_read_only=on`` before it connects, so Postgres refuses
any write for the whole process, and a refused write aborts the pre-flight.

1. It evaluates each stage automation sensor exactly as the daemon would on its first tick
   (no cursor), then a second tick from that cursor, and prints every run they would
   request. The real first tick happens when a sensor is started, and the second tick here
   only covers the moments between the two evaluations, so run this right before Start.
2. It lists, per stage, the held sessions (`astra_pipeline_resources.stage_audit`): never
   tried with their upstream done. None launches on its own, but a new materialization of
   its upstream (a manual re-run) would launch it. Each shows when its upstream finished.
   A recent one probably finished while the sensors were stopped: launch it by hand. An
   old one, and above all one the old sensor's ledger says it launched (its run was
   deleted), should be adopted (``just pipeline-automation-adopt``) before Start.

Exit codes: 0 safe to start (no run requested, nothing held); 1 not yet (runs would be
requested, or sessions are held: adopt or launch them, then run this again); 2 it could not
finish (the sessions migration is pending, a refused write, or any other error).
"""

import os

# Before anything connects: every transaction in this process is read-only. libpq reads
# PGOPTIONS when it opens each connection, so this covers every storage the instance uses.
os.environ["PGOPTIONS"] = "-c default_transaction_read_only=on"

import argparse
import importlib.util
import logging
import sys
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import dagster as dg
from astra_heartwood.assets import HEARTWOOD_STAGE
from astra_linguist.assets import LINGUIST_STAGE
from astra_mouthpiece.assets import MOUTHPIECE_STAGE
from astra_pipeline_resources.partitions import SessionStage, migration_pending
from astra_pipeline_resources.stage_audit import HeldSession, held_sessions, old_ledgers
from dagster._core.definitions.sensor_definition import SensorType

#: Not under ``astra``: an ERROR there reaches SigNoz and pages. Every failure here is
#: exit 2 (never 1, which means "not safe to start"), with its traceback on stderr.
logger = logging.getLogger("automation_preflight")
STAGES: Sequence[SessionStage] = (LINGUIST_STAGE, MOUTHPIECE_STAGE, HEARTWOOD_STAGE)
#: An upstream that finished within this many hours counts as recent ("launch by hand").
RECENT_HOURS = 24.0


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


@dataclass
class Report:
    pending: bool = False
    requested: int = 0
    held: Mapping[str, list[HeldSession]] = field(default_factory=dict)

    @property
    def exit_code(self) -> int:
        if self.pending:
            return 2
        return 1 if self.requested or any(self.held.values()) else 0


def _describe(request: dg.RunRequest) -> str:
    assets = ",".join(sorted(k.to_user_string() for k in request.asset_selection or []))
    return f"partition={request.partition_key} assets={assets}"


def _when(at: float | None) -> str:
    if at is None:
        return "no materialization record"
    return datetime.fromtimestamp(at, UTC).strftime("%Y-%m-%d %H:%M UTC")


def describe_held(session: HeldSession) -> str:
    """One held session as the pre-flight and the adoption print it."""
    if session.recent:
        verdict = "just finished: launch by hand"
    elif session.in_old_ledger:
        verdict = "old: the old sensor launched it and its run was deleted: adopt"
    else:
        verdict = "old: adopt, or launch by hand"
    return f"  HELD {session.key} (upstream {_when(session.upstream_at)}): {verdict}"


def preflight(
    defs: dg.Definitions,
    instance: dg.DagsterInstance,
    emit: Callable[[str], None] = print,
    stages: Sequence[SessionStage] = STAGES,
    *,
    now: float | None = None,
    recent_hours: float = RECENT_HOURS,
) -> Report:
    """Print what each automation sensor's first two ticks would request and what each
    stage holds back; return the report."""
    repo = defs.get_repository_def()
    sensors = automation_sensors(defs)
    if not sensors:
        raise LookupError("no stage automation sensors in these definitions")
    report = Report()
    if migration_pending(instance):
        emit("the sessions migration is pending: finish it before starting the sensors")
        report.pending = True
        return report
    for sensor in sensors:
        cursor: str | None = None
        for tick in (1, 2):
            context = dg.build_sensor_context(instance=instance, repository_def=repo, cursor=cursor)
            data = sensor.evaluate_tick(context)
            requests = list(data.run_requests or [])
            cursor = data.cursor
            report.requested += len(requests)
            emit(f"{sensor.name} tick {tick}: {len(requests)} run(s) requested")
            for request in requests:
                emit(f"  WOULD LAUNCH {_describe(request)}")
    emit(
        "(the real first tick happens at Start; tick 2 covers only the last few seconds, "
        "so start the sensors right after this)"
    )
    ledgers = old_ledgers(instance)
    recent_after = (time.time() if now is None else now) - recent_hours * 3600
    held: dict[str, list[HeldSession]] = {}
    for stage in stages:
        name = stage.stage.to_user_string()
        held[name] = held_sessions(
            instance, stage, ledger=ledgers.get(name, set()), recent_after=recent_after
        )
        emit(
            f"{name}: {len(held[name])} held session(s), never tried with "
            f"{stage.upstream.to_user_string()} done"
        )
        for session in held[name]:
            emit(describe_held(session))
    report.held = held
    emit(f"total: {report.requested} run(s) would be requested")
    verdict = {0: "safe to start the sensors", 1: "not yet: adopt or launch the held sessions"}
    emit(verdict[report.exit_code])
    return report


def _load_definitions() -> dg.Definitions:
    path = Path(__file__).resolve().with_name("definitions.py")
    spec = importlib.util.spec_from_file_location("astra_dagster_definitions", path)
    if spec is None or spec.loader is None:
        raise LookupError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.defs


def main(
    argv: Sequence[str] | None = None,
    *,
    instance_factory: Callable[[], dg.DagsterInstance] = dg.DagsterInstance.get,
    load: Callable[[], dg.Definitions] = _load_definitions,
) -> int:
    parser = argparse.ArgumentParser(description="Read-only stage automation pre-flight.")
    parser.add_argument(
        "--recent-hours",
        type=float,
        default=RECENT_HOURS,
        help="an upstream newer than this counts as just finished (default: %(default)s)",
    )
    args = parser.parse_args(argv)
    try:
        defs = load()
        with instance_factory() as instance:
            report = preflight(defs, instance, recent_hours=args.recent_hours)
    except Exception as exc:
        logger.exception("pre-flight failed")
        if "read-only transaction" in str(exc):
            sys.stderr.write(
                "pre-flight aborted: the evaluation tried to write, and the read-only "
                f"session refused it, so nothing was written ({exc.__class__.__name__})\n"
            )
        else:
            sys.stderr.write(f"pre-flight failed: {exc.__class__.__name__}: {exc}\n")
        return 2
    return report.exit_code


if __name__ == "__main__":
    sys.exit(main())
