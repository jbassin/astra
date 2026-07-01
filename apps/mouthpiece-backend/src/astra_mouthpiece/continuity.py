"""Recap continuity (0021 Change B) — "previously, on this show" script context.

Built from the chronicle (Show → Season → Episode, 0019): the most-recent prior episodes
of this session's show + a best-effort current-season arc. Injected at the script stage
like the running-`threads_block` (faerrin caster precedent) so the hosts can open with real
"last time" continuity without the digest carrying it. Forward-only; empty input → "".
"""

from __future__ import annotations

from astra_linguist.chronicle import EpisodeEntry, Season

#: Char budget for the whole continuity block — kept SEPARATE from prompts.GROUNDING_BUDGET
#: (24_000) so "previously on" never eats into the akasha grounding window. Sized to hold
#: 6 fully-detailed episodes (full synopsis + all beats + cliffhanger, ~23k chars observed).
CONTINUITY_BUDGET = 26_000


def _episode_line(entry: EpisodeEntry, *, detailed: bool) -> str:
    """One prior-episode bullet: title + synopsis, plus cliffhanger + all beats if detailed."""
    summary = entry.summary
    line = f"- {summary.title} — {summary.synopsis}"
    if not detailed:
        return line
    extras: list[str] = []
    if summary.cliffhanger.strip():
        extras.append(f"  Cliffhanger: {summary.cliffhanger.strip()}")
    beats = [b for b in summary.key_beats if b.strip()]
    if beats:
        extras.append("  Beats: " + "; ".join(beats))
    return line + ("\n" + "\n".join(extras) if extras else "")


def build_continuity_block(
    prior: list[EpisodeEntry], season: Season | None, *, budget: int = CONTINUITY_BUDGET
) -> str:
    """Render the recap continuity block; empty (no prior + no season) → "".

    `prior` is oldest→newest; EVERY episode gets full detail (synopsis + all beats +
    cliffhanger). A best-effort `season` adds an arc-framing line. Episode detail is dropped
    least-recent-first once the block exceeds `budget` chars (the season line + the
    most-recent episode are always kept); a final hard cap is a backstop.
    """
    if not prior and season is None:
        return ""
    parts: list[str] = []
    if season is not None:
        parts.append(f'SEASON — "{season.title}": {season.arc_summary}')
    if prior:
        header = "PREVIOUSLY, on this show (oldest → most recent):"
        lines = [_episode_line(entry, detailed=True) for entry in prior]

        def _rendered() -> str:
            return "\n\n".join([*parts, header + "\n" + "\n".join(lines)])

        # Trim least-recent first while over budget, but never below the most-recent episode.
        while len(lines) > 1 and len(_rendered()) > budget:
            lines.pop(0)
        parts.append(header + "\n" + "\n".join(lines))
    block = "\n\n".join(parts)
    return block[:budget]
