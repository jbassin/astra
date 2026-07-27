# Astra portal-headless (0027 D27-5/-6/-10) — the supervised headless-Chromium GM
# session: a warm, persistent Chromium page driving Foundry's real `/join` flow so
# portal's MCP tools work with no human browser tab open. Follows vellum-render's
# browser-in-a-container recipe (Chromium installed on node:24-slim, pinned
# transitively by `pnpm-lock.yaml`, `--no-sandbox` at launch, `chown /ms-playwright`
# for the non-root runtime user) crossed with portal-server's "no build step, run
# unbuilt TS via `nodeTsResolve.mjs`" idiom (this service has nothing to compile —
# no vite render entry, no tsdown module bundle, just `src/index.ts`).
#
# Build context is the REPO ROOT (portal-headless depends on @astra/{config,observe}
# via workspace:*), so the whole pnpm workspace must be present for `pnpm install`
# to resolve links. Build from deploy/ via compose.
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

# --- Runtime: Node 24 (mirrors vellum-render's runtime-exit recipe) + Chromium (the
# browser-in-container, warm for process life per D27-10) ---
# node:24-slim ships a built-in `node` user at uid/gid 1000, so compose's
# `user: "1000:1000"` (deploy-artifacts-run-as-user) carries over unchanged.
FROM node:24-slim AS runtime
ENV NODE_ENV=production
# Browsers land here (shared with vellum-render's pattern / the CI VR container).
# playwrightDriver.ts launches with --no-sandbox, so root + no user-namespace
# sandbox is fine during the install below.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /repo/apps/portal/headless

# node_modules + libs/ts preserve the @astra/* workspace symlinks that src/index.ts
# resolves at runtime (@astra/config, @astra/observe).
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/libs/ts /repo/libs/ts
COPY --from=build /repo/apps/portal/headless/node_modules ./node_modules
COPY apps/portal/headless/src ./src
COPY apps/portal/headless/package.json ./package.json
# Config is read at runtime via @astra/config, which locates it by walking up to
# <repo>/ontology/ontology-config (the portal-headless {} block, D27-13).
COPY ontology/ontology-config /repo/ontology/ontology-config

# Install Chromium + its system libraries. The version is pinned by the `playwright`
# package already in node_modules (copied above), so this is deterministic against
# the lockfile.
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# The compose service runs this image as user 1000:1000 (like the other astra
# containers). Chromium installs to PLAYWRIGHT_BROWSERS_PATH as root above; chown it
# so the non-root runtime user can read/execute the browser bundle. (The browser's
# context is an ephemeral in-memory profile — `playwrightDriver.ts` never opens a
# persistent user-data-dir — so nothing else needs to be writable.)
RUN chown -R 1000:1000 /ms-playwright

EXPOSE 10373
# Invoke node directly (not `npm run start`) — one less process layer, matching
# portal-server/vellum-render. apps/portal/headless is the same nesting depth as
# apps/portal/server, hence the identical "../../../" prefix back to /repo.
CMD ["node", "--import", "../../../libs/ts/site-kit/src/nodeTsResolve.mjs", "src/index.ts"]
