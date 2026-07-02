# Astra SSR frontend service (Decision I) — akasha-frontend, on the strider template.
# `node --import .../nodeTsResolve.mjs server.ts` runs the TanStack Start SSR server
# (serves dist/ + SSR) on Node 24 — the R3 runtime-exit (0022 S6, the audio-mounts
# Range/206 pilot); the build stage now also runs Node 24 + pnpm (0022 S11 — D12's bun build stage retired). One knob: `ARG APP` selects which
# apps/<APP> is built; everything else is workspace-generic except the content-pipeline
# COPYs in the runtime stage (noted inline).
#
# Build context is the REPO ROOT (a frontend is a pnpm workspace member depending on
# @astra/site-kit/gothic/observe via workspace:*), so the whole pnpm workspace must be
# present for `pnpm install` to resolve workspace links. Build from deploy/ via compose.
# Port + service name come from config.kdl (config-single-source) — no PORT env;
# compose maps the published host port.
ARG APP=akasha-frontend

FROM node:24-slim AS build
ARG APP
WORKDIR /repo

# Install against the full workspace manifest set (cached unless manifests change).
# Every workspace member's manifest must be present so the shared pnpm-lock.yaml reconciles:
# the root `apps/*`/`libs/ts/*` globs resolve the FULL workspace, so a partial app set
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
# it via @astra/config (config-single-source). Without it the config load throws.
COPY ontology/ontology-config /repo/ontology/ontology-config

# akasha-frontend's build-time content sources read the akasha-backend snapshot/corpus
# (slug.ts/site.ts lift + vellum render) + linguist transcripts (D4) + the chronicle
# timeline (0019) — COPY them so
# build-content (run in the vite buildStart hook) can read them. ontology-being carries
# the campaign roster (matchCampaign) + speaker colors (loadBeing, slice 7); without it
# the transcript build throws. (The Pagefind index step in `pnpm run build` uses the
# pagefind binary that `pnpm install` already fetched into node_modules.)
COPY apps/akasha-backend/snapshot /repo/apps/akasha-backend/snapshot
COPY apps/akasha-backend/content /repo/apps/akasha-backend/content
COPY apps/linguist/data /repo/apps/linguist/data
COPY apps/linguist/timeline /repo/apps/linguist/timeline
COPY ontology/ontology-being /repo/ontology/ontology-being

# Build the selected app (build-content runs in the vite buildStart hook).
COPY apps/${APP} ./apps/${APP}
WORKDIR /repo/apps/${APP}
RUN pnpm run build

# --- Runtime: Node 24 (R3, 0022 S6 — the audio-mounts Range/206 pilot; build stage
# also Node 24 + pnpm, 0022 S11). node:24-slim ships a built-in `node` user at uid/gid
# 1000, so compose's
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
# Content-pipeline-specific: the generated TS modules the runtime imports (the app
# imports @/generated/*, never the filesystem — so the snapshot/corpus are build-only).
COPY --from=build /repo/apps/${APP}/src/generated ./src/generated
# config.kdl is the single source for serviceName/port + the OTLP endpoint (read via
# @astra/config); it's located by walking up to <repo>/ontology/ontology-config.
COPY ontology/ontology-config /repo/ontology/ontology-config

# Invoke node directly (not `npm run start`) — one less process layer, and the
# runtime image needs no package-manager story at all (D13).
CMD ["node", "--import", "../../libs/ts/site-kit/src/nodeTsResolve.mjs", "server.ts"]
