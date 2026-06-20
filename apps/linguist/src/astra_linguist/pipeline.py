"""Per-session orchestration — the artifacts a Dagster partition produces.

Free of Dagster + IO so it unit-tests with plain inputs: raw scribe lines →
formatted transcript → (if a campaign matches) mouthpiece context → canonical
line-numbered transcript. The asset layer supplies paths, the roster, and the
campaign views.
"""

from __future__ import annotations

from dataclasses import dataclass

from astra_observe import get_tracer

from .campaigns import MATCH_THRESHOLD, CampaignView, MatchedCampaign, match_campaign
from .canonical import to_canonical
from .context import build_context
from .corrections import Replacer
from .ingest import format_transcript
from .models import RawLine, Transcript
from .roster import SpeakerResolver

_tracer = get_tracer("astra.linguist")


@dataclass(frozen=True)
class SessionArtifacts:
    """The outputs of one session's processing (context/canonical absent if unmatched)."""

    transcript: Transcript
    matched: MatchedCampaign | None
    context: str | None
    canonical: str | None


def process_session(
    date: str,
    audio: str,
    raw: list[RawLine],
    *,
    replace: Replacer,
    resolver: SpeakerResolver,
    campaigns: list[CampaignView],
    threshold: int = MATCH_THRESHOLD,
) -> SessionArtifacts:
    """Raw scribe lines → formatted + (campaign-matched) context + canonical."""
    with _tracer.start_as_current_span("linguist.process_session") as span:
        transcript = format_transcript(date, audio, raw, replace, resolver)
        matched = match_campaign(transcript, campaigns, threshold=threshold)
        context = build_context(transcript, matched) if matched is not None else None
        canonical = to_canonical(context) if context is not None else None
        span.set_attribute("linguist.lines", len(transcript.script))
        span.set_attribute("linguist.matched", matched is not None)
        return SessionArtifacts(
            transcript=transcript, matched=matched, context=context, canonical=canonical
        )
