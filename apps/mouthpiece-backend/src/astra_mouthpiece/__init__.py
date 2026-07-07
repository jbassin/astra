"""astra-mouthpiece-backend — session transcript → tavern-tone roundtable script →
episode audio, as a Dagster per-session asset graph (caster rewrite, 0008).

LLM via raw `libs/py/llm` (`call_text`/`call_tool`, no dspy — H1); the verbatim
two-pass prompts carry the tavern tone; grounding reads the akasha corpus; hosts +
voices come from ontology-being. See `thoughts/astra/specs/0008-mouthpiece-backend-spec.md`.
"""

from __future__ import annotations

from .digest import distill_session, parse_digest
from .grounding import GroundingPage, ground_digest, pages_from_corpus
from .hosts import load_hosts
from .lint import compute_metrics, format_report, score_script
from .models import (
    AudioManifest,
    Beat,
    HostConfig,
    HostPersona,
    Script,
    ScriptTurn,
    SessionDigest,
    VoiceConfig,
)
from .script import generate_script, generate_two_pass, parse_script
from .session import build_episode_script, produce_episode, render_episode_audio
from .sharpen import sharpen_voices

__all__ = [
    "AudioManifest",
    "Beat",
    "GroundingPage",
    "HostConfig",
    "HostPersona",
    "Script",
    "ScriptTurn",
    "SessionDigest",
    "VoiceConfig",
    "build_episode_script",
    "compute_metrics",
    "distill_session",
    "format_report",
    "generate_script",
    "generate_two_pass",
    "ground_digest",
    "load_hosts",
    "pages_from_corpus",
    "parse_digest",
    "parse_script",
    "produce_episode",
    "render_episode_audio",
    "score_script",
    "sharpen_voices",
]
