"""The heartwood Dagster assets (spec §9/§10) — one partition per session date.

``session_noun_facts`` (Phase 2) mirrors chronicle's ``session_episode_summary``: it builds the
per-session facts and atomic-writes ``facts/<date>.json``, skipping non-faerrin / unmatched /
excluded sessions. ``session_page_proposals`` (Phase 3) runs downstream — it reads the committed
facts, drafts house-voice prose, and emits ``proposals/<date>/{manifest.kdl,<id>.vellum}``. Phase 2
owns a heartwood-local dynamic partitions def (it never re-registers linguist's, to avoid
cross-code-location coupling); the sensor/schedule auto-wiring is Phase 5. The root
``dagster/definitions.py`` imports these assets into the shared code location (where
``init_telemetry`` is installed).
"""

import dagster as dg

from .pipeline import FACTS_DIR, _atomic_write, build_session_facts
from .proposer.corpus import PROPOSALS_DIR
from .proposer.pipeline import build_session_proposals, write_change_set

heartwood_sessions = dg.DynamicPartitionsDefinition(name="heartwood_sessions")


@dg.asset(partitions_def=heartwood_sessions, group_name="heartwood")
def session_noun_facts(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Extract one session's resolved noun-facts → committed ``facts/<date>.json``."""
    date = context.partition_key
    facts = build_session_facts(date)
    if facts is None:
        return dg.MaterializeResult(metadata={"status": "skipped (non-faerrin/unmatched)"})
    _atomic_write(FACTS_DIR / f"{date}.json", facts.model_dump_json(indent=2))
    resolved = sum(1 for f in facts.facts if f.status == "resolved")
    return dg.MaterializeResult(
        metadata={
            "show": facts.show,
            "facts": len(facts.facts),
            "resolved": resolved,
            "dropped_spans": len(facts.dropped),
        }
    )


@dg.asset(
    partitions_def=heartwood_sessions,
    deps=[session_noun_facts],
    group_name="heartwood",
)
def session_page_proposals(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Draft one session's page proposals → committed ``proposals/<date>/`` change-set."""
    date = context.partition_key
    change_set = build_session_proposals(date)
    if change_set is None:
        return dg.MaterializeResult(metadata={"status": "skipped (no facts)"})
    write_change_set(PROPOSALS_DIR / date, change_set)
    m = change_set.manifest
    return dg.MaterializeResult(
        metadata={
            "show": m.show,
            "pages": len(m.proposals),
            "creates": sum(1 for p in m.proposals if p.op == "create"),
            "rewrites": sum(1 for p in m.proposals if p.op == "rewrite"),
            "unplaced": len(m.unplaced),
            "skipped": len(m.skipped),
            "conflicts": sum(len(p.conflicts) for p in m.proposals),
            "lints": sum(len(p.lints) for p in m.proposals),
        }
    )


defs = dg.Definitions(assets=[session_noun_facts, session_page_proposals])
