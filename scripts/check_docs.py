"""Docs gate (`just docs-check`): keep the memory index small and every doc link live.

Fails when:
- thoughts/shared/memory/MEMORY.md exceeds its byte, entry or line budget;
- a `[[name]]` wikilink in a memory file names no file in the memory directory;
- a relative markdown link in a living doc points to a missing file. Living docs: docs/,
  the root CLAUDE.md, CONTRIBUTING.md and README.md, every app, lib and deploy README, the
  memory directory and the skills. The archive (thoughts/archive/) is history and is
  never checked.

Run from anywhere: paths resolve against the repo root (this file's parent's parent).
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MEMORY_DIR = ROOT / "thoughts" / "shared" / "memory"
INDEX = MEMORY_DIR / "MEMORY.md"

# The index is imported into every session and every subagent, so every byte costs.
MAX_INDEX_BYTES = 4096
MAX_INDEX_ENTRIES = 30
MAX_ENTRY_CHARS = 200  # one line: the markdown link plus a ~150-character hook

WIKILINK = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")
# [text](target) — skip images' inner text handling; we only need the target.
MDLINK = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
FENCE = re.compile(r"^\s*(```|~~~)")


def living_docs() -> list[Path]:
    docs = [ROOT / "CLAUDE.md", ROOT / "CONTRIBUTING.md", ROOT / "README.md"]
    docs += sorted((ROOT / "docs").rglob("*.md"))
    docs += sorted(MEMORY_DIR.glob("*.md"))
    docs += sorted((ROOT / ".claude" / "skills").glob("*/SKILL.md"))
    for base in ("apps", "libs", "ontology", "deploy", "dagster"):
        for readme in sorted((ROOT / base).rglob("README.md")):
            if "node_modules" in readme.parts or "signoz" in readme.parts:
                continue
            docs.append(readme)
    return [d for d in docs if d.is_file()]


def strip_code(text: str) -> str:
    """Drop fenced code blocks and inline code spans, where brackets are not links."""
    out: list[str] = []
    in_fence = False
    for line in text.splitlines():
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        if not in_fence:
            out.append(re.sub(r"`[^`]*`", "", line))
    return "\n".join(out)


def check_index(errors: list[str]) -> None:
    if not INDEX.is_file():
        errors.append(f"{INDEX.relative_to(ROOT)}: missing")
        return
    raw = INDEX.read_bytes()
    if len(raw) > MAX_INDEX_BYTES:
        errors.append(f"MEMORY.md is {len(raw)} bytes; the budget is {MAX_INDEX_BYTES}")
    entries = [ln for ln in raw.decode("utf-8").splitlines() if ln.startswith("- ")]
    if len(entries) > MAX_INDEX_ENTRIES:
        errors.append(f"MEMORY.md has {len(entries)} entries; the budget is {MAX_INDEX_ENTRIES}")
    errors.extend(
        f"MEMORY.md entry is {len(ln)} chars (max {MAX_ENTRY_CHARS}): {ln[:60]}…"
        for ln in entries
        if len(ln) > MAX_ENTRY_CHARS
    )


def check_wikilinks(errors: list[str]) -> None:
    for doc in sorted(MEMORY_DIR.glob("*.md")):
        names = WIKILINK.findall(strip_code(doc.read_text(encoding="utf-8")))
        errors.extend(
            f"{doc.relative_to(ROOT)}: [[{name}]] names no memory file"
            for name in names
            if not (MEMORY_DIR / f"{name.strip()}.md").is_file()
        )


def check_links(errors: list[str]) -> None:
    for doc in living_docs():
        for target in MDLINK.findall(strip_code(doc.read_text(encoding="utf-8"))):
            if re.match(r"^[a-z][a-z0-9+.-]*:", target) or target.startswith("#"):
                continue  # URL, mailto:, or an in-page anchor
            path = target.split("#", 1)[0]
            if not path:
                continue
            resolved = (ROOT / path.lstrip("/")) if path.startswith("/") else doc.parent / path
            if not resolved.exists():
                errors.append(f"{doc.relative_to(ROOT)}: broken link -> {target}")


def main() -> int:
    errors: list[str] = []
    check_index(errors)
    check_wikilinks(errors)
    check_links(errors)
    if errors:
        print("docs-check failed:", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return 1
    size = INDEX.stat().st_size
    print(f"docs-check ok: MEMORY.md {size}/{MAX_INDEX_BYTES} bytes, links resolve")
    return 0


if __name__ == "__main__":
    sys.exit(main())
