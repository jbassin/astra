"""astra-mouthpiece-backend — session transcript → tavern-tone roundtable script →
episode audio, as a Dagster per-session asset graph (caster rewrite, 0008; Stage 2/3
reworked onto clean+enrich + a cleaned-transcript Pass A by 0024).

LLM via raw `libs/py/llm` (`call_text`/`call_tool`, no dspy — H1); the verbatim
two-pass prompts carry the tavern tone; grounding reads the akasha corpus; hosts +
voices come from ontology-being. See `thoughts/astra/specs/0008-mouthpiece-backend-spec.md`
and `thoughts/astra/specs/0024-mouthpiece-script-rework-spec.md`.
"""

from __future__ import annotations

from .clean import clean_session
from .grounding import GroundingPage, ground_digest, pages_from_corpus
from .hosts import load_hosts
from .lint import compute_metrics, format_report, score_script
from .models import (
    AudioManifest,
    HostConfig,
    HostPersona,
    Script,
    ScriptTurn,
    SessionDigest,
    VoiceConfig,
)
from .roster import build_roster_block
from .script import generate_script, parse_script
from .session import build_episode_script, produce_episode, render_episode_audio
from .sharpen import sharpen_voices

__all__ = [
    "AudioManifest",
    "GroundingPage",
    "HostConfig",
    "HostPersona",
    "Script",
    "ScriptTurn",
    "SessionDigest",
    "VoiceConfig",
    "build_episode_script",
    "build_roster_block",
    "clean_session",
    "compute_metrics",
    "format_report",
    "generate_script",
    "ground_digest",
    "load_hosts",
    "pages_from_corpus",
    "parse_script",
    "produce_episode",
    "render_episode_audio",
    "score_script",
    "sharpen_voices",
]
