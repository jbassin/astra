# 0023. The mouthpiece experiment harness and roundtable move to a tools package

- **Date:** 2026-10-22
- **Status:** Accepted, not yet built
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

The producer experiment harness and the roundtable special ship in the Dagster image though they run only by hand.

## Decision

Move them to a tools package that the image does not install.

## Consequences

The image shrinks; the recipes keep working from a host checkout.
