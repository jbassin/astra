"""The Dagster snapshot asset (NLSpec 0007 gate F / M7).

Materialization = validate the corpus via the TS Node step (F3) → resolve
crossrefs → write the committed snapshot JSON. Loaded into the astra code
location by ``dagster/definitions.py``; the heavy lifting lives in ``snapshot.py``
(pure Python, no Dagster import) so it stays unit-testable without a run.
"""

from __future__ import annotations

import dagster as dg

from .snapshot import validate_corpus, write_snapshot


@dg.asset(
    group_name="akasha",
    description="akasha vellum corpus snapshot: validate (TS) → crossref edges → metadata JSON.",
)
def akasha_corpus_snapshot() -> dg.MaterializeResult:
    """Validate the corpus, then (re)build the committed metadata snapshot."""
    validate_corpus()
    snapshot = write_snapshot()
    return dg.MaterializeResult(
        metadata={
            "pages": len(snapshot["pages"]),
            "edges": len(snapshot["edges"]),
            "unresolved": len(snapshot["unresolved"]),
        }
    )


#: Importable by ``dagster/definitions.py`` to compose the code location.
defs = dg.Definitions(assets=[akasha_corpus_snapshot])
