# 0042. Accepted risk: public unauthenticated OTLP ingest

- **Date:** 2026-10-22
- **Status:** Accepted risk
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, act-now #7 dropped)

## Context

`otel.iridi.cc` accepts telemetry from anyone, because browser RUM and a desktop plugin post to it, and an ERROR log there can page the ops channel.

## Decision

Accepted.

## Consequences

Do not re-flag it. Revisit if forged telemetry becomes a real problem.
