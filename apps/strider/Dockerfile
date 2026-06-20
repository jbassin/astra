# Astra strider — SSR frontend service (Decision I). One image, two commands:
#   - `bun run start`         → the TanStack Start SSR server (serves dist/ + SSR)
#   - `bun run editor:server` → the /editor layer-writer API (authoring sidecar)
#
# Build context is the REPO ROOT (strider is a bun workspace member that depends
# on @astra/gothic via workspace:*), so the whole bun workspace must be present
# for `bun install` to resolve workspace links. Build from deploy/ via compose.
FROM oven/bun:1.3.14 AS build
WORKDIR /repo

# Install against the full workspace manifest set (cached unless manifests change).
COPY package.json bun.lock ./
COPY apps/strider/package.json apps/strider/package.json
COPY libs/ts ./libs/ts
RUN bun install --frozen-lockfile

# Build strider (build-content runs in the vite buildStart hook).
COPY apps/strider ./apps/strider
WORKDIR /repo/apps/strider
RUN bun run build

# --- Runtime: slim image carrying the built app + its content + deps ---
FROM oven/bun:1.3.14-slim AS runtime
WORKDIR /repo/apps/strider
ENV NODE_ENV=production PORT=10360
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/apps/strider/node_modules ./node_modules
COPY --from=build /repo/apps/strider/dist ./dist
COPY --from=build /repo/apps/strider/content ./content
COPY --from=build /repo/apps/strider/src/generated ./src/generated
COPY --from=build /repo/apps/strider/server.ts ./server.ts
COPY --from=build /repo/apps/strider/scripts/editor-server.ts ./scripts/editor-server.ts
COPY --from=build /repo/apps/strider/package.json ./package.json

EXPOSE 10360
CMD ["bun", "run", "start"]
