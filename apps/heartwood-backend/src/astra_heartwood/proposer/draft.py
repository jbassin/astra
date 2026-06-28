"""Stage A — draft house-voice prose per page (spec §7, P3.5).

One ``call_text`` per ``PageProposal`` (GLM-5.2; free-text, not tool-JSON). The user message carries
the subject, the cited facts (the only thing the draft may assert), and — for a rewrite — the
existing body to weave the NEW facts into (P3.15) while flagging contradictions (P3.17). The draft's
trailing ``CONFLICTS:`` section and the ``ALREADY-KNOWN`` sentinel are parsed back off here; the
revise loop + assembly consume ``Draft`` in S4. Pure aside from the injected client; writes nothing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from astra_llm import TextRequest

from ..llm import TextClient, default_model, real_text_client
from .models import PageProposal, VoiceWarning
from .voice import ALREADY_KNOWN_MARKER, CONFLICTS_MARKER, DRAFT_SYSTEM

#: Free-text budget per draft. The body is tiny (1–3 sentences) but GLM-5.2 reasoning tokens share
#: the budget (the Phase-2 lesson), so leave ample headroom; ``call_text`` raises on truncation.
DRAFT_MAX_TOKENS = 8_000

_CONFLICTS_RE = re.compile(rf"(?ims)^\s*{re.escape(CONFLICTS_MARKER)}\s*(.*)\Z")
_BULLET_RE = re.compile(r"^[-*•\d.)\s]+")


@dataclass
class Draft:
    """One drafted page body + the contradictions it surfaced (P3.17)."""

    body: str
    conflicts: list[str] = field(default_factory=list)
    already_known: bool = False  # a rewrite whose every cited fact is already stated (P3.15)


def build_user(proposal: PageProposal, existing_body: str | None) -> str:
    """The draft user message (ported from faerrin ``buildUser`` + P3.15/P3.16/P3.17)."""
    is_rewrite = proposal.op == "rewrite"
    facts = "\n".join(f"- {c}" for c in proposal.fact_claims) or "- (none)"
    parts = [
        f"Subject: {proposal.canonical} "
        f"({'amending an existing page' if is_rewrite else 'a new page'})",
        "",
        "Cited facts to convey (assert nothing beyond these):",
        facts,
    ]
    if is_rewrite and existing_body and existing_body.strip():
        parts += [
            "",
            "Existing page prose (match its voice, POV, tense, and spelling; weave in only what is "
            "NEW; do not repeat it; do not contradict it — flag conflicts instead):",
            existing_body.strip(),
        ]
    parts += ["", "Draft the passage now."]
    return "\n".join(parts)


def _parse_draft(raw: str, *, is_rewrite: bool) -> Draft:
    """Split the model output into ``(body, conflicts, already_known)``."""
    text = raw.strip()
    if is_rewrite and text.upper().startswith(ALREADY_KNOWN_MARKER):
        return Draft(body="", already_known=True)
    match = _CONFLICTS_RE.search(text)
    if match is None:
        return Draft(body=text)
    body = text[: match.start()].rstrip()
    conflicts = []
    for line in match.group(1).splitlines():
        claim = _BULLET_RE.sub("", line).strip()
        if claim and claim.lower() != "none":
            conflicts.append(claim)
    return Draft(body=body, conflicts=conflicts)


def draft_page(
    proposal: PageProposal,
    existing_body: str | None = None,
    *,
    client: TextClient | None = None,
    model: str | None = None,
) -> Draft:
    """Draft one page's prose. ``existing_body`` is the rewrite target's body (None on create)."""
    client = client if client is not None else real_text_client()
    model = model if model is not None else default_model()
    raw = client.call_text(
        TextRequest(
            system=DRAFT_SYSTEM,
            user_content=build_user(proposal, existing_body),
            model=model,
            max_tokens=DRAFT_MAX_TOKENS,
        )
    )
    return _parse_draft(raw, is_rewrite=proposal.op == "rewrite")


def revise_draft(
    body: str,
    lints: list[VoiceWarning],
    *,
    client: TextClient,
    model: str,
) -> str:
    """One de-slopping pass (P3.6): clear the named tells, same facts/crossrefs/length."""
    issues = "\n".join(f"- {w.message}" for w in lints)
    user = (
        "Here is a draft passage:\n\n"
        f"{body.strip()}\n\n"
        "It has these voice problems:\n"
        f"{issues}\n\n"
        "Rewrite it to remove these specific tells. Keep EXACTLY the same facts and the same "
        "[[crossrefs]], the same length, and the same point of view and tense. "
        "Output only the rewritten passage."
    )
    revised = client.call_text(
        TextRequest(
            system=DRAFT_SYSTEM, user_content=user, model=model, max_tokens=DRAFT_MAX_TOKENS
        )
    )
    return revised.strip()
