"""The heartwood Dagster asset (spec §9) — one partition per session date.

``session_noun_facts`` mirrors chronicle's ``session_episode_summary``: it builds the
per-session facts and atomic-writes ``facts/<date>.json``, skipping non-faerrin / unmatched
/ excluded sessions. Phase 2 owns a heartwood-local dynamic partitions def (it never
re-registers linguist's, to avoid cross-code-location coupling); the sensor/schedule
auto-wiring is Phase 5. The root ``dagster/definitions.py`` imports this asset into the
shared code location (where ``init_telemetry`` is installed).
"""

import dagster as dg

from .pipeline import FACTS_DIR, _atomic_write, build_session_facts

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


defs = dg.Definitions(assets=[session_noun_facts])
