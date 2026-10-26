"""The one ``sessions`` partition set every per-session asset shares.

One partition per session, keyed by the session date (``YYYY-M-D``, not zero-padded).
``craig_drop_sensor`` is the only code that adds keys. Each downstream stage is launched by
an automation condition on its first asset (`stage_automation`), evaluated by its app's
automation sensor (`stage_sensor`): a session is requested once its upstream asset gets a
new materialization, its blocking checks passed (`session_check`, `blocked_sessions`), and
the stage was never tried for it (`ready_sessions`). Until 2026-10 each app had its own set
(`LEGACY_SESSIONS_NAMES`); ``dagster/migrate_sessions.py`` folds them into this one, and
nothing launches until it has (`migration_pending`).
"""

import warnings
from collections.abc import Callable, Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass

import dagster as dg
from dagster._core.storage.asset_check_execution_record import AssetCheckExecutionRecordStatus

__all__ = [
    "LEGACY_SESSIONS_NAMES",
    "MIGRATION_MARKER",
    "SESSIONS_NAME",
    "SKIP_PENDING",
    "STAGE_SENSOR_INTERVAL",
    "SessionStage",
    "StageReady",
    "blocked_sessions",
    "follows",
    "launchable",
    "migration_done",
    "migration_pending",
    "ready_sessions",
    "session_check",
    "sessions",
    "stage_automation",
    "stage_sensor",
    "tried_sessions",
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

    A fresh instance has no legacy partitions and is never pending. A launch during the
    gap would see an empty or half-adopted ``sessions`` set and could start paid runs for
    old sessions, so ``craig_drop_sensor`` skips and `StageReady` is false while this is
    true.
    """
    if migration_done(instance):
        return False
    return any(instance.get_dynamic_partitions(name) for name in LEGACY_SESSIONS_NAMES)


def tried_sessions(instance: dg.DagsterInstance, asset: dg.AssetKey) -> set[str]:
    """Session keys ``asset`` was ever materialized for or planned in a run for.

    A planned materialization is written when a run is created, so this covers queued,
    running, failed and canceled runs alike. It does not cover a deleted run: deleting a
    run deletes its events (`stage_automation` remembers its own requests for that).
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
    is stored for the session's partition, so the UI shows it per session and the next
    stage can gate on it (`SessionStage.gates`). A failed blocking check does not undo the
    materialization, which is why the stages need the gate. Partitioned checks are a
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
    gates: Collection[dg.AssetCheckKey] = (),
    keys: Iterable[str] | None = None,
) -> list[str]:
    """Sessions whose ``upstream`` asset is materialized with every check in ``gates``
    passed (`blocked_sessions`), and whose ``stage`` was never tried.

    "Tried" means materialized, or planned in any run (`tried_sessions`). So a failed or
    canceled stage stays as it is until someone re-executes it, and a queued run is not
    requested twice. ``keep`` filters on files the stage needs (a canonical transcript, a
    faerrin campaign). ``keys`` limits the answer to those sessions (default: all).
    """
    return launchable(
        instance.get_dynamic_partitions(SESSIONS_NAME) if keys is None else keys,
        upstream_done=instance.get_materialized_partitions(upstream)
        - blocked_sessions(instance, gates),
        stage_tried=tried_sessions(instance, stage),
        keep=keep,
    )


@dataclass(frozen=True)
class SessionStage:
    """One automation-launched stage: the asset whose update triggers it, its first asset,
    a file check, and the blocking checks on ``upstream`` that must have passed."""

    upstream: dg.AssetKey
    stage: dg.AssetKey
    keep: Callable[[str], bool]
    gates: tuple[dg.AssetCheckKey, ...] = ()


