# 0024. strider's editor is dev-only

- **Date:** 2026-10-22
- **Status:** Accepted, not yet built
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

strider's production editor writes layers through a public server function with no auth, and its saves vanish when the container is recreated.

## Decision

The editor runs only in development. Until that ships, the unauthenticated write function is an accepted risk: the site is personal and low-traffic, and the write path already blocks traversal and overwrite.

## Consequences

Revisit if the site ever becomes multi-tenant or renders layer bodies as HTML.
