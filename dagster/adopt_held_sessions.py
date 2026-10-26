"""Mark held sessions tried, so the stage automation never launches them (opt-in, writes).

A held session is never tried with its upstream done (`astra_pipeline_resources.stage_audit`);
a manual re-run of its upstream would launch its paid stage. This marks the chosen ones
tried with a runless materialization of the stage's first asset tagged ``astra/adopted``,
which `StageReady` honours. Run it in ``dagster-code`` (``just pipeline-automation-adopt``)
after ``just pipeline-automation-preflight`` and before starting the sensors.

It prints exactly what it will mark and asks before writing (``--yes`` skips the question).
By default it marks every held session except recent ones (their upstream finished within
``--recent-hours``: launch those by hand instead); ``--stage`` and ``--session`` narrow it,
``--include-recent`` adds the recent ones. It refuses while the sessions migration is
pending or while any stage automation sensor is running.

Exit codes: 0 marked (or nothing to mark), 1 refused or declined, 2 an error.
"""

import argparse
import logging
import sys
import time
from collections.abc import Callable, Sequence

import dagster as dg
from astra_heartwood.assets import HEARTWOOD_STAGE
from astra_linguist.assets import LINGUIST_STAGE
from astra_mouthpiece.assets import MOUTHPIECE_STAGE
from astra_pipeline_resources.partitions import SessionStage, migration_pending
from astra_pipeline_resources.stage_audit import (
    adopt,
    held_sessions,
    old_ledgers,
    running_sensors,
)

#: Not under ``astra``: an ERROR there reaches SigNoz and pages. Every failure here is
#: exit 2 (never 1, which means "not safe to start"), with its traceback on stderr.
logger = logging.getLogger("adopt_held_sessions")
STAGES: Sequence[SessionStage] = (LINGUIST_STAGE, MOUTHPIECE_STAGE, HEARTWOOD_STAGE)
AUTOMATION_SENSORS = ("linguist_automation", "mouthpiece_automation", "heartwood_automation")
RECENT_HOURS = 24.0


def plan(
    instance: dg.DagsterInstance,
    stages: Sequence[SessionStage],
    *,
    only_stages: Sequence[str] = (),
    only_sessions: Sequence[str] = (),
    include_recent: bool = False,
    recent_after: float,
) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Per stage first asset: the sessions to mark, and the recent ones left for a manual
    launch."""
    ledgers = old_ledgers(instance)
    marks: dict[str, list[str]] = {}
    skipped: dict[str, list[str]] = {}
    for stage in stages:
        name = stage.stage.to_user_string()
        if only_stages and name not in only_stages:
            continue
        for session in held_sessions(
            instance, stage, ledger=ledgers.get(name, set()), recent_after=recent_after
        ):
            if only_sessions and session.key not in only_sessions:
                continue
            target = skipped if session.recent and not include_recent else marks
            target.setdefault(name, []).append(session.key)
    return marks, skipped


def run(
    instance: dg.DagsterInstance,
    args: argparse.Namespace,
    *,
    stages: Sequence[SessionStage] = STAGES,
    emit: Callable[[str], None] = print,
    ask: Callable[[str], str] = input,
    now: float | None = None,
) -> int:
    if migration_pending(instance):
        emit("refused: the sessions migration is pending")
        return 1
    running = running_sensors(instance, AUTOMATION_SENSORS)
    if running:
        emit(f"refused: stop these sensors first: {', '.join(running)}")
        return 1
    recent_after = (time.time() if now is None else now) - args.recent_hours * 3600
    marks, skipped = plan(
        instance,
        stages,
        only_stages=args.stage,
        only_sessions=args.session,
        include_recent=args.include_recent,
        recent_after=recent_after,
    )
    for name, keys in skipped.items():
        emit(f"not marking (recent, launch by hand) {name}: {', '.join(keys)}")
    found = {key for keys in [*marks.values(), *skipped.values()] for key in keys}
    for key in sorted(set(args.session) - found):
        emit(f"not held, not marking: {key}")
    total = sum(len(keys) for keys in marks.values())
    if not total:
        emit("nothing to mark")
        return 0
    emit(f"will mark tried, with a runless materialization tagged astra/adopted ({total}):")
    for name, keys in marks.items():
        emit(f"  {name}: {', '.join(keys)}")
    if not args.yes and ask("write these? type yes: ").strip() != "yes":
        emit("declined: nothing written")
        return 1
    by_name = {stage.stage.to_user_string(): stage for stage in stages}
    for name, keys in marks.items():
        adopt(instance, by_name[name], keys)
    emit(f"marked {total} session(s); run just pipeline-automation-preflight again")
    return 0


def parse(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Mark held sessions tried (writes).")
    parser.add_argument("--stage", action="append", default=[], help="a stage's first asset")
    parser.add_argument("--session", action="append", default=[], help="a session key")
    parser.add_argument("--include-recent", action="store_true")
    parser.add_argument("--recent-hours", type=float, default=RECENT_HOURS)
    parser.add_argument("--yes", action="store_true", help="write without asking")
    return parser.parse_args(argv)


def main(
    argv: Sequence[str] | None = None,
    *,
    instance_factory: Callable[[], dg.DagsterInstance] = dg.DagsterInstance.get,
) -> int:
    args = parse(argv)
    try:
        with instance_factory() as instance:
            return run(instance, args)
    except Exception as exc:
        logger.exception("adoption failed")
        sys.stderr.write(f"adoption failed: {exc.__class__.__name__}: {exc}\n")
        return 2


if __name__ == "__main__":
    sys.exit(main())
