"""Session identity shared by the pipeline apps.

A session is keyed by its date in the non-zero-padded ``YYYY-M-D`` form (``2025-8-28``).
That string is the Dagster partition key of every pipeline app, the name of each per-session
directory, and the date segment of every transcript file name, so it must never be
reformatted. This package owns the parsing around that key:

- ``dates``: sort keys, ISO and ``datetime.date`` conversions.
- ``recordings``: Craig zip and track file names.
- ``transcripts``: ``<prefix>.<slug>.<date>.txt`` file names and lookups.
- ``atomic``: write-to-``.tmp``-then-rename.
- ``tools`` (import it explicitly; it pulls in the LLM stack): the bodies the heartwood and
  mouthpiece RLM agents share for their read-only wiki, transcript and entity tools.
"""

from .atomic import atomic_write_text, temp_sibling
from .dates import date_key, date_sort_key, format_date, iso_date, to_date
from .recordings import recording_date, recording_key, track_index, track_user
from .transcripts import (
    MIN_TRANSCRIPT_SEGMENTS,
    TRANSCRIPT_LINE,
    TranscriptName,
    find_transcript,
    parse_transcript_name,
    transcript_dates,
)

__all__ = [
    "MIN_TRANSCRIPT_SEGMENTS",
    "TRANSCRIPT_LINE",
    "TranscriptName",
    "atomic_write_text",
    "date_key",
    "date_sort_key",
    "find_transcript",
    "format_date",
    "iso_date",
    "parse_transcript_name",
    "recording_date",
    "recording_key",
    "temp_sibling",
    "to_date",
    "track_index",
    "track_user",
    "transcript_dates",
]
