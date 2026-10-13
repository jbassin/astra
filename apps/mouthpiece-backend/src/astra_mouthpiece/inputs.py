"""Script-stage inputs, Dagster-free (0034 D34-11).

`cleaned_turns_for` is the single re-derivation of a session's cleaned transcript, shared
by `assets.session_script` and the 0034 producer experiment so the two cannot drift. It
only reads: the digest is loaded without `assets._session_dir`'s `mkdir`.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from . import clean, linguist_io
from .models import SessionDigest

if TYPE_CHECKING:
    from .producer.brief import ProducerBrief


def episodes_root() -> Path:
    """`mouthpiece.episodes-path` (config-single-source)."""
    from astra_ontology_config import load as load_config

    return Path(load_config().mouthpiece.episodes_path)


def read_digest(key: str, *, root: Path | None = None) -> SessionDigest:
    path = (root if root is not None else episodes_root()) / key / "digest.json"
    return SessionDigest.model_validate_json(path.read_text(encoding="utf-8"))


def cleaned_turns_for(
    key: str, digest: SessionDigest, *, transcript_dir: Path | None = None
) -> list[tuple[int, str, str]]:
    """The session's cleaned turns `(line_id, speaker, text)`.

    Stage-3 re-read guard (0024 §4.3): re-parse the canonical transcript fresh rather
    than trusting anything cached from Stage 2 — a FROM_FAILURE re-execution could have
    regenerated it, and kept_ranges are line-id ranges into a SPECIFIC file. Symmetric
    with Stage 2: hallucination lines are dropped BEFORE the ranges apply.
    """
    tpath = (
        linguist_io.transcript_for(key)
        if transcript_dir is None
        else linguist_io.transcript_for(key, transcript_dir)
    )
    if tpath is None:
        raise FileNotFoundError(f"no linguist transcript for session {key}")
    turns = linguist_io.parse_canonical_transcript(tpath.read_text(encoding="utf-8"))
    clean.assert_no_drift(turns, digest)
    speech, _ = clean.drop_hallucinations(turns)
    return clean.apply_kept_ranges(speech, digest.kept_ranges)


def brief_path(key: str, *, root: Path | None = None) -> Path:
    """`episodes/<key>/brief.json` — the producer brief `session_script` reads (0035 D35-8)."""
    return (root if root is not None else episodes_root()) / key / "brief.json"


def read_brief(key: str, *, root: Path | None = None) -> ProducerBrief | None:
    """The session's brief, or None when absent. Raises on an invalid file (caller WARNs)."""
    from .producer.brief import ProducerBrief

    path = brief_path(key, root=root)
    if not path.is_file():
        return None
    return ProducerBrief.model_validate_json(path.read_text(encoding="utf-8"))
