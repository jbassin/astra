"""Phase 0 smoke Dagster code location — proves the pipeline runtime comes up.

The real asset graph (one partition per session: scribe -> linguist -> akasha ->
mouthpiece) lands here in Phase 3. For now a single trivial asset gives the
webserver a non-empty, materializable code location to load.
"""

import dagster as dg


@dg.asset(group_name="smoke")
def hello_astra() -> str:
    """Trivial asset so the Phase 0 code location is non-empty and materializable."""
    return "astra pipeline online"


defs = dg.Definitions(assets=[hello_astra])
