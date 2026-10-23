# 0008. Dagster runs the pipeline, Compose runs services, Caddy is the edge, SigNoz observes

- **Date:** 2026-06-18
- **Status:** Accepted
- **Source:** [0000-astra-migration-roadmap.md](../../thoughts/archive/plans/0000-astra-migration-roadmap.md) (decision H)

## Context

One tool forced to be both a workflow engine and a service supervisor fit neither job (Windmill was evaluated and dropped).

## Decision

The session pipeline is a Dagster asset graph with one partition per session. Long-running services are Docker Compose units with restart policies and healthchecks. The shared host Caddy terminates TLS and reverse-proxies. SigNoz is the single place for traces, metrics and logs from all three.

## Consequences

Every app wires telemetry in the process that runs it. Paydown Phase 2 moves to one Dagster graph and the Docker run launcher ([0030](0030-dagster-docker-run-launcher.md)).
