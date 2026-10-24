# 0030. Dagster adopts the Docker run launcher

- **Date:** 2026-10-22
- **Status:** Accepted (built 2026-10-24, pipe-8)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

Runs execute inside the code-server container, so a deploy of that container kills in-flight runs.

## Decision

Use Dagster's Docker run launcher, so each run is its own container.

## Consequences

Deploys stop killing runs; pairs with a deploy guard for in-flight runs (pipeline track).
Only `dagster-daemon` mounts the host's Docker socket, which it needs to launch, watch and
stop the run containers; that is root-equivalent access to the host for that one container.
The webserver, which anyone on the LAN reaches without auth, does not get the socket, so the
UI's "Terminate" marks a run canceling but cannot stop its container. `just
pipeline-terminate <run-id>` runs the cancel inside the daemon instead. The launcher class
(`InstanceOnlyDockerRunLauncher`) takes every container setting from `dagster.yaml` and none
from a run's stored code origin, so a write to the run database cannot choose the image,
mounts or privileges of the container the daemon starts.
