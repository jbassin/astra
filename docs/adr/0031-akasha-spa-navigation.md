# 0031. akasha uses SPA navigation with server functions

- **Date:** 2026-10-22
- **Status:** Accepted (done 2026-10-25)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

akasha behaves as a multi-page site inside an SPA framework, and its 1 MB entry chunk carries every wiki body.

## Decision

Move to real SPA navigation, with page data served by server functions.

## Consequences

Smaller bundles; needs the stakeholders' agreement on visible change.
