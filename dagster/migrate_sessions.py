"""Fold the per-app session partition sets into the shared ``sessions`` set (0037 pipe-4b).

Run it in the code server container, where ``DAGSTER_HOME`` points at the instance:

    docker exec astra-dagster-code sh -c 'cd /opt/dagster/app && python migrate_sessions.py'
    docker exec astra-dagster-code sh -c 'cd /opt/dagster/app && python migrate_sessions.py --apply'

The default is a dry run that writes nothing. It prints the plan and exactly what each
sensor would launch once the migration is done, with the sensors' own file checks.
``--apply`` refuses while a run is queued or in progress, and refuses unless that launch
list is empty (or ``--allow-launch N`` names its length). It is idempotent, and safe to
rerun after an interruption. In order, it:

1. Adds every key of the four per-app sets to ``sessions``. Materialization history is
   keyed on asset key and partition key, not on the set's name, so every existing
   materialization shows as materialized again under the shared set.
2. Adopts the sessions the old sensors registered without running (the "adoption" cursor
   hack in mouthpiece and heartwood, 2026-6-23 paid-replay guard): for each downstream
   stage, a session in that stage's old set that the stage never tried (no
   materialization, no planned run) gets a runless materialization of each stage asset,
   tagged ``astra/adopted``. The stage's first asset is marked last, so an interrupted run
   leaves that session still "never tried" and the rerun completes it. Without adoption
   the new sensors would replay the backlog: on the 2026-10-23 backup, 16 paid heartwood
   runs at once, and 42 paid mouthpiece runs as soon as their chronicle summaries were
   materialized.
3. Recomputes the launch list from the written state and sets the marker
   `MIGRATION_MARKER` only if it still matches. The sensors skip until the marker is set.

It deletes nothing: the old sets stay, so the old code still works after a rollback.
``--down --apply`` prepares that rollback: it adds to each old set the ``sessions`` keys
whose stage the new code tried, so the old sensors do not run those stages again, and it
blanks the marker, so a later roll-forward runs the migration again and copies the
sessions the old code added meanwhile.
"""

import argparse
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

import dagster as dg
from astra_heartwood.assets import HEARTWOOD_STAGE
from astra_linguist.assets import LINGUIST_STAGE
from astra_mouthpiece.assets import MOUTHPIECE_STAGE
from astra_pipeline_resources.partitions import (
    LEGACY_SESSIONS_NAMES,
    MIGRATION_MARKER,
    SESSIONS_NAME,
    SessionStage,
    launchable,
    migration_done,
    ready_sessions,
    tried_sessions,
)

#: The tag (and metadata) on an adoption's runless materialization, and the marker value.
ADOPTED_TAG = "astra/adopted"
ADOPTED_VALUE = "pipe-4b"

#: ``run`` exit codes.
REFUSED_IN_FLIGHT = 2
REFUSED_LAUNCH = 3


@dataclass(frozen=True)
class Stage:
    """One stage: its old partition set, its assets (root first) and, downstream, its sensor."""

    legacy_set: str
    assets: tuple[str, ...]
    sensor: SessionStage | None = None

    @property
    def root(self) -> str:
        return self.assets[0]


#: scribe is not adopted: ``craig_drop_sensor`` only asks "is the key in ``sessions``?",
#: so step 1 covers it. The other three launch on "upstream done, stage never tried".
SCRIBE = Stage(
    "scribe_sessions", ("session_tracks", "session_audio", "session_transcript", "session_cleanup")
)
DOWNSTREAM = (
    Stage("linguist_sessions", ("session_transcripts", "session_episode_summary"), LINGUIST_STAGE),
    Stage(
        "mouthpiece_sessions",
        (
            "session_digest",
            "session_brief",
            "session_script",
            "session_audio_clips",
            "session_episode",
        ),
        MOUTHPIECE_STAGE,
    ),
    Stage("heartwood_sessions", ("session_wiki",), HEARTWOOD_STAGE),
)

#: Run statuses that mean a run may still write events.
IN_FLIGHT = [
    dg.DagsterRunStatus.QUEUED,
    dg.DagsterRunStatus.NOT_STARTED,
    dg.DagsterRunStatus.STARTING,
    dg.DagsterRunStatus.STARTED,
    dg.DagsterRunStatus.CANCELING,
]


