# 0042. Accepted risk: public unauthenticated OTLP ingest

- **Date:** 2026-10-22
- **Status:** Accepted risk
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, act-now #7 dropped)

## Context

The public telemetry ingest endpoint does not authenticate senders, because browser RUM and a desktop plugin post to it.

## Decision

Accepted.

## Consequences

Do not re-flag it. Revisit if forged telemetry becomes a real problem.
