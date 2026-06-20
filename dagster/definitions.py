"""The astra Dagster code location — the Phase-3 asset graph lands here.

The full pipeline (one partition per session: scribe -> linguist -> akasha ->
mouthpiece) grows here per subsystem. First real member: akasha-backend's
corpus-snapshot asset (0007). The trivial Phase-0 smoke asset stays so the code
location is always non-empty/materializable.
"""

import dagster as dg
from astra_akasha_backend.assets import akasha_corpus_snapshot
from astra_scribe.assets import craig_drop_sensor, session_outputs


@dg.asset(group_name="smoke")
def hello_astra() -> str:
    """Trivial asset so the code location is non-empty and materializable."""
    return "astra pipeline online"


# `session_outputs` carries its DynamicPartitionsDefinition, so Dagster discovers
# the `scribe_sessions` partitions from the asset (no separate registration).
defs = dg.Definitions(
    assets=[hello_astra, akasha_corpus_snapshot, session_outputs],
    sensors=[craig_drop_sensor],
)
