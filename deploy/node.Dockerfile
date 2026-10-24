# The one Dockerfile for every astra Node service (frontends, bots, render, portal). The
# build context is the REPO ROOT: every service is a pnpm workspace member that depends on
# @astra/* libraries through workspace:* links. Build it through compose (`just deploy`):
# each service's `build.args` in deploy/docker-compose.yml set the knobs below.
#
# Build args (compose `build.args`):
#   APP      the app dir under apps/, e.g. codex/web. Required.
#   ENTRY    the TS entry the server runs, relative to the app dir (default server.ts).
#   CONTENT  which published datasets the build bakes from the `astra-data` build context
#            (compose additional_contexts): none (default), akasha or mouthpiece.
#   RUNTIME  the OS layer under the runtime: plain (default), ffmpeg (orator: ffmpeg +
#            yt-dlp) or chromium (vellum-render, portal-headless: Playwright's Chromium).
# Targets: the last stage (`runtime`) serves every app; `portal` adds the built Foundry
# module that portal-server packages into its install zip.
#
# Nothing here lists workspace members. pnpm fetch needs only the lockfile, the
# `manifests` stage finds every package.json, and the filtered installs (`./apps/$APP...`)
# take the app plus its workspace dependencies. The runtime gets production
# dependencies only.
#
# Runtime layout (the compose `command:` lines and package.json `start` scripts rely on
# it): the app runs from /repo/apps/<domain>/<role>, so ../../../libs/ts/site-kit/src/
# nodeTsResolve.mjs is /repo/libs/ts/site-kit/src/nodeTsResolve.mjs. The @astra/* links in
# node_modules point at /repo/libs/ts sources, outside node_modules, which is what lets
# Node strip their types (it refuses to for files under node_modules).
ARG APP
ARG CONTENT=none
ARG RUNTIME=plain

# --- Runtime OS layers (RUNTIME picks one). They are the bottom of every runtime image, so
# they take nothing from the repo: no APP, no lockfile, no manifests. A source, manifest or
# lockfile change then rebuilds only the app layers above them, and vellum-render and
# portal-headless share one Chromium layer. Bump a version ARG to rebuild one. node:24-slim
# ships a `node` user at uid/gid 1000, so compose's `user: "1000:1000"` carries over. ---
FROM node:24-slim AS os-plain

FROM node:24-slim AS os-ffmpeg
# ffmpeg (loudness and encode) and yt-dlp (a python zipapp, so python3) on PATH. yt-dlp is
# PINNED, not `latest`: YouTube breaks old releases every few weeks (2026-09-07: 2026.07.04
# got 403 on every download) and a `latest` URL behind a cached layer never refreshes.
ARG YT_DLP_VERSION=2026.08.19
# DL3008: the base image tag fixes the Debian release; the archive keeps only each package's
# newest build there, so an exact apt pin breaks on the next stable update.
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 ca-certificates curl \
    && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp" \
         -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

FROM node:24-slim AS os-chromium
# Chromium and its system libraries, from the `playwright` release pnpm-lock.yaml locks (the
# app's own install drives the browser at runtime). `just infra-check` fails when this ARG
# and the lock disagree, so bump them together. The services launch it with --no-sandbox,
# since a container has no user-namespace sandbox. The chown is in the same layer so the
# browser bundle is not stored twice; the runtime user (1000) must read and execute it.
ARG PLAYWRIGHT_VERSION=1.61.1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx --yes "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* /root/.npm \
    && chown -R 1000:1000 /ms-playwright

FROM node:24-slim AS base
WORKDIR /repo
# CI=true: pnpm may then replace the modules dir that `pnpm fetch` left (no TTY prompt).
ENV CI=true
RUN corepack enable && corepack prepare pnpm@10.34.4 --activate

# Every workspace manifest, found rather than listed: copy the member trees and keep only
# the package.json files. BuildKit keys the `COPY --from=manifests` below on content, so a
# source-only change re-runs this cheap step and nothing after it.
FROM base AS manifests
COPY apps ./apps
COPY libs/ts ./libs/ts
RUN find apps libs -type f ! -name package.json -delete \
    && find apps libs -type d -empty -delete

# The package store for the whole lockfile (cached until pnpm-lock.yaml changes), then the
# workspace's manifests so the filtered installs below reconcile under --frozen-lockfile.
# pnpm fetch also links every package into node_modules/.pnpm; drop that, keeping only the
# store, so each install below links just what its filter selects.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch && rm -rf node_modules
COPY --from=manifests /repo ./

# Production dependencies of the app and its workspace dependencies: the runtime's
# node_modules.
FROM deps AS prod
ARG APP
RUN pnpm install --offline --frozen-lockfile --prod --filter "{./apps/${APP}}..."

