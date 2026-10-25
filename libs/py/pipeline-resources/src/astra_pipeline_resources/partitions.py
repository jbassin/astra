"""The one ``sessions`` partition set every per-session asset shares.

One partition per session, keyed by the session date (``YYYY-M-D``, not zero-padded).
``craig_drop_sensor`` is the only code that adds keys. Each downstream stage has one sensor
(`launch_ready`) that launches the stage for a session once its upstream asset is
materialized, its blocking checks passed (`session_check`, `blocked_sessions`), and the
stage was never tried for it (`ready_sessions`). Until 2026-10 each
app had its own set (`LEGACY_SESSIONS_NAMES`); ``dagster/migrate_sessions.py`` folds them
into this one, and every sensor waits until it has (`migration_pending`).
"""

import json
import warnings
from collections.abc import Callable, Collection, Iterable, Mapping
from dataclasses import dataclass

import dagster as dg
from dagster._core.storage.asset_check_execution_record import AssetCheckExecutionRecordStatus

__all__ = [
    "LEGACY_SESSIONS_NAMES",
    "MIGRATION_MARKER",
    "SESSIONS_NAME",
    "SKIP_PENDING",
    "SessionStage",
    "blocked_sessions",
    "launch_ready",
    "launchable",
    "migration_done",
    "migration_pending",
    "read_ledger",
    "ready_sessions",
    "session_check",
    "sessions",
    "tried_sessions",
    "write_ledger",
]

#: Dagster stores partition keys under this name. Never rename it: a renamed set starts
#: empty, and ``craig_drop_sensor`` would treat every zip on disk as a new session.
SESSIONS_NAME = "sessions"
sessions = dg.DynamicPartitionsDefinition(name=SESSIONS_NAME)

#: The per-app sets this one replaced, in pipeline order. Their rows stay in Postgres so a
#: rollback to the old code finds them (``migrate_sessions.py --down`` tops them up).
LEGACY_SESSIONS_NAMES = (
    "scribe_sessions",
    "linguist_sessions",
    "mouthpiece_sessions",
    "heartwood_sessions",
)

#: The instance key-value entry ``migrate_sessions.py --apply`` sets when it has finished.
#: An empty value counts as absent (``--down`` blanks it; Dagster has no key delete).
MIGRATION_MARKER = "astra/sessions-migration"

SKIP_PENDING = (
    "waiting for the sessions migration: the per-app partition sets still hold sessions. "
    "Run `python migrate_sessions.py --apply` in dagster-code (/opt/dagster/app)."
)


def migration_done(instance: dg.DagsterInstance) -> bool:
    """True once ``migrate_sessions.py --apply`` has set a non-empty marker."""
    return bool(instance.run_storage.get_cursor_values({MIGRATION_MARKER}).get(MIGRATION_MARKER))


def migration_pending(instance: dg.DagsterInstance) -> bool:
    """True while an instance with per-app partitions has not finished the migration.

    A fresh instance has no legacy partitions and is never pending. A sensor that acted
    during the gap would see an empty or half-adopted ``sessions`` set and could launch
    paid runs for old sessions, so every sensor skips while this is true.
    """
    if migration_done(instance):
        return False
    return any(instance.get_dynamic_partitions(name) for name in LEGACY_SESSIONS_NAMES)


def tried_sessions(instance: dg.DagsterInstance, asset: dg.AssetKey) -> set[str]:
    """Session keys ``asset`` was ever materialized for or planned in a run for.

    A planned materialization is written when a run is created, so this covers queued,
    running, failed and canceled runs alike. It does not cover a deleted run: deleting a
    run deletes its events (the sensors keep their own ledger for that).
    """
    planned = instance.get_latest_storage_id_by_partition(
        asset, dg.DagsterEventType.ASSET_MATERIALIZATION_PLANNED
    )
    return instance.get_materialized_partitions(asset) | set(planned)


def session_check(
    *, asset: dg.AssetKey | dg.AssetsDefinition | str, name: str, description: str
) -> Callable[[Callable[..., dg.AssetCheckResult]], dg.AssetChecksDefinition]:
    """A blocking, per-session asset check on ``asset``.

    Blocking: a failed result fails the run (so ``pipeline_failure_alert`` pages with the
    session key) and skips the assets after ``asset`` in that run. Per-session: the result
    is stored for the session's partition, so the UI shows it per session and a stage
    sensor can gate on it (`SessionStage.gates`). A failed blocking check does not undo the
    materialization, which is why the sensors need the gate. Partitioned checks are a
    Dagster preview; the warning is silenced here, in one place.
    """

    def wrap(fn: Callable[..., dg.AssetCheckResult]) -> dg.AssetChecksDefinition:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", dg.PreviewWarning)
            return dg.asset_check(
                asset=asset,
                name=name,
                description=description,
                blocking=True,
                partitions_def=sessions,
            )(fn)

    return wrap