class StageReady(dg.AutomationCondition[dg.AssetKey]):
    """True for the candidate sessions `ready_sessions` would launch for ``stage``.

    That is: upstream materialized, its gates passed, the stage's first asset never
    materialized nor planned in a run of any status, and ``keep`` holds. False for every
    session while the sessions migration is pending. It runs only on the sessions the
    conditions before it left (`stage_automation`), so ``keep`` reads files for the few
    sessions whose upstream just changed, not for the whole set.
    """

    def __init__(self, stage: SessionStage) -> None:
        self._stage = stage

    @property
    def name(self) -> str:
        return f"stage_ready({self._stage.stage.to_user_string()})"

    @property
    def description(self) -> str:
        return (
            f"{self._stage.upstream.to_user_string()} materialized with its gates passed, "
            f"{self._stage.stage.to_user_string()} never tried, and the stage's file check"
        )

    def evaluate(self, context: dg.AutomationContext) -> dg.AutomationResult:
        candidates = context.candidate_subset
        if candidates.is_empty:
            return dg.AutomationResult(context=context, true_subset=candidates)
        instance = context.asset_graph_view.instance
        if migration_pending(instance):
            return dg.AutomationResult(context=context, true_subset=context.get_empty_subset())
        ready = ready_sessions(
            instance,
            upstream=self._stage.upstream,
            stage=self._stage.stage,
            keep=self._stage.keep,
            gates=self._stage.gates,
            keys=candidates.expensively_compute_partition_keys(),
        )
        return dg.AutomationResult(
            context=context,
            true_subset=candidates.compute_intersection_with_partition_keys(set(ready)),
        )


def stage_automation(stage: SessionStage) -> dg.AutomationCondition:
    """The automation condition on a stage's first asset.

    Three parts, all true for a session to be requested:

    1. ``upstream updated``: the upstream asset got a new materialization for the session
       since the stage was last requested or materialized. ``newly_updated`` is empty on
       the first evaluation, so sessions that existed before the sensor first ran never
       fire (no backfill). The latch holds while a gate or the file check is still false.
    2. ``never requested``: this condition never requested the session. That is the run
       key the sensors carried: one request per stage and session, even if the run and
       its events are deleted later. Cleared only when the sensor's cursor is reset.
    3. `StageReady`: the old sensors' launch rule, so a failed, canceled, queued or
       running stage is never requested again, whatever triggered part 1.

    The two ``since`` parts keep their state in the sensor cursor under ids built from
    their own operands, so editing part 3 keeps the state of parts 1 and 2.
    """
    upstream_updated = (
        dg.AutomationCondition.any_deps_match(dg.AutomationCondition.newly_updated())
        .allow(dg.AssetSelection.assets(stage.upstream))
        .since_last_handled()
        .with_label("upstream updated")
    )
    ever_requested = (
        dg.AutomationCondition.newly_requested()
        .since(dg.AutomationCondition.initial_evaluation())
        .with_label("requested before")
    )
    return (upstream_updated & ~ever_requested & StageReady(stage)).with_label(
        f"launch {stage.stage.to_user_string()}"
    )


def follows(*parents: dg.AssetsDefinition | dg.AssetKey) -> dg.AutomationCondition:
    """The automation condition on a later asset of a stage: requested in the same run as
    ``parents`` (the stage's earlier assets), and never on its own."""
    keys = [p.key if isinstance(p, dg.AssetsDefinition) else p for p in parents]
    return (
        dg.AutomationCondition.any_deps_match(dg.AutomationCondition.will_be_requested())
        .allow(dg.AssetSelection.assets(*keys))
        .with_label("stage requested")
    )


#: How often the stage automation sensors evaluate (the old stage sensors' interval).
STAGE_SENSOR_INTERVAL = 30


def stage_sensor(
    name: str,
    assets: Sequence[dg.AssetsDefinition],
    *,
    description: str,
    run_tags: Mapping[str, str] | None = None,
) -> dg.AutomationConditionSensorDefinition:
    """The automation sensor that evaluates one app's stage conditions.

    It runs in the code server (``use_user_code_server``), which `StageReady` needs, and
    asks for one plain run per session (``emit_backfills=False``), so the run queue's
    limits and ``run_tags`` apply as they did to the sensors' runs. It ships stopped:
    start it in the UI once the read-only pre-flight
    (``dagster/automation_preflight.py``) shows it would request nothing. Dagster keeps a
    started sensor running across deploys.
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", dg.BetaWarning)
        return dg.AutomationConditionSensorDefinition(
            name,
            target=dg.AssetSelection.assets(*assets),
            run_tags=run_tags,
            default_status=dg.DefaultSensorStatus.STOPPED,
            minimum_interval_seconds=STAGE_SENSOR_INTERVAL,
            description=description,
            emit_backfills=False,
            use_user_code_server=True,
        )
