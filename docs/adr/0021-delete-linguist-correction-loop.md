# 0021. Delete the linguist correction loop

- **Date:** 2026-10-22
- **Status:** Accepted, not yet built
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

`correction_candidates` makes a paid, unmetered LLM call every session, and nobody has reviewed a candidate since June.

## Decision

Delete it.

## Consequences

One less paid call per session.
