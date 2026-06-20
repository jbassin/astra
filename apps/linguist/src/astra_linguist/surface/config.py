"""Surfacer tuning constants — ported from faerrin `config.ts` `surface`."""

from __future__ import annotations

MAX_NGRAM = 3
MIN_TOKEN_LEN = 3
KNOWN_FLOOR_UNIGRAM = 0.78
KNOWN_FLOOR_MULTI = 0.8
STRONG_SCORE = 0.88
KNOWN_NEAR_FLOOR = 0.6

# Phase-2 judge.
JUDGE_MODEL = "claude-haiku-4-5-20251001"
ESCALATE_MODEL = "claude-sonnet-4-6"
JUDGE_CHUNK_SIZE = 150
JUDGE_OVERLAP = 10
ESCALATE_LOW = 0.4
ESCALATE_HIGH = 0.75
CONFIDENCE_FLOOR = 0.6
JUDGE_MAX_TOKENS = 4096
