"""mouthpiece context generation (port of `pipeline/script.ts`).

Per matched session: `{context}\n---\n{billing}\n---\nScript:\n` + one `> {billed
character}: {text}  ` line per transcript line. Consumed by 0008 + fed into the
canonical transform. The speaker is the character the speaking *player* is billed
as this session.
"""

from __future__ import annotations

from .campaigns import MatchedCampaign, make_billing, make_context
from .models import Transcript

_BARRIER = "---"


def build_context(transcript: Transcript, matched: MatchedCampaign) -> str:
    """The per-session mouthpiece-context `.txt`."""
    lines = [
        f"> {_billed_name(matched, line.user.name)}: {line.text}  " for line in transcript.script
    ]
    return "\n".join(
        [
            make_context(matched, transcript.date),
            _BARRIER,
            make_billing(matched),
            _BARRIER,
            "Script:\n",
            *lines,
        ]
    )


def _billed_name(matched: MatchedCampaign, player: str) -> str:
    """The character a player is billed as (raw name for an unbilled guest)."""
    role = matched.billing.get(player)
    return role.name if role is not None else player
