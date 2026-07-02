# Astra weal-overlay — the dice-roll OBS overlay (0009 K7). `vite build` → dist/,
# then the Node server (R3, 0022 S8 — off Bun; srvx + @astra/site-kit's `serveFile`)
# serves dist/ + the v1 ingest + the SSE feed.
#
# Build context is the REPO ROOT (workspace member depending on @astra/{gothic,
# observe,config,site-kit}). Build from deploy/ via compose.
FROM node:24-slim AS build
WORKDIR /repo

# Install against the FULL workspace manifest set: the root `apps/*`/`libs/ts/*` globs
# resolve the whole workspace, so a partial set reads as "lockfile had changes" under
# --frozen-lockfile. Add a new app's manifest here too (libs/ts is copied wholesale).
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

# Shared base tsconfig (vite's esbuild follows `extends` at build time).
COPY tsconfig.base.json ./
COPY apps/weal-overlay ./apps/weal-overlay
WORKDIR /repo/apps/weal-overlay
RUN pnpm run build

# --- Runtime: Node 24 (R3, 0022 S8) carrying the built overlay + the Node server ---
# node:24-slim ships a built-in `node` user at uid/gid 1000, so compose's
# `user: "1000:1000"` (deploy-artifacts-run-as-user) carries over unchanged.
FROM node:24-slim AS runtime
WORKDIR /repo/apps/weal-overlay
ENV NODE_ENV=production
# node_modules + libs/ts together preserve the @astra/* workspace symlinks that
# src/server.ts resolves at runtime (incl. @astra/site-kit's `serveFile`).
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/libs/ts /repo/libs/ts
COPY --from=build /repo/apps/weal-overlay/node_modules ./node_modules
COPY --from=build /repo/apps/weal-overlay/dist ./dist
COPY --from=build /repo/apps/weal-overlay/server.ts ./server.ts
COPY --from=build /repo/apps/weal-overlay/src ./src
COPY --from=build /repo/apps/weal-overlay/package.json ./package.json
# config.kdl is the single source for the OTLP + RUM endpoints (read via @astra/config).
COPY ontology/ontology-config /repo/ontology/ontology-config

EXPOSE 10360
CMD ["node", "--import", "../../libs/ts/site-kit/src/nodeTsResolve.mjs", "server.ts"]
