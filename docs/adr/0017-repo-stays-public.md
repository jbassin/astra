# 0017. The repo stays public without a history scrub

- **Date:** 2026-10-22
- **Status:** Accepted (accepted risk)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, act-now #11 dropped)

## Context

The repo is public and its history holds session transcripts with players' names and Discord IDs, personal-use fonts, and notes that describe security gaps.

## Decision

Josh: "Just leave this public." No history rewrite and no scrub. Transcripts now live in astra-data, which is also public by choice.

## Consequences

Audits do not re-flag the public repo or its history. Write security notes as classes of risk, not exploit detail.
