# Astra Dagster control plane + code location — one image, three commands
# (webserver, daemon, gRPC code server). Pinned to the Dagster 1.13.10 line.
#
# Builds from the REPO ROOT (compose: build.context `..`, dockerfile `dagster/Dockerfile`)
# because definitions.py loads the real Phase-3 asset graph — it imports the subsystem
# packages (astra_scribe / astra_linguist / astra_akasha_backend / astra_mouthpiece +
# astra_observe and their workspace deps). So the image must `uv sync` the whole Python
# workspace, not just pip-install dagster (the Phase-0 image did the latter and the code
# location crash-looped on `No module named 'astra_akasha_backend'`).

FROM python:3.12-slim

# Pipeline runtime binaries the assets shell out to: `unzip` (scribe extracts the Craig
# zip), `ffmpeg` + `ffprobe` (scribe per-speaker merge + mouthpiece assembly/duration).
# DL3008: the base image tag fixes the Debian release; the archive keeps only each package's
# newest build there, so an exact apt pin breaks on the next stable update.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg unzip \
    && rm -rf /var/lib/apt/lists/*

# uv pinned to the host's line (matches uv.lock's format).
COPY --from=ghcr.io/astral-sh/uv:0.11.19 /uv /bin/uv

# One shared venv for the workspace sync + the extra dagster server pkgs; on PATH for
# the three CMDs. VIRTUAL_ENV makes `uv pip install` target the same venv as `uv sync`.
# ASTRA_RUNTIME=container tells astra_observe to export to the in-cluster collector
# (telemetry.otlp-endpoint) and to label every signal deployment.environment=production.
ENV ASTRA_RUNTIME=container \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    VIRTUAL_ENV=/opt/venv \
    UV_LINK_MODE=copy \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /repo

# Workspace manifests + lock first (cached unless they change), then the member sources.
# Every py member in uv.lock must be present for `uv sync --frozen`: dagster/ itself
# (astra-pipeline, the code location's manifest) + the 6 pipeline apps + assay (a lock member since 0030 even though Dagster never runs it — `uv sync
# --frozen` refuses a missing member distribution outright) + all libs/py + ontology.
# mouthpiece's hand-run tools (ADR 0023) are a lock member outside astra-pipeline's tree:
# only their manifest is copied, so their code never enters the image.
# (The TS apps are uv-excluded and intentionally absent.)
COPY pyproject.toml uv.lock ./
COPY dagster/pyproject.toml dagster/pyproject.toml
COPY apps/scribe/py apps/scribe/py
COPY apps/linguist/py apps/linguist/py
COPY apps/akasha/py apps/akasha/py
COPY apps/mouthpiece/py apps/mouthpiece/py
COPY apps/mouthpiece/tools/pyproject.toml apps/mouthpiece/tools/pyproject.toml
COPY apps/heartwood/py apps/heartwood/py
COPY apps/_smoke/py apps/_smoke/py
COPY apps/assay/py apps/assay/py
COPY libs/py libs/py
COPY ontology ontology

# Reproducible install of astra-pipeline's dependency tree: the pipeline members
# (editable) + their third-party deps + the webserver and Postgres storage packages, all
# pinned in uv.lock (dagster/pyproject.toml). Editable keeps the source at
# /repo/libs/py/config/... so astra_config._find_repo_root walks up to
# /repo/ontology/ontology-config/config.kdl at runtime, independent of cwd.
RUN uv sync --frozen --no-dev --package astra-pipeline

# Deno for dspy's RLM sandbox (Deno + Pyodide) — the mouthpiece producer's session_brief
# asset. Pinned to the host's 2.5.6. dspy's runner.js imports an UNPINNED
# npm:pyodide + deno.land/std@0.186.0, so warm them into DENO_DIR here (network at build
# time) and run the sandbox cache-only at runtime (ASTRA_DENO_CACHED_ONLY → `deno run
# --cached-only`, astra_llm.rlm.make_interpreter): a runtime can never fetch a different
# Pyodide; a rebuild can, and this step prints the version. start() raises on a failed
# fetch and a None version fails the build (sandbox_version swallows errors). This layer
# sits after the workspace COPY, so any source change re-runs it.
COPY --from=denoland/deno:bin-2.5.6 /deno /usr/local/bin/deno
ENV DENO_DIR=/opt/deno \
    DENO_NO_PACKAGE_JSON=1 \
    ASTRA_DENO_CACHED_ONLY=1
RUN ASTRA_DENO_CACHED_ONLY="" python -c 'import sys; from astra_llm.rlm import make_interpreter as mk, sandbox_version as v; i = mk(); i.start(); ver = v(i); print("pyodide:", ver); i.shutdown(); sys.exit(0 if ver else 1)'

# Code location: definitions.py loads the asset graph (imports the installed packages).
WORKDIR /opt/dagster/app
COPY dagster/definitions.py ./
# The one-time sessions partition migration (0037 pipe-4b): `python migrate_sessions.py`.
COPY dagster/migrate_sessions.py ./

# DAGSTER_HOME holds the instance config (dagster.yaml) + the workspace file.
ENV DAGSTER_HOME=/opt/dagster/home
RUN mkdir -p "$DAGSTER_HOME"
COPY dagster/dagster.yaml dagster/workspace.yaml "$DAGSTER_HOME"/

# The compose services run this image as user 1000:1000 (host repo owner) so pipeline
# writes into the bind-mounted data dirs land host-owned (matching the other astra
# containers). The run worker writes compute logs / local artifact storage under
# /opt/dagster/home/storage and needs a writable HOME — chown the whole /opt/dagster tree
# (home + the app cwd) to 1000 and point HOME there. /opt/venv + the editable /repo
# sources stay root-owned/world-readable: the runtime only writes data paths from
# config.kdl, all of which are bind mounts (deploy/docker-compose.yml).
ENV HOME=/opt/dagster/home
RUN mkdir -p "$DAGSTER_HOME/storage" \
    && chown -R 1000:1000 /opt/dagster /opt/deno
