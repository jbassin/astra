# 0024. strider's editor is dev-only

- **Date:** 2026-10-22
- **Status:** Accepted, not yet built
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

strider's production build still ships the editor route and its layer-write server function. Caddy limits the editor page to the local network, but the server function has no auth; the write path blocks traversal and overwrite, so the worst case is new layer files in the container, which a recreate discards (nothing is mounted over `content/layers`).

## Decision

The editor runs only in development. Until that ships, the unauthenticated write function is an accepted risk for a personal, low-traffic site.

## Consequences

Revisit if the site ever becomes multi-tenant or renders layer bodies as HTML.
