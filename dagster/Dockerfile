# Astra Dagster control plane + code location — one image, three commands
# (webserver, daemon, gRPC code server). Pinned to the Dagster 1.13.10 line.
FROM python:3.12-slim

RUN pip install --no-cache-dir \
    "dagster==1.13.10" \
    "dagster-webserver==1.13.10" \
    "dagster-postgres==0.29.10"

# Code location: the trivial Phase 0 smoke asset. Real per-subsystem assets
# (scribe -> linguist -> akasha -> mouthpiece) arrive in Phase 3.
WORKDIR /opt/dagster/app
COPY definitions.py ./

# DAGSTER_HOME holds the instance config (dagster.yaml) + the workspace file.
ENV DAGSTER_HOME=/opt/dagster/home
RUN mkdir -p "$DAGSTER_HOME"
COPY dagster.yaml workspace.yaml "$DAGSTER_HOME"/
