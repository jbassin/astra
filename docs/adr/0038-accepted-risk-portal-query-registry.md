# 0038. Accepted risk: portal handlers in Foundry's global query registry

- **Date:** 2026-10-22
- **Status:** Accepted risk
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, act-now #1 dropped)

## Context

The portal Foundry module registers its handlers where any logged-in Foundry player could invoke them, bypassing the portal's own auth and audit path.

## Decision

Accepted for a personal-scale game with known players. Not fixed.

## Consequences

Do not re-flag it. Revisit if the player group or the world's exposure changes materially.
