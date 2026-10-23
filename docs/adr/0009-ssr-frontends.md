# 0009. Frontends are server-rendered Compose services

- **Date:** 2026-06-20
- **Status:** Accepted
- **Source:** [0000-astra-migration-roadmap.md](../../thoughts/archive/plans/0000-astra-migration-roadmap.md) (decision I)

## Context

Prerendered static sites could not host the editors, RUM and server functions the frontends needed.

## Decision

Every TanStack Start frontend runs as an SSR server in a Compose service behind Caddy, with server-side telemetry and browser RUM. Content still flows build-time content, then generated modules, then route loaders (the strider pattern).

## Consequences

Each frontend is a container with a port and a Caddy stanza. Shared server plumbing lives in `@astra/site-kit`.
