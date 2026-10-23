"""The correction surfacer (NLSpec 0006 §4) — Phase-1 phonetic filter + Phase-2 dspy judge.

A phonetic ensemble pre-flags out-of-vocabulary mistranscriptions (pure); a dspy
judge (GLM 5.2) then classifies each `confirm|new|reject` with deterministic guardrails
+ a borderline-escalation tier (inert while judge == escalate). The live judge run +
optimizer tuning are wired (gate J); the guardrails + filter are pure/total and fully
tested here.
"""

from __future__ import annotations

__all__: list[str] = []
