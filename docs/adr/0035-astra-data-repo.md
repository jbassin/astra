# 0035. Pipeline output lives in the public astra-data repo

- **Date:** 2026-10-22
- **Status:** Accepted (done)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0.1, Phase 1 item 2)

## Context

A timer committed pipeline output to the code repo's `main` and pushed it, sweeping up other sessions' commits and redeploying from the shared tree.

## Decision

Published datasets (linguist transcripts, data and timeline; the mouthpiece snapshot; akasha content and snapshot; heartwood's run ledger; the entity registry) live in `github.com/jbassin/astra-data`, public, started from a fresh snapshot. Only bots commit there, and no bot commits to the code repo. akasha-frontend and mouthpiece-frontend bake the data from the clone's committed HEAD through a Docker build context.

## Consequences

Tests and CI read `fixtures/astra-data/`. A hand edit to the wiki is a commit in astra-data. Old data history stays in the code repo's history.
