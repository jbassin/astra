# 0036. Secrets fail closed

- **Date:** 2026-10-22
- **Status:** Accepted (done)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0.1, Phase 0 item 4)

## Context

Compose passed `${KEY:-}`, and the config libraries treated an empty string as a valid secret, so a container recreated without the deploy command ran with no auth.

## Decision

A blank resolved secret counts as unset in both config libraries. orator refuses to start without a long enough session secret or with an empty allowlist; weal-overlay refuses to start without its token.

## Consequences

A plain `docker compose up` of those services crash-loops with a clear message instead of running open.
