"""Session selection + transcript access — the faerrin-world filter (0033 D33-6).

heartwood ingests only ``world == "faerrin"`` campaigns. This composes chronicle's
committed-filename session→show resolution (``show_for_date``, which already honors
``EXCLUDED_DATES``) with the faerrin world set (``faerrin_campaign_slugs``). An
unmatched/unknown slug is simply *not* faerrin — never a crash.

Transcripts are the committed ``apps/linguist/transcripts/<prefix>.<slug>.<date>.txt``
files (``NNNNNN\\tSpeaker: text``). Dates are non-zero-padded, so ordering uses
chronicle's ``date_key`` (a string sort puts 2025-10-20 before 2025-8-28).

Reuse-don't-reinvent: ``TRANSCRIPT_DIR``, ``show_for_date``/``EXCLUDED_DATES`` and
``date_key`` all come from ``astra_linguist.chronicle``. No LLM or Dagster imports.
"""

from __future__ import annotations

from pathlib import Path

from astra_linguist.chronicle import TRANSCRIPT_DIR, date_key, show_for_date, show_index
from astra_ontology import faerrin_campaign_slugs, load_being
from astra_ontology.models import Being
from astra_ontology_being import BEING_KDL_PATH


def faerrin_session(
    date: str, *, being: Being | None = None, transcript_dir: Path = TRANSCRIPT_DIR
) -> str | None:
    """The campaign slug iff ``date`` is an ingestible faerrin-world session, else None.

    ``None`` covers three drop reasons, all non-fatal: no committed transcript / unknown
    slug, an ``EXCLUDED_DATES`` mislabel (handled inside ``show_for_date``), or a campaign
    in a non-faerrin world (e.g. sedecium, finnegan's ring). ``transcript_dir`` is the
    test seam (fixture transcripts + a fixture ``being``).
    """
    being = being if being is not None else load_being(BEING_KDL_PATH)
    show = show_for_date(date, transcript_dir=transcript_dir, shows=show_index(being))
    if show is None:
        return None
    return show.slug if show.slug in faerrin_campaign_slugs(being) else None


def ingestible_dates(
    *, being: Being | None = None, transcript_dir: Path = TRANSCRIPT_DIR
) -> list[str]:
    """Every committed-transcript date the world filter keeps, oldest first."""
    being = being if being is not None else load_being(BEING_KDL_PATH)
    dates = {p.name.rsplit(".", 2)[1] for p in transcript_dir.glob("*.txt")}
    return sorted(
        (
            d
            for d in dates
            if faerrin_session(d, being=being, transcript_dir=transcript_dir) is not None
        ),
        key=date_key,
    )


def transcript_path(date: str, *, transcript_dir: Path = TRANSCRIPT_DIR) -> Path:
    """The committed ``.txt`` transcript for ``date``; raises ``FileNotFoundError`` if absent."""
    matches = sorted(transcript_dir.glob(f"*.{date}.txt"))
    if not matches:
        raise FileNotFoundError(f"no committed transcript for {date} in {transcript_dir}")
    return matches[0]


def read_transcript(date: str, *, transcript_dir: Path = TRANSCRIPT_DIR) -> str:
    """The full text of ``date``'s committed transcript."""
    return transcript_path(date, transcript_dir=transcript_dir).read_text(encoding="utf-8")
