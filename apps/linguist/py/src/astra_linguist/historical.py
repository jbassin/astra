"""Historical import (NLSpec 0006 gate I / F3).

The 76 historical sessions' canonical outputs are committed verbatim under
`data/` + `transcripts/` (imported from faerrin, not re-run — their corrections
are long-settled). This module lists those sessions and pre-satisfies their
Dagster partitions: registering each date + reporting it materialized, so the
`session_transcripts` asset never re-derives history (scribe + linguist process
**new** sessions going forward).
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from .assets import DATA_DIR

if TYPE_CHECKING:  # pragma: no cover
    import dagster as dg


def historical_dates(data_dir: Path | str = DATA_DIR) -> list[str]:
    """The committed historical session dates (from `data/*.json`), sorted."""
    return sorted(path.stem for path in Path(data_dir).glob("*.json"))


def pre_satisfy(instance: dg.DagsterInstance) -> int:  # pragma: no cover - live deploy step
    """Register + mark-materialized the historical partitions (F3). Returns the count."""
    import dagster as dg

    from .assets import SESSIONS_NAME, session_transcripts

    dates = historical_dates()
    instance.add_dynamic_partitions(SESSIONS_NAME, dates)
    for date in dates:
        instance.report_runless_asset_event(
            dg.AssetMaterialization(asset_key=session_transcripts.key, partition=date)
        )
    return len(dates)
