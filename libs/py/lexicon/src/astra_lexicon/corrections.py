"""Transcription-correction replacer over `defs.kdl` (port of linguist `corrections.py`).

Each `entry` node is a correct form; its `variant` children are mistranscriptions
authored as **regex fragments** (intentionally NOT escaped). They compile into one
case-insensitive alternation of named groups `(?P<sN>\\b{val}\\b)`; a match is replaced
by the canonical of whichever group fired (first non-None wins, matching the JS "first
defined arg" semantics), and the whole result is stripped.

`defs.kdl` is the corrections SSOT (was `defs.yaml`, converted in 0020 S2b). Loading
goes through `astra_config.kdl`; write-back (`add_correction`) is a minimal-diff,
idempotent KDL text-insert (ckdl's emitter would reformat the whole file), so the
SSOT stays a clean PR diff.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from astra_config.kdl import load_document

Replacer = Callable[[str], str]

DEFS_PATH = Path(__file__).resolve().parent / "defs.kdl"

_REGEX_META = re.compile(r"[.*+?^${}()|[\]\\]")


def _kdl_str(s: str) -> str:
    """KDL v2 quoted string: escape backslash and double-quote (others are literal)."""
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


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


@dataclass(frozen=True)
class AddResult:
    added: bool
    reason: str = ""
    fragment: str = ""


def add_correction(canonical: str, span: str, defs_path: Path | str = DEFS_PATH) -> AddResult:
    """Append `span` as a mistranscription of `canonical` in `defs.kdl` — idempotent and
    minimal-diff (a targeted `variant` insert under the existing `entry`, not a full
    re-emit, so the corrections SSOT stays a clean PR). Skips empty spans, spans equal to
    the canonical, exact-duplicate fragments, and spans an existing pattern already
    covers (faerrin parity)."""
    fragment = to_fragment(span)
    if not fragment:
        return AddResult(False, "empty span")
    if fragment.lower() == canonical.lower():
        return AddResult(False, "variant equals canonical")

    path = Path(defs_path)
    text = path.read_text(encoding="utf-8")
    existing = load_defs(path).get(canonical) or []
    if fragment in existing:
        return AddResult(False, "duplicate", fragment)
    if any(_matches_literal(f, span) for f in existing):
        return AddResult(False, "already covered", fragment)

    updated = _insert_variant(text, canonical, fragment)
    if updated is None:  # entry absent (the lexicon grew beyond defs) → new block
        block = f"entry {_kdl_str(canonical)} {{\n    variant {_kdl_str(fragment)}\n}}\n"
        updated = text.rstrip("\n") + "\n" + block
    path.write_text(updated, encoding="utf-8")
    return AddResult(True, "added", fragment)


def _insert_variant(text: str, canonical: str, fragment: str) -> str | None:
    """Insert `    variant "{fragment}"` before the closing `}` of `entry "{canonical}"`;
    None if no such entry. Entries are flat (variant children only, no nested braces), so
    the first line that is `}` after the header closes the entry."""
    lines = text.split("\n")
    header = f"entry {_kdl_str(canonical)} {{"
    for i, line in enumerate(lines):
        if line == header:
            j = i + 1
            while j < len(lines) and lines[j].rstrip() != "}":
                j += 1
            lines.insert(j, f"    variant {_kdl_str(fragment)}")
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
    """Load `defs.kdl` and build the correction replacer."""
    return build_replacer(load_defs(defs_path))
