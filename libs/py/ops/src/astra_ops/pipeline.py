"""``pipeline-terminate RUN_ID``: stop a Dagster run and its run container (ADR 0030).

Each run has its own container, which only a process with the host's Docker socket can stop.
Only ``dagster-daemon`` mounts it: the webserver is reachable on the LAN without auth, so it
must not. The UI's "Terminate" therefore marks the run canceling but cannot stop the
container. This command runs the cancel inside the daemon container instead, through the
instance's run coordinator: a queued run is canceled, a running one gets the launcher's
``terminate`` (the run is marked canceling and its container stopped).

Exit codes: 0 termination requested (or the run had already finished), 1 the launcher could
not stop it, 2 no such run, 64 usage; anything else is ``docker exec``'s own failure.
"""

from __future__ import annotations

import os

from .context import Ctx

#: The daemon's container (deploy/docker-compose.yml container_name). A scratch stack
#: overrides it with ASTRA_DAGSTER_DAEMON_CONTAINER.
DAEMON_CONTAINER = "astra-dagster-daemon"

#: Runs inside the daemon container, where DAGSTER_HOME holds the instance config.
TERMINATE = """\
import sys

from dagster import DagsterInstance

run_id = sys.argv[1]
with DagsterInstance.get() as instance:
    run = instance.get_run_by_id(run_id)
    if run is None:
        print(f"no Dagster run {run_id}", file=sys.stderr)
        sys.exit(2)
    if run.is_finished:
        print(f"run {run_id} already finished ({run.status.value}); nothing to stop")
        sys.exit(0)
    ok = instance.run_coordinator.cancel_run(run_id)
    verdict = "termination requested" if ok else "the launcher could not stop it"
    print(f"run {run_id} ({run.job_name}, was {run.status.value}): {verdict}")
    sys.exit(0 if ok else 1)
"""


def daemon_container() -> str:
    return os.environ.get("ASTRA_DAGSTER_DAEMON_CONTAINER", DAEMON_CONTAINER)


def terminate_argv(run_id: str) -> list[str]:
    return ["docker", "exec", daemon_container(), "python", "-c", TERMINATE, run_id]


def pipeline_terminate(ctx: Ctx, run_id: str) -> int:
    return ctx.run(terminate_argv(run_id))
