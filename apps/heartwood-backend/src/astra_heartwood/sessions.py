"""Session selection — the faerrin-world filter + corrected-transcript loader (spec §4).

heartwood ingests only ``world == "faerrin"`` campaigns (umbrella D10). This composes
chronicle's committed-filename session→show resolution (``show_for_date``, which already
honors ``EXCLUDED_DATES``) with Phase-1's faerrin world set (``faerrin_campaign_slugs``).
An unmatched/unknown slug is simply *not* faerrin — never a crash (Phase-1 spec §3.3).

Reuse-don't-reinvent: the ``Transcript`` model, ``show_for_date``/``EXCLUDED_DATES``, and
the ``data/<date>.json`` loader all come from ``astra_linguist`` (a workspace dependency).
"""

from __future__ import annotations

from pathlib import Path

import astra_linguist
from astra_linguist.chronicle import TRANSCRIPT_DIR, show_for_date
from astra_linguist.models import Transcript
from astra_linguist.surface.surface import load_session
from astra_ontology import faerrin_campaign_slugs, load_being
from astra_ontology.models import Being
from astra_ontology_being import BEING_KDL_PATH

# linguist owns the corrected transcripts; reuse its data dir (single source).
# astra_linguist/__init__.py → src/ → apps/linguist, then /data.
LINGUIST_DATA_DIR = Path(astra_linguist.__file__).resolve().parents[2] / "data"


def faerrin_session(date: str, *, being: Being | None = None) -> str | None:
    """The campaign slug iff ``date`` is an ingestible faerrin-world session, else None.

    ``None`` covers three drop reasons, all non-fatal: no committed transcript / unknown
    slug, an ``EXCLUDED_DATES`` mislabel (handled inside ``show_for_date``), or a campaign
    in a non-faerrin world (e.g. sedecium, finnegan's ring).
    """
    show = show_for_date(date)
    if show is None:
        return None
    being = being if being is not None else load_being(BEING_KDL_PATH)
    return show.slug if show.slug in faerrin_campaign_slugs(being) else None


def ingestible_dates(*, being: Being | None = None) -> list[str]:
    """Every committed-transcript date the world filter keeps (sorted)."""
    being = being if being is not None else load_being(BEING_KDL_PATH)
    dates = {p.name.rsplit(".", 2)[1] for p in TRANSCRIPT_DIR.glob("*.txt")}
    return sorted(d for d in dates if faerrin_session(d, being=being) is not None)


def load_corrected_transcript(date: str) -> Transcript:
    """Parse ``apps/linguist/data/<date>.json`` into astra_linguist's ``Transcript``."""
    return load_session(LINGUIST_DATA_DIR / f"{date}.json")
