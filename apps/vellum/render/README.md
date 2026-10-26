# vellum-render — the vellum PNG render service

vellum-render turns a vellum document into a PNG. It keeps one warm headless Chromium (Playwright)
and renders each request in a fresh browser context. Compose service `vellum-render`, port 10368,
`service.name=astra.vellum-render`; Caddy routes `vellum.iridi.cc/render` and `/health` here
(the editor in `apps/vellum/web` calls it same-origin). At the edge, `/render` bodies over 1 MB get
413 before they reach the service, and `/health` answers only LAN clients. Endpoints: `POST /render` →
`image/png`, `GET /health` → `{ready}`, and `/healthz` (the compose healthcheck). The service is
defined in `src/app.ts` on `@astra/service-kit` and started by `src/server.ts`; on SIGTERM it
drains in-flight renders, then closes Chromium. `src/pins.test.ts` pins every response against a
fake renderer.

## How a render works

`src/render-entry/` is a separate plain-Vite build (`render.html`, not TanStack) that exposes
`window.vellumRender(source, mode)`. It renders gothic `DocumentView`, waits for
`document.fonts.ready` between two animation frames, and `renderService.ts` screenshots the
`[data-vellum-export]` element. A semaphore caps concurrent renders, each request gets a per-IP
rate limit, and `caps.ts` bounds source size, scale, pixel area and render time.

## Operations

The golden-image gate compares each fixture in `test/visual/fixtures.ts` with its PNG in
`test/visual/golden/` and fails above 0.5% differing pixels. It runs as the CI job
`vellum-visual-regression` whenever vellum-render, `libs/ts/gothic` or `libs/ts/vellum-lang`
changes. `just ci` skips it, because goldens are only valid inside the pinned container.

To regenerate goldens after an intended visual change, run the CI job's steps inside
`node:24-slim` with `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, ending with `--update`:

```bash
corepack enable && corepack install
pnpm install --frozen-lockfile
(cd apps/vellum/render && npx playwright install --with-deps chromium)
pnpm --filter @astra/vellum-render build
pnpm --filter @astra/vellum-render visual-regression:update
```

The container runs as root, so give the written PNGs back to uid 1000 before committing. Review
every changed PNG by eye, then commit them.

## Traps

- **Goldens drift on any host but the pinned container.** Anti-aliasing and hinting differ across
  machines by more than the 0.5% tolerance. The Chromium build is pinned by the `playwright`
  version in `pnpm-lock.yaml`; the image and the CI job install the same one. Bumping `playwright`
  means regenerating goldens and setting `ARG PLAYWRIGHT_VERSION` in `deploy/node.Dockerfile` to
  the new locked version (`just infra-check` fails until they match).
- **Changing gothic or vellum-lang drifts goldens too**, which is why the CI path filter includes
  both libraries.
- **All assets must be same-origin.** The render context aborts every request that isn't
  same-origin or `data:`, so a network font renders as blank glyphs. `gothicFontsPlugin` copies
  gothic's fonts into `dist/fonts`.
- **Serve static files with site-kit `serveFile`.** A hand-rolled `node:fs` read with no
  content type makes Chromium refuse the module script (`window.vellumRender is not a function`).
- **Playwright isn't hoisted under pnpm.** Run `npx playwright install` from `apps/vellum/render`,
  not the repo root.
- **Healthcheck waits for Chromium.** `/healthz` answers 200 only while the browser is connected
  (its `chromium` probe), and `/health` reports the same as `ready`; compose gives it a 25 s
  `start_period`.
