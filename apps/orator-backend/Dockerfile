# Astra orator-backend — the Discord music service (0010): Bun.serve REST + voice
# + ingest + the served operator SPA. Bun runs the TS directly; the operator SPA
# is Vite-built to dist/ in the build stage and served by serveStatic.
#
# Build context is the REPO ROOT (orator-backend is a bun workspace member
# depending on @astra/{config,observe,ontology,gothic} via workspace:*), so the
# whole bun workspace must be present for `bun install` to resolve links. Build
# from deploy/ via compose.
#
# Native DAVE/E2EE (M5 / L3): @snazzah/davey is a napi-rs module that ships PREBUILT
# platform binaries (bun installs a `*-linux-x64-gnu` optional package) — without it
# @discordjs/voice ≥0.19 closes the WS 4017. No compile toolchain is needed (bun
# never runs dep build scripts; the prebuilt is used), so the build stage is plain
# JS. The runtime stage carries ffmpeg + yt-dlp on PATH (ingest + playback encode).
FROM oven/bun:1.3.14 AS build
WORKDIR /repo

# Install against the full workspace manifest set (cached unless manifests change).
# --frozen-lockfile builds the native optionalDependency (@snazzah/davey) here.
# Every workspace member's manifest must be present so the shared bun.lock
# reconciles: the root `apps/*`/`libs/ts/*` globs resolve the FULL workspace, so a
# partial app set reads as "lockfile changed". (Add a new app's manifest here too.)
COPY package.json bun.lock ./
COPY apps/akasha-frontend/package.json apps/akasha-frontend/
COPY apps/mouthpiece-frontend/package.json apps/mouthpiece-frontend/
COPY apps/orator-backend/package.json apps/orator-backend/
COPY apps/orator-controller/package.json apps/orator-controller/
COPY apps/strider/package.json apps/strider/
COPY apps/weal-bot/package.json apps/weal-bot/
COPY apps/weal-overlay/package.json apps/weal-overlay/
COPY libs/ts ./libs/ts
RUN bun install --frozen-lockfile

# The shared base tsconfig that every member extends — vite's esbuild follows
# `extends` at build time, so it must be present at the repo root.
COPY tsconfig.base.json ./

# Build the operator SPA (vite → apps/orator-backend/dist; gothicFontsPlugin
# copies the gothic fonts into dist/fonts so the static dist is self-contained).
COPY apps/orator-backend ./apps/orator-backend
WORKDIR /repo/apps/orator-backend
RUN bun run build

# --- Runtime: slim image + ffmpeg/yt-dlp on PATH + the built app + workspace deps ---
FROM oven/bun:1.3.14-slim AS runtime
WORKDIR /repo/apps/orator-backend
ENV NODE_ENV=production

# ffmpeg (loudness/encode) + yt-dlp (a python zipapp, needs python3) on PATH (M5).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 ca-certificates curl \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
         -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# node_modules (incl. the compiled native davey) + libs/ts preserve the @astra/*
# workspace symlinks that src/index.ts resolves at runtime.
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/libs/ts /repo/libs/ts
COPY --from=build /repo/apps/orator-backend/node_modules ./node_modules
COPY --from=build /repo/apps/orator-backend/dist ./dist
COPY --from=build /repo/apps/orator-backend/src ./src
COPY --from=build /repo/apps/orator-backend/package.json ./package.json
# Config + identity are read at runtime via @astra/config / @astra/ontology, which
# locate them by walking up to <repo>/ontology/{ontology-config,ontology-being}.
COPY ontology/ontology-config /repo/ontology/ontology-config
COPY ontology/ontology-being /repo/ontology/ontology-being

EXPOSE 10363
CMD ["bun", "run", "src/index.ts"]
