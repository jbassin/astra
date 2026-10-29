"""Session selection + transcript access — the faerrin-world filter.

heartwood ingests only ``world == "faerrin"`` campaigns. This composes chronicle's
committed-filename session→show resolution (``show_for_date``, which already honors
the `sessions.kdl` skips) with the faerrin world set (``faerrin_campaign_slugs``). An
unmatched/unknown slug is simply *not* faerrin — never a crash.

Transcripts are the ``<prefix>.<slug>.<date>.txt`` files under config ``data.linguist-transcripts``
(``NNNNNN\\tSpeaker: text``, in the astra-data repo). Dates are non-zero-padded, so ordering uses
``astra_sessions.date_key`` (a string sort puts 2025-10-20 before 2025-8-28).

Reuse-don't-reinvent: ``TRANSCRIPT_DIR`` and ``show_for_date`` (with its skips) come from
``astra_linguist.chronicle``; date keys and transcript file names from ``astra_sessions``.
No LLM or Dagster imports.
"""

from __future__ import annotations

from functools import cache
from pathlib import Path

from astra_lexicon import Replacer, load_corrections
from astra_linguist.chronicle import TRANSCRIPT_DIR, show_for_date, show_index
from astra_ontology import faerrin_campaign_slugs, load_being
from astra_ontology.models import Being
from astra_ontology_being import BEING_KDL_PATH
from astra_sessions import date_key, find_transcript, transcript_dates


def faerrin_session(
    date: str, *, being: Being | None = None, transcript_dir: Path = TRANSCRIPT_DIR
) -> str | None:
    """The campaign slug iff ``date`` is an ingestible faerrin-world session, else None.

    ``None`` covers three drop reasons, all non-fatal: no committed transcript / unknown
    slug, a `sessions.kdl` skip (handled inside ``show_for_date``), or a campaign
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
    dates = transcript_dates(transcript_dir)
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
    path = find_transcript(date, transcript_dir)
    if path is None:
        raise FileNotFoundError(f"no committed transcript for {date} in {transcript_dir}")
    return path


def read_transcript(date: str, *, transcript_dir: Path = TRANSCRIPT_DIR) -> str:
    """The full text of ``date``'s committed transcript, with today's `defs.kdl` corrections
    applied: a transcript made before an entry existed keeps its old mistranscriptions, and
    the agent would write them into the wiki (Ocelith for Osyluth, 2026-10-28)."""
    text = transcript_path(date, transcript_dir=transcript_dir).read_text(encoding="utf-8")
    # The replacer strips its result; keep the file's trailing newline.
    fixed = _corrections()(text)
    return fixed + "\n" if text.endswith("\n") else fixed


@cache
def _corrections() -> Replacer:
    """`defs.kdl`'s corrections, compiled once: search_transcripts reads every session."""
    return load_corrections()
