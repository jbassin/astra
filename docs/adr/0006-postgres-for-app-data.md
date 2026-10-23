# 0006. Postgres stores app data

- **Date:** 2026-06-18
- **Status:** Accepted
- **Source:** [0000-astra-migration-roadmap.md](../../thoughts/archive/plans/0000-astra-migration-roadmap.md) (decision F)

## Context

weal roll history and the orator music library were SQLite files in the predecessor repo.

## Decision

weal, orator and Dagster each use their own Postgres instance under Compose. `player_id` integers are preserved verbatim as foreign keys.

## Consequences

Each database is dumped nightly ([0037](0037-backups-to-local-disk.md)). PGDATA keeps uid 70 and mode 0700.
