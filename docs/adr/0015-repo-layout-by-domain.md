# 0015. The repo is laid out by domain

- **Date:** 2026-10-22
- **Status:** Accepted (done 2026-10-23)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table; section 6 item 1)

## Context

Adding an app touches about 17 hand-maintained lists, because language decides location and a uv exclude list separates the lanes.

## Decision

Apps move to `apps/<domain>/<role>/`, so membership follows from location. The role is `py` for
the Python app and `web` for a frontend; other TypeScript apps name what they are (`bot`,
`overlay`, `render`, `controller`), and portal keeps its four parts. The move happens after runtime data left `apps/`.

## Consequences

About 800 path references change in one move. Per-domain READMEs and `CLAUDE.md` files load where the work happens.