@dataclass
class Plan:
    """What ``--apply`` would write."""

    legacy: dict[str, list[str]]
    shared: list[str]
    add: list[str]
    #: session key -> the assets to mark adopted for it, the stage roots last.
    adopt: dict[str, list[str]] = field(default_factory=dict)
    in_flight: list[str] = field(default_factory=list)
    marker: bool = False

    @property
    def writes(self) -> bool:
        return bool(self.add or self.adopt) or not self.marker

    def adopted(self, asset: str) -> set[str]:
        return {key for key, assets in self.adopt.items() if asset in assets}


def _tried(instance: dg.DagsterInstance, asset: str) -> set[str]:
    return tried_sessions(instance, dg.AssetKey(asset))


def plan(instance: dg.DagsterInstance) -> Plan:
    """Read the instance and work out the migration. Writes nothing."""
    legacy = {name: sorted(instance.get_dynamic_partitions(name)) for name in LEGACY_SESSIONS_NAMES}
    shared = sorted(instance.get_dynamic_partitions(SESSIONS_NAME))
    union = set().union(*legacy.values())
    result = Plan(legacy=legacy, shared=shared, add=sorted(union - set(shared)))
    for stage in DOWNSTREAM:
        never_tried = set(legacy[stage.legacy_set]) - _tried(instance, stage.root)
        # Root last: until the root is marked, the session still counts as never tried.
        for asset in (*stage.assets[1:], stage.root):
            for key in sorted(never_tried - _tried(instance, asset)):
                result.adopt.setdefault(key, []).append(asset)
    result.in_flight = [
        record.dagster_run.run_id
        for record in instance.get_run_records(filters=dg.RunsFilter(statuses=IN_FLIGHT))
    ]
    result.marker = migration_done(instance)
    return result


def preview(instance: dg.DagsterInstance, todo: Plan) -> dict[str, list[str]]:
    """Per downstream stage, what its sensor would launch once ``todo`` is written.

    The same rule and file checks as the sensors (`launchable`, each stage's ``keep``),
    over the state the instance will have: the added keys, and the adoptions counted as
    materializations. A fresh sensor ledger is empty, so it is not consulted."""
    keys = set(todo.shared) | set(todo.add)
    out: dict[str, list[str]] = {}
    for stage in DOWNSTREAM:
        sensor = stage.sensor
        assert sensor is not None  # noqa: S101 -- every downstream stage has one
        up = sensor.upstream.to_user_string()
        out[stage.root] = launchable(
            keys,
            upstream_done=instance.get_materialized_partitions(sensor.upstream) | todo.adopted(up),
            stage_tried=_tried(instance, stage.root) | todo.adopted(stage.root),
            keep=sensor.keep,
        )
    return out


def sensor_preview(instance: dg.DagsterInstance) -> dict[str, list[str]]:
    """Per downstream stage, what its sensor would launch now, from the written state."""
    out: dict[str, list[str]] = {}
    for stage in DOWNSTREAM:
        sensor = stage.sensor
        assert sensor is not None  # noqa: S101 -- every downstream stage has one
        out[stage.root] = ready_sessions(
            instance,
            upstream=sensor.upstream,
            stage=sensor.stage,
            keep=sensor.keep,
            gates=sensor.gates,
        )
    return out


def apply(instance: dg.DagsterInstance, todo: Plan) -> None:
    """Write the partitions, then the adoptions session by session. Not the marker."""
    if todo.add:
        instance.add_dynamic_partitions(SESSIONS_NAME, todo.add)
    for key, assets in todo.adopt.items():
        for asset in assets:
            instance.report_runless_asset_event(
                dg.AssetMaterialization(
                    asset_key=asset,
                    partition=key,
                    description=(
                        "Adopted by the sessions migration: the old sensor registered this "
                        "session without running this stage."
                    ),
                    metadata={ADOPTED_TAG: ADOPTED_VALUE},
                    tags={ADOPTED_TAG: ADOPTED_VALUE},
                )
            )


def write_marker(instance: dg.DagsterInstance) -> None:
    instance.run_storage.set_cursor_values({MIGRATION_MARKER: ADOPTED_VALUE})


