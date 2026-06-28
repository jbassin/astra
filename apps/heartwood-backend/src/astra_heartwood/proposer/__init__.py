"""The Phase-3 prose proposer (spec ``0020-heartwood-phase3-proposer``).

Downstream of the Phase-2 facts: group resolved facts into target akasha pages, draft
house-voice prose per page (``call_text`` + tell-lint + bounded revise), and emit a
committed, reviewable change-set (``proposals/<date>/{manifest.kdl, <id>.vellum}``).
Read-only — no corpus writes, no review surface, no deploy (those are Phase 4).

Built slice-by-slice; S1 lands the pure-code spine (models, grouping/placement, KDL
manifest I/O, page-type detection) with no LLM in the loop.
"""
