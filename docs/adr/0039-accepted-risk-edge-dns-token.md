# 0039. Accepted risk: the edge's DNS token handling

- **Date:** 2026-10-22
- **Status:** Accepted risk
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, act-now #2 dropped)

## Context

The Cloudflare DNS token used for certificates is handled loosely on the shared host edge (outside this repo).

## Decision

Accepted. The host edge is Josh's to manage; astra's own `sites.caddyfile` carries no secret.

## Consequences

Do not re-flag it. Revisit after a real incident.
