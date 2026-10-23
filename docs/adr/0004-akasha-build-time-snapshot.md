# 0004. akasha reads a build-time snapshot

- **Date:** 2026-06-18
- **Status:** Accepted
- **Source:** [0000-astra-migration-roadmap.md](../../thoughts/archive/plans/0000-astra-migration-roadmap.md) (decision D)

## Context

The wiki needs no live content API; content changes when a session is published.

## Decision

akasha-frontend bakes the wiki snapshot into generated modules at build time. The snapshot lives in the astra-data repo and reaches the build as a Docker build context ([0035](0035-astra-data-repo.md)).

## Consequences

A content change needs a rebuild and redeploy of akasha-frontend, which linguist-commit and the heartwood recipes run.
