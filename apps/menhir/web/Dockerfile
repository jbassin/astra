# menhir — the Kahoot-style session-opener quiz (0031). `vite build` → dist/, then
# the Node server (R3, 0022 S8 — off Bun; srvx + @astra/site-kit's `serveFile`)
# serves dist/ + the API + the SSE feed.
#
# Build context is the REPO ROOT (workspace member depending on @astra/{observe,
# config,site-kit}). Build from deploy/ via compose.
FROM node:24-slim AS build
WORKDIR /repo

# Install against the FULL workspace manifest set: the root `apps/*`/`libs/ts/*` globs
# resolve the whole workspace, so a partial set reads as "lockfile had changes" under
# --frozen-lockfile. Add a new app's manifest here too (libs/ts is copied wholesale).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/akasha/web/package.json apps/akasha/web/
COPY apps/codex/web/package.json apps/codex/web/
COPY apps/harrow/web/package.json apps/harrow/web/
COPY apps/ledger/web/package.json apps/ledger/web/
COPY apps/menhir/web/package.json apps/menhir/web/
COPY apps/mouthpiece/web/package.json apps/mouthpiece/web/
COPY apps/orator/bot/package.json apps/orator/bot/
COPY apps/orator/controller/package.json apps/orator/controller/
COPY apps/portal/headless/package.json apps/portal/headless/
COPY apps/portal/module/package.json apps/portal/module/
COPY apps/portal/server/package.json apps/portal/server/
COPY apps/portal/shared/package.json apps/portal/shared/
COPY apps/strider/web/package.json apps/strider/web/
COPY apps/vellum/web/package.json apps/vellum/web/
COPY apps/vellum/render/package.json apps/vellum/render/
COPY apps/weal/bot/package.json apps/weal/bot/
COPY apps/weal/overlay/package.json apps/weal/overlay/
COPY libs/ts ./libs/ts
RUN corepack enable && corepack prepare pnpm@10.34.4 --activate \
    && pnpm install --frozen-lockfile

# Shared base tsconfig (vite's esbuild follows `extends` at build time).
COPY tsconfig.base.json ./
COPY apps/menhir/web ./apps/menhir/web
WORKDIR /repo/apps/menhir/web
RUN pnpm run build

# --- Runtime: Node 24 (R3, 0022 S8) carrying the built app + the Node server ---
# node:24-slim ships a built-in `node` user at uid/gid 1000, so compose's
# `user: "1000:1000"` (deploy-artifacts-run-as-user) carries over unchanged.
FROM node:24-slim AS runtime
WORKDIR /repo/apps/menhir/web
ENV NODE_ENV=production
# node_modules + libs/ts together preserve the @astra/* workspace symlinks that
# src/server.ts resolves at runtime (incl. @astra/site-kit's `serveFile`).
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/libs/ts /repo/libs/ts
COPY --from=build /repo/apps/menhir/web/node_modules ./node_modules
COPY --from=build /repo/apps/menhir/web/dist ./dist
COPY --from=build /repo/apps/menhir/web/server.ts ./server.ts
COPY --from=build /repo/apps/menhir/web/src ./src
COPY --from=build /repo/apps/menhir/web/package.json ./package.json
# The starter quiz files (D31-4) — the template's runtime allowlist otherwise ships
# ZERO quiz files (review blocker).
COPY --from=build /repo/apps/menhir/web/quizzes ./quizzes
# config.kdl is the single source for the port + public origin + results path
# (read via @astra/config).
COPY ontology/ontology-config /repo/ontology/ontology-config

EXPOSE 10375
CMD ["node", "--import", "../../../libs/ts/site-kit/src/nodeTsResolve.mjs", "server.ts"]
