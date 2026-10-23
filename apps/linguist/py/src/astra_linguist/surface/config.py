"""Surfacer tuning — sourced from ontology-config via `astra_config`, never hardcoded.

Every value lives in `ontology/ontology-config/config.kdl` (the `linguist` node) and is
read through `astra_config.load_config()` (single-source-of-truth principle; py+ts mirror
the same schema). Re-exported as module constants so call sites stay `config.JUDGE_MODEL`
etc. Loaded once at import — `config.kdl` is always present and the schema carries the
faerrin code-defaults, so this is total.
"""

from __future__ import annotations

from astra_config import load_config

_lc = load_config().linguist

# Phase-1 phonetic filter + windowing.
MAX_NGRAM = _lc.surface_max_ngram
MIN_TOKEN_LEN = _lc.surface_min_token_len
KNOWN_FLOOR_UNIGRAM = _lc.surface_known_floor_unigram
KNOWN_FLOOR_MULTI = _lc.surface_known_floor_multi
STRONG_SCORE = _lc.surface_strong_score
KNOWN_NEAR_FLOOR = _lc.surface_known_near_floor

# Phase-2 judge.
JUDGE_MODEL = _lc.surface_model_judge
ESCALATE_MODEL = _lc.surface_model_escalate
JUDGE_CHUNK_SIZE = _lc.surface_judge_chunk_size
JUDGE_OVERLAP = _lc.surface_judge_overlap
ESCALATE_LOW = _lc.surface_escalate_low
ESCALATE_HIGH = _lc.surface_escalate_high
# Reserved for the deferred G1 review-loop write-back (min confidence to append a confirm
# to defs.yaml, per faerrin); not consumed by the judge itself yet.
CONFIDENCE_FLOOR = _lc.surface_confidence_floor
JUDGE_MAX_TOKENS = _lc.surface_judge_max_tokens
