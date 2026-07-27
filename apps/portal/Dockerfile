# Astra portal — the FoundryVTT MCP+WS bridge server (spec 0023). Node 24 runtime,
# `node --import .../nodeTsResolve.mjs` runs the TS entry directly (D3: no build step
# for the server itself, mirroring orator-backend's idiom). D7's nested workspace
# layout (apps/portal/{server,module,shared}) means this build ALSO compiles the
# Foundry module (tsdown -> module/dist/main.js) so the runtime image can serve the
# packaged zip (D11 — install-by-Manifest-URL, no host file-drop needed in steady
# state; `just portal-module-install` stays a local fallback).
#
# Build context is the REPO ROOT (portal-server depends on @astra/{config,observe}
# via workspace:*, and portal-module/-shared via workspace:* too), so the whole pnpm
# workspace must be present for `pnpm install` to resolve links. Build from deploy/
# via compose.
FROM node:24-slim AS build
WORKDIR /repo

# Install against the FULL workspace manifest set (cached unless manifests change).
# Every workspace member's manifest must be present so the shared pnpm-lock.yaml
# reconciles: the root apps/*, apps/portal/*, libs/ts/* globs resolve the FULL
# workspace, so a partial app set reads as "lockfile changed" under
# --frozen-lockfile. (Add a new app's manifest here too; libs/ts is copied wholesale.)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/akasha-frontend/package.json apps/akasha-frontend/
COPY apps/codex/package.json apps/codex/
COPY apps/harrow/package.json apps/harrow/
COPY apps/heartwood-frontend/package.json apps/heartwood-frontend/
COPY apps/ledger/package.json apps/ledger/
COPY apps/menhir/package.json apps/menhir/
COPY apps/mouthpiece-frontend/package.json apps/mouthpiece-frontend/
COPY apps/orator-backend/package.json apps/orator-backend/
COPY apps/orator-controller/package.json apps/orator-controller/
COPY apps/portal/headless/package.json apps/portal/headless/
COPY apps/portal/module/package.json apps/portal/module/
COPY apps/portal/server/package.json apps/portal/server/
COPY apps/portal/shared/package.json apps/portal/shared/
COPY apps/strider/package.json apps/strider/
COPY apps/vellum-frontend/package.json apps/vellum-frontend/
COPY apps/vellum-render/package.json apps/vellum-render/
COPY apps/weal-bot/package.json apps/weal-bot/
COPY apps/weal-overlay/package.json apps/weal-overlay/
COPY libs/ts ./libs/ts
RUN corepack enable && corepack prepare pnpm@10.34.4 --activate \
    && pnpm install --frozen-lockfile

# The shared base tsconfig that portal-module/-shared/-server all extend — tsdown's
# esbuild follows `extends` at build time, so it must be present at the repo root
# (mirrors orator-backend's vite build needing the same file).
COPY tsconfig.base.json ./

# Build the Foundry module (tsdown -> apps/portal/module/dist/main.js) — packaged at
# runtime (by portal-server's modulePackage.ts) into the installable zip, so the
# deployed server always serves a current package with no host file-drop step.
COPY apps/portal/shared ./apps/portal/shared
COPY apps/portal/module ./apps/portal/module
RUN pnpm --filter @astra/portal-module build

# --- Runtime: Node 24 carrying the server + the BUILT module + workspace deps ---
# node:24-slim ships a built-in `node` user at uid/gid 1000, so compose's
# `user: "1000:1000"` (deploy-artifacts-run-as-user) carries over unchanged.
FROM node:24-slim AS runtime
WORKDIR /repo/apps/portal/server
ENV NODE_ENV=production

# node_modules + libs/ts together preserve the @astra/* workspace symlinks that
# src/index.ts resolves at runtime.
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/libs/ts /repo/libs/ts
COPY --from=build /repo/apps/portal/shared /repo/apps/portal/shared
# Only module.json + the built dist/ — no node_modules/src needed at runtime, since
# tsdown already bundled every dependency into the single dist/main.js (D11).
COPY --from=build /repo/apps/portal/module/module.json /repo/apps/portal/module/module.json
COPY --from=build /repo/apps/portal/module/dist /repo/apps/portal/module/dist
COPY --from=build /repo/apps/portal/server/node_modules ./node_modules
COPY apps/portal/server/src ./src
COPY apps/portal/server/package.json ./package.json
# Config is read at runtime via @astra/config, which locates it by walking up to
# <repo>/ontology/ontology-config.
COPY ontology/ontology-config /repo/ontology/ontology-config

EXPOSE 10372
# Invoke node directly (not `npm run start`) — one less process layer, matching
# orator-backend/weal-bot/ledger. The relative nodeTsResolve.mjs path mirrors this
# package's own "start" script (one level deeper than orator-backend's, since
# apps/portal/server is nested under apps/portal/).
CMD ["node", "--import", "../../../libs/ts/site-kit/src/nodeTsResolve.mjs", "src/index.ts"]
