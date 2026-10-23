# 0011. No process tiers; CLAUDE.md "How work gets done" is the process

- **Date:** 2026-10-22
- **Status:** Accepted
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, open item 1)

## Context

Work used a scope, spec and implement ritual driven by octo skills, with decision IDs and large spec documents. Most recent work did not follow it, and Josh found it heavier than the work needed.

## Decision

There are no change tiers. Plan in the conversation, ship small slices with CI as the gate, delegate independent slices to worktree agents, and get an independent review only where the risk is. Write a plan document only for work that spans sessions. Octo skills are not used.

## Consequences

No scope, spec or research documents and no decision IDs by default. The rules live in `CLAUDE.md`.
