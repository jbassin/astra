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
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg unzip \
    && rm -rf /var/lib/apt/lists/*

# uv pinned to the host's line (matches uv.lock's format).
COPY --from=ghcr.io/astral-sh/uv:0.11.19 /uv /bin/uv

# One shared venv for the workspace sync + the extra dagster server pkgs; on PATH for
# the three CMDs. VIRTUAL_ENV makes `uv pip install` target the same venv as `uv sync`.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    VIRTUAL_ENV=/opt/venv \
    UV_LINK_MODE=copy \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /repo

# Workspace manifests + lock first (cached unless they change), then the member sources.
# Every py member in uv.lock must be present for `uv sync --frozen`: the 6 pipeline apps
# + all libs/py + ontology. (The TS apps are uv-excluded and intentionally absent.)
COPY pyproject.toml uv.lock ./
COPY apps/scribe apps/scribe
COPY apps/linguist apps/linguist
COPY apps/akasha-backend apps/akasha-backend
COPY apps/mouthpiece-backend apps/mouthpiece-backend
COPY apps/heartwood-backend apps/heartwood-backend
COPY apps/_smoke-substrate apps/_smoke-substrate
COPY libs/py libs/py
COPY ontology ontology

# Reproducible install of every member (editable) + their third-party deps. Editable
# keeps the source at /repo/libs/py/config/... so astra_config._find_repo_root walks up
# to /repo/ontology/ontology-config/config.kdl at runtime, independent of cwd.
RUN uv sync --frozen --no-dev

# The webserver command + the Postgres run/event/schedule storage (dagster.yaml) need
# these — they are NOT workspace deps. Pin to the resolved dagster line so the code
# server's gRPC protocol matches the webserver/daemon.
RUN uv pip install "dagster-webserver==1.13.10" "dagster-postgres==0.29.10"

# Code location: definitions.py loads the asset graph (imports the installed packages).
WORKDIR /opt/dagster/app
COPY dagster/definitions.py ./

# DAGSTER_HOME holds the instance config (dagster.yaml) + the workspace file.
ENV DAGSTER_HOME=/opt/dagster/home
RUN mkdir -p "$DAGSTER_HOME"
COPY dagster/dagster.yaml dagster/workspace.yaml "$DAGSTER_HOME"/