def plan_down(instance: dg.DagsterInstance) -> dict[str, list[str]]:
    """For a rollback: per old set, the ``sessions`` keys whose stage was tried but which
    the old set lacks (sessions the new code handled after the cut-over).

    A session whose stage was never tried stays out, so the old sensor still treats it
    as new and runs it, exactly as before the migration."""
    shared = set(instance.get_dynamic_partitions(SESSIONS_NAME))
    return {
        stage.legacy_set: sorted(
            (shared & _tried(instance, stage.root))
            - set(instance.get_dynamic_partitions(stage.legacy_set))
        )
        for stage in (SCRIBE, *DOWNSTREAM)
    }


def _say(line: str, *, err: bool = False) -> None:
    print(line, file=sys.stderr if err else sys.stdout)


def _print_plan(todo: Plan) -> None:
    for name, keys in todo.legacy.items():
        _say(f"old set {name}: {len(keys)} sessions")
    _say(f"{SESSIONS_NAME} now: {len(todo.shared)} sessions")
    _say(f"add to {SESSIONS_NAME}: {len(todo.add)} sessions {todo.add}")
    by_asset: dict[str, list[str]] = {}
    for key, assets in todo.adopt.items():
        for asset in assets:
            by_asset.setdefault(asset, []).append(key)
    for asset, keys in by_asset.items():
        _say(f"adopt {asset}: {len(keys)} sessions {keys}")
    if not by_asset:
        _say("adopt: nothing")
    _say(f"marker {MIGRATION_MARKER}: {'set' if todo.marker else 'absent'}")
    if todo.in_flight:
        _say(f"runs in flight: {todo.in_flight}")


def _print_launch(title: str, launch: Mapping[str, Sequence[str]]) -> int:
    for asset, keys in launch.items():
        _say(f"{title} {asset}: {len(keys)} {list(keys)}")
    return sum(len(keys) for keys in launch.values())


def run(
    instance: dg.DagsterInstance,
    *,
    apply_changes: bool,
    down: bool = False,
    allow_launch: int = 0,
) -> int:
    """The CLI on a given instance: print the plan, and write it when ``apply_changes``."""
    if down:
        missing = plan_down(instance)
        for name, keys in missing.items():
            _say(f"old set {name} lacks: {len(keys)} {keys}")
        if apply_changes:
            for name, keys in missing.items():
                if keys:
                    instance.add_dynamic_partitions(name, keys)
            instance.run_storage.set_cursor_values({MIGRATION_MARKER: ""})
            _say(f"applied; marker {MIGRATION_MARKER} blanked")
        return 0

    todo = plan(instance)
    _print_plan(todo)
    launches = _print_launch("after the migration the sensor would launch", preview(instance, todo))
    if not apply_changes:
        return 0
    if not todo.writes:
        _say("nothing to do")
        return 0
    if todo.in_flight:
        _say("refusing to apply while runs are in flight", err=True)
        return REFUSED_IN_FLIGHT
    if launches != allow_launch:
        _say(
            f"refusing to apply: the sensors would launch {launches} run(s), "
            f"--allow-launch is {allow_launch}",
            err=True,
        )
        return REFUSED_LAUNCH
    apply(instance, todo)
    written = _print_launch("written state: the sensor would launch", sensor_preview(instance))
    if written != allow_launch:
        _say(
            f"not setting the marker: the written state would launch {written} run(s); "
            "the sensors keep skipping",
            err=True,
        )
        return REFUSED_LAUNCH
    write_marker(instance)
    _say(f"applied; marker {MIGRATION_MARKER} set")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="write; the default is a dry run")
    parser.add_argument(
        "--allow-launch",
        type=int,
        default=0,
        metavar="N",
        help="apply although the sensors would then launch exactly N runs",
    )
    parser.add_argument(
        "--down",
        action="store_true",
        help="rollback prep: add the sessions the new code handled to the old sets",
    )
    args = parser.parse_args(argv)
    with dg.DagsterInstance.get() as instance:
        return run(
            instance, apply_changes=args.apply, down=args.down, allow_launch=args.allow_launch
        )


if __name__ == "__main__":
    raise SystemExit(main())
