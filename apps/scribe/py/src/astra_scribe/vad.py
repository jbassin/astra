"""VAD-trim + chunking (F2/G2) — pure span math, so it unit-tests without ffmpeg.

`voiced_spans` inverts silencedetect's silence intervals into voiced (start,end)
spans in **session time**, with a small pre/post-roll and adjacent-span merge.
`chunk_spans` splits any voiced span longer than the Groq chunk budget. Because
every chunk is a single contiguous session-time slice, re-offsetting Groq's
segments is just `+chunk_start` — no concatenation seam to dup/drop (Risk 2).
"""

from __future__ import annotations

Span = tuple[float, float]


def voiced_spans(
    silences: list[Span],
    duration: float,
    *,
    pre_roll: float = 0.2,
    post_roll: float = 0.2,
    merge_gap: float = 1.0,
) -> list[Span]:
    """Silence intervals → voiced spans (session time), roll-padded + gap-merged."""
    voiced: list[Span] = []
    cursor = 0.0
    for start, end in sorted(silences):
        if start > cursor:
            voiced.append((cursor, min(start, duration)))
        cursor = max(cursor, end)
    if cursor < duration:
        voiced.append((cursor, duration))

    padded = [(max(0.0, a - pre_roll), min(duration, b + post_roll)) for a, b in voiced]

    merged: list[Span] = []
    for span in padded:
        if merged and span[0] - merged[-1][1] < merge_gap:
            merged[-1] = (merged[-1][0], max(merged[-1][1], span[1]))
        else:
            merged.append(span)
    return [s for s in merged if s[1] > s[0]]


def chunk_spans(spans: list[Span], max_sec: float = 1200.0) -> list[Span]:
    """Split voiced spans so no chunk exceeds `max_sec`. Callers pass a budget sized to
    Groq's upload cap (TrackTranscriber uses 8 min → ≤ ~14.6 MiB at 16 kHz mono s16 flac)."""
    out: list[Span] = []
    for start, end in spans:
        cursor = start
        while cursor < end:
            out.append((cursor, min(cursor + max_sec, end)))
            cursor += max_sec
    return out
