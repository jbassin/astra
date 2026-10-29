"""Apply `defs.kdl`'s corrections to text already on disk.

linguist corrects a transcript when it writes it, with the corrections of that day. An entry
added later (Osyluth, 2026-10-28) leaves every earlier transcript, chronicle entry and script
with the old spelling, so the stored files are rewritten whenever `defs.kdl` changes
(linguist's `stored_corrections` asset) instead of every reader correcting what it reads.

Rewrites keep each file's shape: a text file is corrected line by line (a `\\s*` in a variant
never joins two lines, so line ids and counts stay put), and a JSON file has its string values
corrected and is written back in the writers' format (`indent=2`, `ensure_ascii=False`, the
original trailing newline). A JSON file that format does not reproduce is left alone.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .corrections import DEFS_PATH, Replacer


def defs_digest(defs_path: Path | str = DEFS_PATH) -> str:
    """A fingerprint of `defs.kdl`: stored text is current when it was corrected with this."""
    return hashlib.sha256(Path(defs_path).read_bytes()).hexdigest()


def _fix(fix: Replacer, text: str) -> str:
    """`text` corrected, keeping its leading and trailing whitespace (the replacer strips)."""
    core = text.strip()
    if not core:
        return text
    start = len(text) - len(text.lstrip())
    return text[:start] + fix(core) + text[start + len(core) :]


def correct_text(fix: Replacer, text: str) -> str:
    """`text` corrected line by line, line endings untouched."""
    return "".join(_fix(fix, line) for line in text.splitlines(keepends=True))


def correct_value(fix: Replacer, value: Any) -> Any:
    """`value` with every string in it corrected (object keys are left alone)."""
    if isinstance(value, str):
        return _fix(fix, value)
    if isinstance(value, list):
        return [correct_value(fix, v) for v in value]
    if isinstance(value, dict):
        return {k: correct_value(fix, v) for k, v in value.items()}
    return value


def _dump(value: Any, newline: bool) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False) + ("\n" if newline else "")


def correct_file(path: Path, fix: Replacer) -> bool | None:
    """Correct `path` in place. True when it changed, False when it was already current,
    None when it is JSON this module cannot write back unchanged (skipped)."""
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".json":
        value = json.loads(text)
        newline = text.endswith("\n")
        if _dump(value, newline) != text:
            return None
        fixed = _dump(correct_value(fix, value), newline)
    else:
        fixed = correct_text(fix, text)
    if fixed == text:
        return False
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(fixed, encoding="utf-8")
    tmp.replace(path)
    return True
