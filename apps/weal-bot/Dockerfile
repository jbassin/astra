# Astra weal-bot — the dice/host Discord bot (0009). Long-running service: discord.js
# gateway + the internal speak API. Runs on Node 24 at runtime (R3, 0022 S5 — off Bun;
# `node --import .../nodeTsResolve.mjs` runs the TS entry directly, same hook as
# ledger's S4 pilot); the build stage now also runs Node 24 + pnpm (0022 S11 — D12's bun build stage retired; install only, no bundling).
#
# Build context is the REPO ROOT (weal-bot is a pnpm workspace member depending on
# @astra/{config,observe,ontology} via workspace:*), so the whole pnpm workspace must
# be present for `pnpm install` to resolve workspace links. Build from deploy/ via compose.
FROM node:24-slim AS build
WORKDIR /repo

# Install against the FULL workspace manifest set (cached unless manifests change).
# Every app manifest must be present: the root `apps/*`/`libs/ts/*` globs resolve the
# whole workspace, so a partial set reads as "lockfile had changes" under
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

# --- Runtime: Node 24 (R3, 0022 S5) carrying the app + workspace deps + ontology data ---
# node:24-slim ships a built-in `node` user at uid/gid 1000, so compose's
# `user: "1000:1000"` (deploy-artifacts-run-as-user) carries over unchanged.
FROM node:24-slim AS runtime
WORKDIR /repo/apps/weal-bot
ENV NODE_ENV=production
# node_modules + libs/ts together preserve the @astra/* workspace symlinks that
# src/index.ts resolves at runtime.
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/libs/ts /repo/libs/ts
COPY --from=build /repo/apps/weal-bot/node_modules ./node_modules
COPY apps/weal-bot/src ./src
COPY apps/weal-bot/package.json ./package.json
# Config + identity are read at runtime via @astra/config / @astra/ontology, which
# locate them by walking up to <repo>/ontology/{ontology-config,ontology-being}.
COPY ontology/ontology-config /repo/ontology/ontology-config
COPY ontology/ontology-being /repo/ontology/ontology-being

EXPOSE 10203
# Invoke node directly (not `npm run start`) — one less process layer (D13).
CMD ["node", "--import", "../../libs/ts/site-kit/src/nodeTsResolve.mjs", "src/index.ts"]
