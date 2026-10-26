"""What the stage automation would hold back, and the opt-in adoption that settles it.

A held session is one the old sensors' launch rule would launch now (`ready_sessions`):
upstream done, gates passed, file check passing, stage never tried. The automation never
launches it on its own (no backfill), but a new materialization of its upstream, such as a
manual re-run, would. ``dagster/automation_preflight.py`` lists the held sessions and
``dagster/adopt_held_sessions.py`` marks the chosen ones tried, before the sensors start.

The old stage sensors kept a ledger of the sessions they launched in their cursor. It was
the only record of a session whose run was later deleted (deleting a run deletes its
planned materialization), so a held session in an old ledger is flagged: the old sensor
launched it, and only the adoption keeps the new automation from launching it again.
"""

import json
from collections.abc import Collection, Iterable, Mapping
from dataclasses import dataclass

import dagster as dg
from dagster._core.scheduler.instigation import InstigatorType

from .partitions import SessionStage, ready_sessions

__all__ = [
    "ADOPTED_TAG",
    "ADOPTED_VALUE",
    "OLD_SENSORS",
    "HeldSession",
    "adopt",
    "held_sessions",
    "old_ledgers",
    "read_ledger",
    "running_sensors",
]

#: Each automation-launched stage's first asset -> the sensor that launched it until 2026-10.
#: Their rows (and cursors) stay in the instance's schedule storage.
OLD_SENSORS: Mapping[str, str] = {
    "session_transcripts": "scribe_output_sensor",
    "session_digest": "linguist_output_sensor",
    "session_wiki": "heartwood_sensor",
}

#: The tag (and metadata key) on an adoption's runless materialization, as the sessions
#: migration wrote it; the value says which tool wrote it.
ADOPTED_TAG = "astra/adopted"
ADOPTED_VALUE = "stage-automation"


def read_ledger(cursor: str | None) -> set[str]:
    """The sessions an old stage sensor launched, from its cursor (``adopted`` or an
    unreadable cursor reads as empty)."""
    try:
        data = json.loads(cursor or "")
    except ValueError:
        return set()
    launched = data.get("launched") if isinstance(data, dict) else None
    return {str(k) for k in launched} if isinstance(launched, list) else set()


def _sensor_states(instance: dg.DagsterInstance) -> list:
    """Every sensor row the instance stores. An instance without schedule storage (Dagster's
    ephemeral test instance) stores none."""
    if instance.schedule_storage is None:
        return []
    return list(instance.all_instigator_state(instigator_type=InstigatorType.SENSOR))


def old_ledgers(instance: dg.DagsterInstance) -> dict[str, set[str]]:
    """Stage first asset -> the sessions its old sensor's ledger says it launched."""
    by_sensor: dict[str, set[str]] = {}
    for state in _sensor_states(instance):
        data = state.instigator_data
        cursor = getattr(data, "cursor", None)
        by_sensor.setdefault(state.instigator_name, set()).update(read_ledger(cursor))
    return {stage: by_sensor.get(sensor, set()) for stage, sensor in OLD_SENSORS.items()}


def running_sensors(instance: dg.DagsterInstance, names: Collection[str]) -> list[str]:
    """Which of the sensors ``names`` the instance has started."""
    return sorted(
        {s.instigator_name for s in _sensor_states(instance) if s.is_running} & set(names)
    )


@dataclass(frozen=True)
class HeldSession:
    """A session a stage would launch on a new upstream materialization."""

    key: str
    #: When its upstream was last materialized (epoch seconds), if Dagster has a record.
    upstream_at: float | None
    #: The old sensor's ledger says it launched this stage for the session: its run is gone.
    in_old_ledger: bool
    #: The upstream finished at or after ``recent_after``: probably a session that finished
    #: while the sensors were stopped, to launch by hand rather than adopt.
    recent: bool


def _upstream_at(instance: dg.DagsterInstance, asset: dg.AssetKey, key: str) -> float | None:
    records = instance.fetch_materializations(
        dg.AssetRecordsFilter(asset_key=asset, asset_partitions=[key]), limit=1
    ).records
    return records[0].timestamp if records else None


def held_sessions(
    instance: dg.DagsterInstance,
    stage: SessionStage,
    *,
    ledger: Collection[str],
    recent_after: float,
) -> list[HeldSession]:
    """The sessions `ready_sessions` would launch for ``stage`` now, annotated."""
    held = []
    for key in ready_sessions(
        instance, upstream=stage.upstream, stage=stage.stage, keep=stage.keep, gates=stage.gates
    ):
        at = _upstream_at(instance, stage.upstream, key)
        held.append(
            HeldSession(
                key=key,
                upstream_at=at,
                in_old_ledger=key in ledger,
                recent=at is not None and at >= recent_after,
            )
        )
    return held


def adopt(instance: dg.DagsterInstance, stage: SessionStage, keys: Iterable[str]) -> None:
    """Mark ``stage`` tried for ``keys``: a runless materialization of its first asset,
    tagged `ADOPTED_TAG`, which `tried_sessions` counts, so `StageReady` excludes them.

    Only the first asset: a materialization of a later one could trigger something else
    (``session_episode_summary`` would wake ``campaign_timeline_sensor``, a paid rebuild).
    """
    for key in keys:
        instance.report_runless_asset_event(
            dg.AssetMaterialization(
                asset_key=stage.stage,
                partition=key,
                description=(
                    "Adopted before the stage automation started: this stage must not "
                    "launch for this session on its own."
                ),
                metadata={ADOPTED_TAG: ADOPTED_VALUE},
                tags={ADOPTED_TAG: ADOPTED_VALUE},
            )
        )
