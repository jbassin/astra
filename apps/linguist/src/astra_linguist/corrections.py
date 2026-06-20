"""Transcription-correction replacer from `defs.yaml` (P2, port of `corrections.ts`).

Each YAML key is a correct form; its values are mistranscriptions authored as
**regex fragments** (intentionally NOT escaped). They compile into one
case-insensitive alternation of named groups `(?P<sN>\\b{val}\\b)`; a match is
replaced by the key of whichever group fired (first non-None wins, matching the
JS "first defined arg" semantics), and the whole result is stripped.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import yaml

Replacer = Callable[[str], str]

DEFS_PATH = Path(__file__).resolve().parent / "defs.yaml"

_REGEX_META = re.compile(r"[.*+?^${}()|[\]\\]")


def escape_regex(s: str) -> str:
    """Escape regex metacharacters so a literal span matches literally (faerrin parity)."""
    return _REGEX_META.sub(r"\\\g<0>", s)


def to_fragment(span: str) -> str:
    """A literal mistranscription span → a stored regex fragment: escape each word, join
    on `\\s*` so one entry covers inter-word spacing variants (faerrin `toFragment`)."""
    return r"\s*".join(escape_regex(w) for w in span.split() if w)


def _matches_literal(fragment: str, span: str) -> bool:
    """True if an existing `fragment` already matches `span` (case-insensitive, anchored)."""
    try:
        return re.fullmatch(fragment, span.strip(), re.IGNORECASE) is not None
    except re.error:
        return False


@dataclass(frozen=True)
class AddResult:
    added: bool
    reason: str = ""
    fragment: str = ""


def add_correction(canonical: str, span: str, defs_path: Path | str = DEFS_PATH) -> AddResult:
    """Append `span` as a mistranscription of `canonical` in `defs.yaml` — idempotent and
    minimal-diff (a targeted text insert under the existing key, not a full YAML redump, so
    the corrections SSOT stays a clean PR). Skips empty spans, spans equal to the canonical,
    exact-duplicate fragments, and spans an existing pattern already covers (faerrin parity)."""
    fragment = to_fragment(span)
    if not fragment:
        return AddResult(False, "empty span")
    if fragment.lower() == canonical.lower():
        return AddResult(False, "variant equals canonical")

    path = Path(defs_path)
    text = path.read_text(encoding="utf-8")
    doc = yaml.safe_load(text) or {}
    existing = doc.get(canonical) or []
    existing = existing if isinstance(existing, list) else []
    if fragment in existing:
        return AddResult(False, "duplicate", fragment)
    if any(_matches_literal(f, span) for f in existing):
        return AddResult(False, "already covered", fragment)

    updated = _insert_fragment(text, canonical, fragment)
    if updated is None:  # key absent (only when the lexicon grows beyond defs keys) → new block
        updated = text.rstrip("\n") + f"\n{canonical}:\n  - {fragment}\n"
    path.write_text(updated, encoding="utf-8")
    return AddResult(True, "added", fragment)


def _insert_fragment(text: str, canonical: str, fragment: str) -> str | None:
    """Insert `  - {fragment}` after the last value line of `canonical:`; None if no such key."""
    lines = text.split("\n")
    key = f"{canonical}:"
    for i, line in enumerate(lines):
        if line.rstrip() == key:  # a top-level mapping key (column 0)
            j = i + 1
            while j < len(lines) and lines[j][:1] in (" ", "\t"):  # its indented value lines
                j += 1
            lines.insert(j, f"  - {fragment}")
            return "\n".join(lines)
    return None


def build_replacer(defs: dict[str, list[str]]) -> Replacer:
    """Compile a defs mapping into the trim+replace function."""
    patterns: list[str] = []
    mapping: list[str] = []
    for key, values in defs.items():
        for val in values:
            patterns.append(rf"(?P<s{len(mapping)}>\b{val}\b)")
            mapping.append(key)

    if not patterns:
        return lambda text: text.strip()

    pattern = re.compile("|".join(patterns), re.IGNORECASE)

    def replace(match: re.Match[str]) -> str:
        for i, group in enumerate(match.groups()):
            if group is not None:
                return mapping[i]
        return match.group(0)

    return lambda text: pattern.sub(replace, text).strip()


def load_corrections(defs_path: Path | str = DEFS_PATH) -> Replacer:
    """Load `defs.yaml` and build the correction replacer."""
    doc = yaml.safe_load(Path(defs_path).read_text(encoding="utf-8")) or {}
    return build_replacer(doc)
