# Astra strider — SSR frontend service (Decision I). `bun run start` runs the
# TanStack Start SSR server (serves dist/ + SSR + the editor write server fn).
#
# Build context is the REPO ROOT (strider is a bun workspace member depending on
# @astra/gothic + @astra/observe via workspace:*), so the whole bun workspace must
# be present for `bun install` to resolve workspace links. Build from deploy/ via
# compose.
FROM oven/bun:1.3.14 AS build
WORKDIR /repo

# Install against the full workspace manifest set (cached unless manifests change).
# Every workspace member's manifest must be present so the shared bun.lock
# reconciles: the root `apps/*`/`libs/ts/*` globs resolve the FULL workspace, so a
# partial app set reads as "lockfile had changes" under --frozen-lockfile. (Add a
# new app's manifest here too; libs/ts is copied wholesale below.)
COPY package.json bun.lock ./
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

# Build strider (build-content runs in the vite buildStart hook).
COPY apps/strider ./apps/strider
WORKDIR /repo/apps/strider
RUN bun run build

# --- Runtime: slim image carrying the built app + its content + workspace deps ---
FROM oven/bun:1.3.14-slim AS runtime
WORKDIR /repo/apps/strider
ENV NODE_ENV=production PORT=10360
# node_modules + libs/ts together preserve the @astra/* workspace symlinks that
# server.ts resolves at runtime (@astra/observe → @astra/config).
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/libs/ts /repo/libs/ts
COPY --from=build /repo/apps/strider/node_modules ./node_modules
COPY --from=build /repo/apps/strider/dist ./dist
COPY --from=build /repo/apps/strider/content ./content
COPY --from=build /repo/apps/strider/src/generated ./src/generated
COPY --from=build /repo/apps/strider/server.ts ./server.ts
COPY --from=build /repo/apps/strider/package.json ./package.json
# config.kdl is the single source for the OTLP endpoint (read via @astra/config);
# @astra/config locates it by walking up to <repo>/ontology/ontology-config.
COPY ontology/ontology-config /repo/ontology/ontology-config

EXPOSE 10360
CMD ["bun", "run", "start"]
