# Astra render service (0013, D2/D3) — vellum-render. A warm Node + Playwright
# sidecar that screenshots gothic-rendered vellum documents to PNG. The FIRST
# browser-in-a-container in astra: the runtime stage installs Chromium + its system
# libraries on the node-slim base (the pin is the `playwright` version in
# pnpm-lock.yaml, so the render image and the CI visual-regression container — both
# node:24-slim as of 0022 S11 — share the exact same Chromium — D3/D4). `--no-sandbox`
# is set at launch (renderService.ts) since the container has no user-namespace sandbox.
#
# Build context is the REPO ROOT (a pnpm workspace member). Port + service name come
# from config.kdl (config-single-source) — no PORT env; compose maps the host port.
# Build stage now also runs Node 24 + pnpm (0022 S11 — D12's mixed bun-build/
# node-runtime retired); runtime is Node 24 (R3, 0022 S9 — the runtime-exit recipe;
# D13).
ARG APP=vellum-render

FROM node:24-slim AS build
ARG APP
WORKDIR /repo

# Install against the full workspace manifest set (cached unless manifests change).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/akasha-frontend/package.json apps/akasha-frontend/
COPY apps/harrow/package.json apps/harrow/
COPY apps/heartwood-frontend/package.json apps/heartwood-frontend/
COPY apps/ledger/package.json apps/ledger/
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

# The shared base tsconfig + config.kdl must be present at build time (vite + the
# render-entry build read them via the workspace / @astra/config).
COPY tsconfig.base.json ./
COPY ontology/ontology-config /repo/ontology/ontology-config

# Build the render-entry page (plain Vite → dist/render.html + assets + fonts).
COPY apps/${APP} ./apps/${APP}
WORKDIR /repo/apps/${APP}
RUN pnpm run build

# --- Runtime: Node 24 (R3, 0022 S9) + Chromium (the browser-in-container) ---
# node:24-slim ships a built-in `node` user at uid/gid 1000, so compose's
# `user: "1000:1000"` (deploy-artifacts-run-as-user) carries over unchanged.
FROM node:24-slim AS runtime
ARG APP
ENV NODE_ENV=production
# Browsers land here (shared with the CI VR container). renderService launches with
# --no-sandbox, so root + no user-namespace sandbox is fine.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /repo/apps/${APP}

# node_modules + libs/ts preserve the @astra/* workspace symlinks that src/server.ts
# resolves at runtime (@astra/observe → @astra/config; @astra/vellum-lang/gothic are
# bundled into dist by vite, but the server itself imports @astra/config/observe).
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/libs/ts /repo/libs/ts
COPY --from=build /repo/apps/${APP}/node_modules ./node_modules
COPY --from=build /repo/apps/${APP}/dist ./dist
COPY --from=build /repo/apps/${APP}/src ./src
COPY --from=build /repo/apps/${APP}/package.json ./package.json
# config.kdl is the single source for serviceName/port + the OTLP endpoint; located
# by walking up to <repo>/ontology/ontology-config.
COPY ontology/ontology-config /repo/ontology/ontology-config

# Install Chromium + its system libraries. The version is pinned by the `playwright`
# package already in node_modules (copied above), so this is deterministic against
# the lockfile.
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# The compose service runs this image as user 1000:1000 (like the other astra containers).
# Chromium installs to PLAYWRIGHT_BROWSERS_PATH as root above; chown it so the non-root
# runtime user can read/execute the browser bundle. (The browser's user-data-dir is an
# ephemeral /tmp profile, so nothing else needs to be writable.)
RUN chown -R 1000:1000 /ms-playwright

CMD ["node", "--import", "../../libs/ts/site-kit/src/nodeTsResolve.mjs", "src/server.ts"]
