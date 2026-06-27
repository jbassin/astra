# Astra weal-overlay — the dice-roll OBS overlay (0009 K7). `vite build` → dist/,
# then `bun run start` serves dist/ + the v1 ingest + the SSE feed.
#
# Build context is the REPO ROOT (workspace member depending on @astra/{gothic,
# observe,config}). Build from deploy/ via compose.
FROM oven/bun:1.3.14 AS build
WORKDIR /repo

# Install against the FULL workspace manifest set: the root `apps/*`/`libs/ts/*` globs
# resolve the whole workspace, so a partial set reads as "lockfile had changes" under
# --frozen-lockfile. Add a new app's manifest here too (libs/ts is copied wholesale).
COPY package.json bun.lock ./
COPY apps/akasha-frontend/package.json apps/akasha-frontend/
COPY apps/harrow/package.json apps/harrow/
COPY apps/mouthpiece-frontend/package.json apps/mouthpiece-frontend/
COPY apps/orator-backend/package.json apps/orator-backend/
COPY apps/orator-controller/package.json apps/orator-controller/
COPY apps/strider/package.json apps/strider/
COPY apps/vellum-frontend/package.json apps/vellum-frontend/
COPY apps/vellum-render/package.json apps/vellum-render/
COPY apps/weal-bot/package.json apps/weal-bot/
COPY apps/weal-overlay/package.json apps/weal-overlay/
COPY libs/ts ./libs/ts
RUN bun install --frozen-lockfile

# Shared base tsconfig (vite's esbuild follows `extends` at build time).
COPY tsconfig.base.json ./
COPY apps/weal-overlay ./apps/weal-overlay
WORKDIR /repo/apps/weal-overlay
RUN bun run build

# --- Runtime: slim image carrying the built overlay + the Bun server ---
FROM oven/bun:1.3.14-slim AS runtime
WORKDIR /repo/apps/weal-overlay
ENV NODE_ENV=production
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
CMD ["bun", "run", "start"]
