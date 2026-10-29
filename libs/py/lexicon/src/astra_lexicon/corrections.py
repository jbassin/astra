"""Transcription-correction replacer over `defs.kdl` (port of linguist `corrections.py`).

Each `entry` node is a correct form; its `variant` children are mistranscriptions
authored as **regex fragments** (intentionally NOT escaped). They compile into one
pattern of named groups; a match is replaced by the canonical of whichever group fired
(the first defined entry wins, matching the JS "first defined arg" semantics), and the
whole result is stripped. Variants match case-insensitively; canonicals match as written.

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

#: How a variant fragment may begin: a word character, a `[...]` class of word characters,
#: `(?-i:` then a word character, or an escaped symbol. No quantifier may follow, or the
#: first character would be optional or repeated.
_FRAGMENT_HEAD = re.compile(
    r"""
    (?P<char>[^\W_])(?![?*+{])
  | \[(?P<cls>[^\W_]+)\](?![?*+{])
  | \(\?-i:(?P<exact>[^\W_])
  | \\(?P<esc>\W)
    """,
    re.VERBOSE,
)


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


def _has_top_level_alternation(fragment: str) -> bool:
    """True when `fragment` holds a `|` outside any group or class: splitting its first
    character off would then change what the `|`'s left side means."""
    depth = 0
    in_class = False
    chars = iter(fragment)
    for c in chars:
        if c == "\\":
            next(chars, None)
        elif in_class:
            in_class = c != "]"
        elif c == "[":
            in_class = True
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
        elif c == "|" and depth == 0:
            return True
    return False


def _split_head(fragment: str, canonical: str) -> tuple[set[str], str]:
    """A variant fragment as (the characters it can start with, the pattern for the rest).

    The rest carries the fragment's case rule itself, `(?i:...)` unless the fragment opened
    with `(?-i:`, because the compiled pattern has no flags. The starting characters are
    both cases of the head; `re.IGNORECASE` also folds a few odd code points onto ASCII
    (the Kelvin sign onto `k`), which no transcript contains."""
    m = _FRAGMENT_HEAD.match(fragment)
    if m is None or _has_top_level_alternation(fragment):
        raise ValueError(
            f"variant {fragment!r} of {canonical!r}: a variant must start with a letter, a digit,"
            " a [...] class of them, `(?-i:` or an escaped symbol, with no quantifier on it and"
            " no `|` outside a group"
        )
    rest = fragment[m.end() :]
    if m["exact"] is not None:
        return {m["exact"]}, rf"(?-i:{rest}\b"
    heads: str = m["char"] or m["cls"] or m["esc"]
    chars = {c for h in heads for c in (h.lower(), h.upper()) if len(c) == 1}
    return chars, rf"(?i:{rest})\b"


def build_replacer(defs: dict[str, list[str]]) -> Replacer:
    """Compile a defs mapping into the trim+replace function.

    The pattern dispatches on the first character: `\\b(?:A(?:...)|a(?:...)|...)`, each
    branch holding, in `defs` order, the canonicals and variants that can start with that
    character. A flat alternation of all ~800 groups made `re` try every one at every
    position (30 s per transcript; `stored_corrections` took two hours); here it rejects a
    bucket on one character and tries ~30 groups per word start instead. The result is the
    same: at one position only the groups that start with the text's character can match,
    and those keep their relative order.

    Each canonical, in its exact case, comes before every variant and matches as itself, so
    text that is already correct is left as it is and a second pass changes nothing.
    Without that, a canonical that contains one of its variants grows on every pass
    (`https://btl.iridi.cc` holds `BTL`, `Children of the Heir` holds `Children of the`), and
    `stored_corrections` re-applies the corrections to stored text each time `defs.kdl`
    changes."""
    #: Group name -> replacement; None keeps the matched text (an already-correct canonical).
    mapping: dict[str, str | None] = {}
    #: First character -> its branches, in `defs` order, behind one hoisted `\b`.
    buckets: dict[str, list[str]] = {}
    #: Canonicals that start on a symbol, where `\b` never matches; they come first.
    unbounded: list[str] = []

    def group(body: str, replacement: str | None) -> str:
        name = f"s{len(mapping)}"
        mapping[name] = replacement
        return rf"(?P<{name}>{body})"

    for key in defs:
        tail = r"\b" if re.search(r"\w$", key) else ""
        if re.match(r"\w", key):
            buckets.setdefault(key[0], []).append(group(escape_regex(key[1:]) + tail, None))
        else:
            unbounded.append(group(escape_regex(key) + tail, None))
    for key, values in defs.items():
        for val in values:
            chars, rest = _split_head(val, key)
            for c in sorted(chars):
                buckets.setdefault(c, []).append(group(rest, key))

    parts = list(unbounded)
    if buckets:
        branches = (f"{escape_regex(c)}(?:{'|'.join(gs)})" for c, gs in buckets.items())
        parts.append(rf"\b(?:{'|'.join(branches)})")
    if not parts:
        return lambda text: text.strip()

    pattern = re.compile("|".join(parts))

    def replace(match: re.Match[str]) -> str:
        # The named group closes after any group inside a variant, so it is the last one.
        replacement = mapping.get(match.lastgroup or "")
        return match.group(0) if replacement is None else replacement

    return lambda text: pattern.sub(replace, text).strip()


def load_corrections(defs_path: Path | str = DEFS_PATH) -> Replacer:
    """Load `defs.kdl` and build the correction replacer."""
    return build_replacer(load_defs(defs_path))
