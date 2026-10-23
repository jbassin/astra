# 0015. The repo is laid out by domain

- **Date:** 2026-10-22
- **Status:** Accepted, not yet built (paydown Phase 2, repo track)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table; section 6 item 1)

## Context

Adding an app touches about 17 hand-maintained lists, because language decides location and a uv exclude list separates the lanes.

## Decision

Apps move to `apps/<domain>/{py,web}`, so membership follows from location. The move happens after runtime data left `apps/`.

## Consequences

About 800 path references change in one move. Per-domain READMEs and `CLAUDE.md` files load where the work happens.
