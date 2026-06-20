"""Canonical line-numbered transcript (P5, port of `build-transcripts.ts`).

Header-length agnostic: drop everything up to the first `> ` line, strip the
leading `> ` from each body line, and emit `NNNNNN\\t<text>` with a 6-digit
zero-padded counter. Empty body lines stay unnumbered (a blank number field),
matching the historical `cut -c 3- | nl -n rz` form.
"""

from __future__ import annotations

_BLANK_NUMBER = " " * 6


def to_canonical(context_txt: str) -> str:
    """A mouthpiece-context `.txt` → the canonical line-numbered transcript."""
    lines = context_txt.split("\n")
    start = next((i for i, line in enumerate(lines) if line.startswith("> ")), -1)
    if start < 0:
        return ""

    body = lines[start:]
    if body and body[-1] == "":
        body.pop()  # a trailing empty from a final newline isn't numbered

    out: list[str] = []
    counter = 0
    for line in body:
        text = line[2:]  # strip "> " (first 2 chars), like `cut -c 3-`
        if text:
            counter += 1
            out.append(f"{counter:06d}\t{text}")
        else:
            out.append(f"{_BLANK_NUMBER}\t")
    return "\n".join(out) + "\n"