def blocked_sessions(instance: dg.DagsterInstance, gates: Collection[dg.AssetCheckKey]) -> set[str]:
    """Session keys where a check in ``gates`` has a latest result that is not a pass.

    That is a failed check, or one planned in a run but not run yet (the run is still
    going, or died before the check). A session with no result at all is not blocked:
    the sessions processed before the check existed never had one.
    """
    if not gates:
        return set()
    infos = instance.event_log_storage.get_asset_check_partition_info(list(gates))
    return {
        info.partition_key
        for info in infos
        if info.partition_key is not None
        and info.latest_execution_status != AssetCheckExecutionRecordStatus.SUCCEEDED
    }


def launchable(
    keys: Iterable[str],
    *,
    upstream_done: Collection[str],
    stage_tried: Collection[str],
    keep: Callable[[str], bool],
) -> list[str]:
    """The pure launch rule: upstream done, stage never tried, and the stage's file check."""
    return sorted(
        key for key in keys if key in upstream_done and key not in stage_tried and keep(key)
    )


def ready_sessions(
    instance: dg.DagsterInstance,
    *,
    upstream: dg.AssetKey,
    stage: dg.AssetKey,
    keep: Callable[[str], bool] = lambda _key: True,
    launched: Collection[str] = (),
    gates: Collection[dg.AssetCheckKey] = (),
) -> list[str]:
    """Sessions whose ``upstream`` asset is materialized with every check in ``gates``
    passed (`blocked_sessions`), and whose ``stage`` was never tried.

    "Tried" means materialized, or planned in any run (`tried_sessions`), or already in
    ``launched``, the sensor's own ledger. So a failed or canceled stage stays as it is
    until someone re-executes it, a queued run is not requested twice, and a session that
    was handled or adopted by the migration never fires again. ``keep`` filters on files
    the stage needs (a canonical transcript, a faerrin campaign).
    """
    return launchable(
        instance.get_dynamic_partitions(SESSIONS_NAME),
        upstream_done=instance.get_materialized_partitions(upstream)
        - blocked_sessions(instance, gates),
        stage_tried=tried_sessions(instance, stage) | set(launched),
        keep=keep,
    )


@dataclass(frozen=True)
class SessionStage:
    """One sensor-launched stage: the asset that triggers it, its first asset, a file check,
    and the blocking checks on ``upstream`` that must have passed (`blocked_sessions`)."""

    upstream: dg.AssetKey
    stage: dg.AssetKey
    keep: Callable[[str], bool]
    gates: tuple[dg.AssetCheckKey, ...] = ()

    def run_key(self, key: str) -> str:
        """Deterministic per stage and session, so Dagster never launches a request twice."""
        return f"{self.stage.to_user_string()}:{key}"


def read_ledger(cursor: str | None) -> set[str]:
    """The sessions a sensor has launched, from its cursor (old cursors read as empty)."""
    try:
        data = json.loads(cursor or "")
    except ValueError:
        return set()
    launched = data.get("launched") if isinstance(data, dict) else None
    return {str(k) for k in launched} if isinstance(launched, list) else set()


def write_ledger(launched: Iterable[str]) -> str:
    return json.dumps({"launched": sorted(set(launched))})


def launch_ready(
    context: dg.SensorEvaluationContext,
    stage: SessionStage,
    *,
    tags: Mapping[str, str] | None = None,
) -> dg.SensorResult:
    """The body of a downstream stage sensor.

    Skips while the migration is pending. Otherwise requests one run per ready session,
    each with a deterministic ``run_key``, and records the sessions in the cursor ledger,
    so a session whose run was deleted (and its events with it) is not launched again.
    """
    if migration_pending(context.instance):
        return dg.SensorResult(skip_reason=SKIP_PENDING)
    launched = read_ledger(context.cursor)
    ready = ready_sessions(
        context.instance,
        upstream=stage.upstream,
        stage=stage.stage,
        keep=stage.keep,
        launched=launched,
        gates=stage.gates,
    )
    if not ready:
        return dg.SensorResult()
    return dg.SensorResult(
        run_requests=[
            dg.RunRequest(partition_key=key, run_key=stage.run_key(key), tags=dict(tags or {}))
            for key in ready
        ],
        cursor=write_ledger(launched | set(ready)),
    )
