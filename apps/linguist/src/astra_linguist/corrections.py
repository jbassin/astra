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
from pathlib import Path

import yaml

Replacer = Callable[[str], str]

DEFS_PATH = Path(__file__).resolve().parent / "defs.yaml"


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
