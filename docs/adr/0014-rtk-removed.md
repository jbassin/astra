# 0014. The RTK output-rewriting hook is removed

- **Date:** 2026-10-22
- **Status:** Accepted (done)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, open item 2)

## Context

The RTK hook rewrote and truncated shell output (`grep`, `diff`, `wc`, `git log`), and several checks read wrong results through it.

## Decision

The hook is disabled everywhere (a user-level change outside the repo).

## Consequences

Shell output is trustworthy again; still verify a surprising result a second way.
