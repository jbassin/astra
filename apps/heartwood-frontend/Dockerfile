# Astra SSR frontend service (Decision I) — heartwood review surface (0020 Phase 4),
# on the strider/ledger template. `node --import .../nodeTsResolve.mjs server.ts` runs
# the TanStack Start SSR server on Node 24 — the R3 runtime-exit (0022 S7); the build
# stage now also runs Node 24 + pnpm (0022 S11 — D12's bun build stage retired). One
# knob: `ARG APP` selects which apps/<APP> is built;
# everything else is workspace-generic. Heartwood has NO backend snapshot baked in —
# unlike the other frontends it reads its content (the staged proposals + the akasha
# corpus) at RUNTIME via server fns over narrow bind-mounts (deploy/docker-compose.yml).
# So this is a minimal frontend Dockerfile — no content-input COPY beyond config.kdl.
#
# Build context is the REPO ROOT (a frontend is a pnpm workspace member depending on
# @astra/site-kit/gothic/observe via workspace:*), so the whole pnpm workspace must be
# present for `pnpm install`. Port + service name come from config.kdl (config-single-
# source) — no PORT env; compose maps the published host port + runs as user 1000:1000
# so the bind-mount writes land host-owned.
ARG APP=heartwood-frontend

FROM node:24-slim AS build
ARG APP
WORKDIR /repo

# Install against the full workspace manifest set (cached unless manifests change).
# The root `apps/*`/`libs/ts/*` globs resolve the FULL workspace, so a partial app set
# reads as "lockfile had changes" under --frozen-lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/akasha-frontend/package.json apps/akasha-frontend/
COPY apps/harrow/package.json apps/harrow/
COPY apps/heartwood-frontend/package.json apps/heartwood-frontend/
COPY apps/ledger/package.json apps/ledger/
COPY apps/mouthpiece-frontend/package.json apps/mouthpiece-frontend/
COPY apps/orator-backend/package.json apps/orator-backend/
COPY apps/orator-controller/package.json apps/orator-controller/
COPY apps/strider/package.json apps/strider/
COPY apps/vellum-frontend/package.json apps/vellum-frontend/
COPY apps/vellum-render/package.json apps/vellum-render/
COPY apps/weal-bot/package.json apps/weal-bot/
COPY apps/weal-overlay/package.json apps/weal-overlay/
COPY libs/ts ./libs/ts
RUN corepack enable && corepack prepare pnpm@10.34.4 --activate \
    && pnpm install --frozen-lockfile

# The shared base tsconfig that every member extends — vite's esbuild follows
# `extends` at build time, so it must be present at the repo root.
COPY tsconfig.base.json ./

# config.kdl must be present at BUILD time: vite.config.ts reads serviceName/port from
# it via @astra/config (config-single-source).
COPY ontology/ontology-config /repo/ontology/ontology-config

# Build the selected app.
COPY apps/${APP} ./apps/${APP}
WORKDIR /repo/apps/${APP}
RUN pnpm run build

# --- Runtime: Node 24 (R3, 0022 S7 — the runtime-exit recipe; build stage also Node 24 + pnpm, 0022 S11).
# node:24-slim ships a built-in `node` user at uid/gid 1000, so compose's
# `user: "1000:1000"` (deploy-artifacts-run-as-user) carries over unchanged. ---
FROM node:24-slim AS runtime
ARG APP
WORKDIR /repo/apps/${APP}
ENV NODE_ENV=production
# node_modules + libs/ts together preserve the @astra/* workspace symlinks that
# server.ts resolves at runtime (@astra/site-kit → @astra/observe → @astra/config).
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/libs/ts /repo/libs/ts
COPY --from=build /repo/apps/${APP}/node_modules ./node_modules
COPY --from=build /repo/apps/${APP}/dist ./dist
COPY --from=build /repo/apps/${APP}/server.ts ./server.ts
COPY --from=build /repo/apps/${APP}/package.json ./package.json
# config.kdl is the single source for serviceName/port + the OTLP endpoint.
COPY ontology/ontology-config /repo/ontology/ontology-config

# Invoke node directly (not `npm run start`) — one less process layer, and the
# runtime image needs no package-manager story at all (D13).
CMD ["node", "--import", "../../libs/ts/site-kit/src/nodeTsResolve.mjs", "server.ts"]
