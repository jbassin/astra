# 0018. Book binaries stay in history; stop committing new ones

- **Date:** 2026-10-22
- **Status:** Accepted, partly built
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

About 40 MB of generated book PDFs sit in git history.

## Decision

Do not rewrite history. Stop committing generated book binaries (assay track, Phase 2).

## Consequences

The clone stays large; it stops growing.
