"""The mega path — a month-in-review recap fused from several sessions in a date
range (ported from caster `mega/`). Member selection + synthetic id are PURE +
fully tested; `fuse_digests` reuses the distill tool (so the fused output is a
normal `SessionDigest` the two-pass script stage consumes unchanged) with the
verbatim `MEGA_SYSTEM_PROMPT`, via raw `call_tool` (H1).
"""

from __future__ import annotations

from typing import Any

from astra_llm import LlmClient, ToolCallRequest
from pydantic import BaseModel

from .digest import parse_digest
from .models import SessionDigest
from .schemas import distill_tool


class MegaMember(BaseModel):
    """A member session (metadata) paired with its already-distilled digest."""

    session_id: str
    date: str
    arc: str
    arc_title: str | None = None
    digest: SessionDigest


def date_sort_key(date: str) -> int:
    """Numeric key for a "YYYY-M-D" (unpadded) date — ported from `dateSortKey`."""
    parts = (date.split("-") + ["0", "0", "0"])[:3]
    y, m, d = (int(p) if p.isdigit() else 0 for p in parts)
    return y * 10000 + m * 100 + d


def date_in_range(date: str, start: str, end: str) -> bool:
    """Inclusive date-range test on the "YYYY-M-D" form, via the numeric key."""
    k = date_sort_key(date)
    return date_sort_key(start) <= k <= date_sort_key(end)


def select_members(
    members: list[MegaMember], start: str, end: str, arc: str | None = None
) -> list[MegaMember]:
    """Pick the sessions a mega episode covers: in [start, end], optionally one arc.
    Chronological order. Raises on empty range, no matches, or a cross-arc span."""
    if date_sort_key(start) > date_sort_key(end):
        raise ValueError(f"Empty range: from ({start}) is after to ({end}).")
    picked = [m for m in members if date_in_range(m.date, start, end)]
    if arc:
        picked = [m for m in picked if m.arc == arc]
    if not picked:
        raise ValueError(f"No sessions in {start}..{end}{f' for arc {arc!r}' if arc else ''}.")
    arcs = {m.arc for m in picked}
    if len(arcs) > 1:
        raise ValueError(
            f"Sessions in {start}..{end} span multiple arcs ({', '.join(sorted(arcs))}). "
            "Pass an explicit arc to pick one."
        )
    return sorted(picked, key=lambda m: date_sort_key(m.date))


def mega_id(members: list[MegaMember]) -> str:
    """Synthetic session id: `<arcNumber>.<arcSlug>.<lastDate>-recap-of-<firstDate>`
    — keyed so the consuming site treats it like any other episode (sorts to the
    END of its arc as a capstone)."""
    if not members:
        raise ValueError("mega_id needs at least one member session.")
    sorted_members = sorted(members, key=lambda m: date_sort_key(m.date))
    first, last = sorted_members[0], sorted_members[-1]
    arc_number = first.session_id.split(".")[0]
    return f"{arc_number}.{first.arc}.{last.date}-recap-of-{first.date}"


# Verbatim from caster `mega/prompt.ts` (byte-identical; faerrin's unwrapped long
# lines are expressed as implicit string concatenation, asserted in test_prompt_fidelity).
MEGA_SYSTEM_PROMPT = (
    "You are a story editor assembling a MONTH-IN-REVIEW recap for an actual-play "
    "Pathfinder 2e podcast.\n"
    "\n"
    "You receive several ALREADY-DISTILLED session digests from one campaign arc, in "
    "chronological order. Each digest has a synopsis and ordered beats (summary, "
    "significance, details, tone, tableAngle, characters, locations, wikiRefs). The "
    "noisy table talk has already been filtered out upstream.\n"
    "\n"
    "Fuse them into ONE consolidated digest the hosts can cover in a single episode — a "
    '"big month" recap, NOT a sum of every session:\n'
    "- Select the MOST SIGNIFICANT beats across the whole stretch: the throughline, the "
    "biggest turns and reversals, the payoffs, the cliffhangers. Drop minor connective "
    "tissue.\n"
    "- Preserve chronological order across sessions, so the recap reads as one continuous "
    "movement.\n"
    "- Merge or condense beats that repeat or build on each other into a single stronger "
    "beat, carrying forward the sharpest details, significance, tone, and tableAngle.\n"
    "- Hit the BEAT BUDGET stated in the request — that target is the episode-length "
    "control, so select to roughly that many beats for the whole span regardless of how "
    "many sessions you were given. If no target is stated, aim for about 15.\n"
    "- Write a synopsis that frames the ENTIRE span as one arc movement — where the party "
    "began this stretch and where they ended up.\n"
    "- Stay grounded: every beat must come from the provided digests. Do not invent "
    "events, outcomes, or color that isn't there. Use proper nouns exactly as the digests do.\n"
    "\n"
    'Record your result by calling the provided tool exactly once. Leave "discarded" '
    "empty — there is no raw table talk to sample at this stage."
)


def _render_member(member: MegaMember, n: int) -> str:
    lines = [
        f"## Session {n} — {member.session_id} ({member.date})",
        f"Synopsis: {member.digest.synopsis}",
        "",
        "Beats:",
    ]
    for beat in member.digest.beats:
        lines.append(f"{beat.order}. {beat.summary}")
        if beat.significance:
            lines.append(f"   significance: {beat.significance}")
        if beat.tone:
            lines.append(f"   tone: {beat.tone}")
        if beat.details:
            lines.append(f"   details: {'; '.join(beat.details)}")
        if beat.table_angle:
            lines.append(f"   angle: {beat.table_angle}")
        refs = list(dict.fromkeys([*beat.characters, *beat.locations, *beat.wiki_refs]))
        if refs:
            lines.append(f"   refs: {', '.join(refs)}")
    return "\n".join(lines)


def build_mega_user_content(members: list[MegaMember], target_beats: int | None = None) -> str:
    """The fuse user content: member digests in chronological order + beat budget."""
    first, last = members[0], members[-1]
    arc_title = first.arc_title or first.arc or ""
    span = f"{first.date} … {last.date}"
    header_lines = [
        f"Arc: {arc_title}",
        f"Span: {span} ({len(members)} session{'' if len(members) == 1 else 's'})",
        f"Beat budget: about {target_beats} beats for the whole span." if target_beats else None,
        "",
        "The session digests follow in chronological order. Fuse them into one "
        "month-in-review digest.",
        "",
    ]
    header = "\n".join(line for line in header_lines if line is not None)
    body = "\n\n".join(_render_member(m, i + 1) for i, m in enumerate(members))
    return f"{header}{body}"


def fuse_digests(
    client: LlmClient,
    fused_id: str,
    members: list[MegaMember],
    *,
    target_beats: int | None = None,
    model: str | None = None,
    max_tokens: int | None = None,
) -> SessionDigest:
    """Fuse member digests into one month-in-review SessionDigest under `fused_id`."""
    if not members:
        raise ValueError("fuse_digests needs at least one member.")
    kwargs: dict[str, Any] = {
        "system": MEGA_SYSTEM_PROMPT,
        "user_content": build_mega_user_content(members, target_beats),
        "tool": distill_tool,
    }
    if model is not None:
        kwargs["model"] = model
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    raw = client.call_tool(ToolCallRequest(**kwargs))
    return parse_digest(fused_id, raw)
