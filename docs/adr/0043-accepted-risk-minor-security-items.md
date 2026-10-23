# 0043. Accepted risk: the smaller security findings

- **Date:** 2026-10-22
- **Status:** Accepted risk
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0; theme P)

## Context

The 0037 audit listed smaller security items beyond the act-now list.

## Decision

Accepted and not planned: internet-facing processes running as the admin user; the portal bridge key stored in Foundry world settings; the short portal GM password; edge and input gaps (no request-body limits, a broad local-network matcher, no Content-Security-Policy); portal auth details (consent password, attempt limits, token lifetimes); secret hygiene (argv exposure, broad key distribution, one age recipient); assay's restricted `eval` on rule expressions.

## Consequences

Do not re-flag these. The internal Docker network split from the same theme is kept as planned work.
