"""Transcription-correction replacer over `defs.kdl` (port of linguist `corrections.py`).

Each `entry` node is a correct form; its `variant` children are mistranscriptions
authored as **regex fragments** (intentionally NOT escaped). They compile into one
case-insensitive alternation of named groups `(?P<sN>\\b{val}\\b)`; a match is replaced
by the canonical of whichever group fired (first non-None wins, matching the JS "first
defined arg" semantics), and the whole result is stripped.

`defs.kdl` is the corrections SSOT (converted from `defs.yaml`), edited by
hand. Loading goes through `astra_config.kdl`.

An entry may also carry how the name is said, `entry "Faerrin" ipa="ˈfɛrɪn"`. mouthpiece
reads these (`load_pronunciations`) and inlines the IPA in its ElevenLabs dialogue text.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from pathlib import Path
from typing import Annotated

from astra_config.kdl import Arg, Children, Prop, decode, load_kdl
from pydantic import BaseModel, ConfigDict

Replacer = Callable[[str], str]

DEFS_PATH = Path(__file__).resolve().parent / "defs.kdl"

_REGEX_META = re.compile(r"[.*+?^${}()|[\]\\]")


class _Entry(BaseModel):
    """One `entry "Canonical" ipa="…" { variant "fragment" ... }` node."""

    model_config = ConfigDict(extra="forbid")

    canonical: Annotated[str, Arg()]
    #: How the name is pronounced, in IPA without slashes (optional).
    ipa: Annotated[str | None, Prop()] = None
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


def _entries(defs_path: Path | str) -> list[_Entry]:
    return decode(_Defs, load_kdl(defs_path)).entries


def load_defs(defs_path: Path | str = DEFS_PATH) -> dict[str, list[str]]:
    """Parse `defs.kdl` → `{canonical: [variant, ...]}` (order-stable)."""
    return {e.canonical: e.variants for e in _entries(defs_path)}


def load_pronunciations(defs_path: Path | str = DEFS_PATH) -> dict[str, str]:
    """`defs.kdl` → `{canonical: ipa}` for the entries that carry a non-blank `ipa`."""
    return {e.canonical: e.ipa.strip() for e in _entries(defs_path) if e.ipa and e.ipa.strip()}


def _literal(canonical: str) -> str:
    """`canonical` as a pattern that matches it exactly, case included, with a word boundary
    on each edge that is a word character (`Gas-n-Go℠` ends on a symbol, where `\\b` never
    matches)."""
    head = r"\b" if re.match(r"\w", canonical) else ""
    tail = r"\b" if re.search(r"\w$", canonical) else ""
    # Case-sensitive: an entry may exist only to fix case (`fane` -> `Fane`).
    return f"(?-i:{head}{escape_regex(canonical)}{tail})"


def build_replacer(defs: dict[str, list[str]]) -> Replacer:
    """Compile a defs mapping into the trim+replace function.

    Each canonical, in its exact case, comes first in the alternation and matches as itself,
    so text that is already correct is left as it is and a second pass changes nothing.
    Without that, a canonical that contains one of its variants grows on every pass
    (`https://btl.iridi.cc` holds `BTL`, `Children of the Heir` holds `Children of the`), and
    `stored_corrections` re-applies the corrections to stored text each time `defs.kdl`
    changes."""
    patterns: list[str] = []
    #: Group name -> replacement; None keeps the matched text (an already-correct canonical).
    mapping: dict[str, str | None] = {}
    for key in defs:
        name = f"s{len(mapping)}"
        patterns.append(rf"(?P<{name}>{_literal(key)})")
        mapping[name] = None
    for key, values in defs.items():
        for val in values:
            name = f"s{len(mapping)}"
            patterns.append(rf"(?P<{name}>\b{val}\b)")
            mapping[name] = key

    if not patterns:
        return lambda text: text.strip()

    pattern = re.compile("|".join(patterns), re.IGNORECASE)

    def replace(match: re.Match[str]) -> str:
        # The named group closes after any group inside a variant, so it is the last one.
        replacement = mapping.get(match.lastgroup or "")
        return match.group(0) if replacement is None else replacement

    return lambda text: pattern.sub(replace, text).strip()


def load_corrections(defs_path: Path | str = DEFS_PATH) -> Replacer:
    """Load `defs.kdl` and build the correction replacer."""
    return build_replacer(load_defs(defs_path))
