"""Transcription-correction replacer over `defs.kdl` (port of linguist `corrections.py`).

Each `entry` node is a correct form; its `variant` children are mistranscriptions
authored as **regex fragments** (intentionally NOT escaped). They compile into one
case-insensitive alternation of named groups `(?P<sN>\\b{val}\\b)`; a match is replaced
by the canonical of whichever group fired (first non-None wins, matching the JS "first
defined arg" semantics), and the whole result is stripped.

`defs.kdl` is the corrections SSOT (was `defs.yaml`, converted in 0020 S2b), edited by
hand. Loading goes through `astra_config.kdl`.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from pathlib import Path
from typing import Annotated

from astra_config.kdl import Arg, Children, decode, load_kdl
from pydantic import BaseModel, ConfigDict

Replacer = Callable[[str], str]

DEFS_PATH = Path(__file__).resolve().parent / "defs.kdl"

_REGEX_META = re.compile(r"[.*+?^${}()|[\]\\]")


class _Entry(BaseModel):
    """One `entry "Canonical" { variant "fragment" ... }` node."""

    model_config = ConfigDict(extra="forbid")

    canonical: Annotated[str, Arg()]
    variants: Annotated[list[str], Children("variant")] = []


class _Defs(BaseModel):
    """`defs.kdl`: a list of `entry` nodes (other top-level nodes are ignored)."""

    entries: Annotated[list[_Entry], Children("entry")] = []


def escape_regex(s: str) -> str:
    """Escape regex metacharacters so a literal span matches literally (faerrin parity)."""
    return _REGEX_META.sub(r"\\\g<0>", s)


def to_fragment(span: str) -> str:
    """A literal mistranscription span → a stored regex fragment: escape each word, join
    on `\\s*` so one entry covers inter-word spacing variants (faerrin `toFragment`)."""
    return r"\s*".join(escape_regex(w) for w in span.split() if w)


def load_defs(defs_path: Path | str = DEFS_PATH) -> dict[str, list[str]]:
    """Parse `defs.kdl` → `{canonical: [variant, ...]}` (order-stable)."""
    return {e.canonical: e.variants for e in decode(_Defs, load_kdl(defs_path)).entries}


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
    """Load `defs.kdl` and build the correction replacer."""
    return build_replacer(load_defs(defs_path))
