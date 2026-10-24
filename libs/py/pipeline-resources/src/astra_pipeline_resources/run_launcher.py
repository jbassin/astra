"""The run launcher dagster.yaml names (ADR 0030): Dagster's Docker launcher, instance config only.

The stock ``DockerRunLauncher`` merges each run's stored code origin into what it launches:
``repository_origin.container_context`` (extra ``container_kwargs``, networks, env) and
``repository_origin.container_image``. The daemon reads that origin from Dagster's Postgres,
and every run container holds the Postgres password, so anyone who can write that database
could queue a run that makes the daemon (which holds the host's Docker socket) start a
privileged container with the host's ``/`` mounted. This subclass ignores both fields: every
run container gets exactly the image, env keys, networks, user and binds in dagster.yaml.
Our code location sets neither field, so nothing legitimate is lost.
"""

from __future__ import annotations

from dagster._core.origin import JobPythonOrigin
from dagster._core.storage.dagster_run import DagsterRun
from dagster_docker import DockerRunLauncher
from dagster_docker.container_context import DockerContainerContext
from dagster_docker.utils import validate_docker_image


class InstanceOnlyDockerRunLauncher(DockerRunLauncher):
    """``DockerRunLauncher`` that never takes container settings from a run's code origin."""

    def get_container_context(self, dagster_run: DagsterRun) -> DockerContainerContext:  # noqa: ARG002 -- the run is deliberately ignored
        return DockerContainerContext().merge(
            DockerContainerContext(
                registry=self.registry,
                env_vars=self.env_vars,
                networks=self.networks,
                container_kwargs=self.container_kwargs,
            )
        )

    def _get_docker_image(self, job_code_origin: JobPythonOrigin) -> str:  # noqa: ARG002 -- the origin's image is deliberately ignored
        if not self.image:
            raise RuntimeError("the run launcher has no image (dagster.yaml run_launcher.image)")
        validate_docker_image(self.image)
        return self.image
