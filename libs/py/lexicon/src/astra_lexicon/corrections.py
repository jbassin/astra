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

from astra_config.kdl import load_document

Replacer = Callable[[str], str]

DEFS_PATH = Path(__file__).resolve().parent / "defs.kdl"

_REGEX_META = re.compile(r"[.*+?^${}()|[\]\\]")


def escape_regex(s: str) -> str:
    """Escape regex metacharacters so a literal span matches literally (faerrin parity)."""
    return _REGEX_META.sub(r"\\\g<0>", s)


def to_fragment(span: str) -> str:
    """A literal mistranscription span → a stored regex fragment: escape each word, join
    on `\\s*` so one entry covers inter-word spacing variants (faerrin `toFragment`)."""
    return r"\s*".join(escape_regex(w) for w in span.split() if w)


def load_defs(defs_path: Path | str = DEFS_PATH) -> dict[str, list[str]]:
    """Parse `defs.kdl` → `{canonical: [variant, ...]}` (order-stable)."""
    doc = load_document(defs_path)
    out: dict[str, list[str]] = {}
    for node in doc.nodes:
        if node.name != "entry" or not list(node.args):
            continue
        canonical = str(node.args[0])
        out[canonical] = [
            str(c.args[0]) for c in node.children if c.name == "variant" and list(c.args)
        ]
    return out


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
