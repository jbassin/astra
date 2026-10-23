# 0030. Dagster adopts the Docker run launcher

- **Date:** 2026-10-22
- **Status:** Accepted, not yet built
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

Runs execute inside the code-server container, so a deploy of that container kills in-flight runs.

## Decision

Use Dagster's Docker run launcher, so each run is its own container.

## Consequences

Deploys stop killing runs; pairs with a deploy guard for in-flight runs (pipeline track).
