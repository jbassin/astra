# 0040. Accepted risk: service ports published on all interfaces

- **Date:** 2026-10-22
- **Status:** Accepted risk
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, act-now #3 dropped; theme P)

## Context

Some service ports are reachable from the local network, not only from the host.

## Decision

Accepted for the home network. The internal Docker network split is kept as planned work.

## Consequences

Do not re-flag the port bindings. Revisit if the host joins an untrusted network.
