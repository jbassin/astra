"""The proposer (spec ``0020-heartwood-facts-only-rework``; supersedes the retired
``0020-heartwood-phase3-proposer`` drafting design).

Downstream of the Phase-2 facts: group resolved facts into target akasha pages, stage a
starting ``.vellum`` per page (a fresh skeleton for a create, the live page verbatim for a
rewrite — zero LLM calls, FO-1), and emit a committed, reviewable change-set
(``proposals/<date>/{manifest.kdl, <id>.vellum}``). Read-only — no corpus writes. The human
writes every body in the review surface's editor (Phase 4); this package only stages facts.
"""
