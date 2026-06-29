# Astra render service (0013, D2/D3) — vellum-render. A warm Bun + Playwright sidecar
# that screenshots gothic-rendered vellum documents to PNG. The FIRST
# browser-in-a-container in astra: the runtime stage installs Chromium + its system
# libraries on the bun-slim base (the pin is the `playwright` version in bun.lock, so
# the render image and the CI visual-regression container share the exact same
# Chromium — D3/D4). `--no-sandbox` is set at launch (renderService.ts) since the
# container has no user-namespace sandbox.
#
# Build context is the REPO ROOT (a bun workspace member). Port + service name come
# from config.kdl (config-single-source) — no PORT env; compose maps the host port.
ARG APP=vellum-render

FROM oven/bun:1.3.14 AS build
ARG APP
WORKDIR /repo

# Install against the full workspace manifest set (cached unless manifests change).
COPY package.json bun.lock ./
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
RUN bun install --frozen-lockfile

# The shared base tsconfig + config.kdl must be present at build time (vite + the
# render-entry build read them via the workspace / @astra/config).
COPY tsconfig.base.json ./
COPY ontology/ontology-config /repo/ontology/ontology-config

# Build the render-entry page (plain Vite → dist/render.html + assets + fonts).
COPY apps/${APP} ./apps/${APP}
WORKDIR /repo/apps/${APP}
RUN bun run build

# --- Runtime: slim bun image + Chromium (the browser-in-container) ---
FROM oven/bun:1.3.14-slim AS runtime
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
RUN bunx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

CMD ["bun", "run", "start"]