# The published datasets a content build reads, in the astra-data layout. Only the stage
# CONTENT names is built, so services with CONTENT=none need no astra-data context.
# hadolint's DL3022 wants every `COPY --from` to name an earlier stage; `astra-data` is a named
# build context (compose additional_contexts), not a stage.
FROM scratch AS content-none
FROM scratch AS content-akasha
# The akasha snapshot and corpus, the linguist session JSONs and the chronicle timeline.
# hadolint ignore=DL3022
COPY --from=astra-data akasha/snapshot /akasha/snapshot
# hadolint ignore=DL3022
COPY --from=astra-data akasha/content /akasha/content
# hadolint ignore=DL3022
COPY --from=astra-data linguist/data /linguist/data
# hadolint ignore=DL3022
COPY --from=astra-data linguist/timeline /linguist/timeline
FROM scratch AS content-mouthpiece
# The episode catalog (episodes-index.json and per-session script.json). The audio is a
# runtime volume, never baked in.
# hadolint ignore=DL3022
COPY --from=astra-data mouthpiece/snapshot /mouthpiece/snapshot
# The base is one of the stages above, picked by an ARG; DL3006 reads it as an untagged image.
# hadolint ignore=DL3006
FROM content-${CONTENT} AS content

# Build the app with all of its dependencies. config.kdl must be present (vite.config.ts
# and the build-content scripts read it through @astra/config); ontology-being carries the
# campaign roster akasha's transcript build needs; vite's esbuild follows each member's
# `extends` to tsconfig.base.json. The app's node_modules is dropped afterwards so the
# runtime can take the whole built app dir and pair it with the production install.
FROM deps AS build
ARG APP
ARG CONTENT
RUN pnpm install --offline --frozen-lockfile --filter "{./apps/${APP}}..."
COPY tsconfig.base.json ./
COPY ontology ./ontology
COPY libs/ts ./libs/ts
COPY --from=content / /content
COPY apps/${APP} ./apps/${APP}
WORKDIR /repo/apps/${APP}
# build-content reads $ASTRA_CONTENT_ROOT; unset, it would build the checked-in fixture.
# An app that runs unbuilt TS (weal-bot, portal-server, portal-headless) has no build script,
# so --if-present skips it.
RUN if [ "$CONTENT" != none ]; then export ASTRA_CONTENT_ROOT=/content; fi \
    && pnpm run --if-present build \
    && rm -rf node_modules

# --- The runtime: production node_modules, the library sources the @astra/* links point
# at, the ontology (config.kdl is read at runtime by walking up to
# /repo/ontology/ontology-config; ontology-being by @astra/ontology) and the built app.
# hadolint ignore=DL3006
FROM os-${RUNTIME} AS app
ARG APP
ARG ENTRY=server.ts
# ASTRA_RUNTIME=container tells @astra/observe to export to the in-cluster collector
# (telemetry.otlp-endpoint) and to label every signal deployment.environment=production.
ENV NODE_ENV=production APP_ENTRY=${ENTRY} ASTRA_RUNTIME=container
WORKDIR /repo/apps/${APP}
COPY --from=prod /repo /repo
COPY libs/ts /repo/libs/ts
COPY ontology /repo/ontology
COPY --from=build /repo/apps/${APP} ./
# Node runs the TS entry directly (no package manager in the runtime). The first --import
# lets Node resolve extensionless TS imports; the second installs telemetry, HTTP and fetch
# spans and the shutdown flush before the entry loads (the service name comes from the
# app's package.json `astra.config` block in config.kdl). `exec` makes node PID 1, so it
# receives the stop signal itself. The shell form is what expands $APP_ENTRY (DL3025).
# hadolint ignore=DL3025
CMD exec node --import ../../../libs/ts/site-kit/src/nodeTsResolve.mjs \
    --import @astra/observe/register "$APP_ENTRY"

# portal-server (APP=portal/server) also serves the Foundry module: tsdown bundles it to
# module/dist/main.js, which portal-server's modulePackage.ts zips with module.json. It
# imports @astra/portal-shared, whose link points at apps/portal/shared.
FROM deps AS portal-module
RUN pnpm install --offline --frozen-lockfile --filter "{./apps/portal/module}..."
COPY tsconfig.base.json ./
COPY apps/portal/shared ./apps/portal/shared
COPY apps/portal/module ./apps/portal/module
RUN pnpm --filter @astra/portal-module build

FROM app AS portal
COPY apps/portal/shared /repo/apps/portal/shared
COPY --from=portal-module /repo/apps/portal/module/module.json /repo/apps/portal/module/module.json
COPY --from=portal-module /repo/apps/portal/module/dist /repo/apps/portal/module/dist

FROM app AS runtime
