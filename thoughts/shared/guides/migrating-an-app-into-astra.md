# Migrating a non-TanStack app into the astra ecosystem

A playbook for taking an existing application — a faerrin frontend, a CRA/Vite SPA, a
Next.js app, a plain React build, or a standalone service — and rebuilding it as a
first-class astra citizen. Read this **before** starting any of the remaining frontend
migrations (0011–0013) or any new app.

This guide is the *sequenced how-to* and the *dos/don'ts*. It does not repeat what these
own — read them too:

- **`CONTRIBUTING.md`** — dev process, exact CI commands, the gotchas catalog (§8).
- **`CLAUDE.md`** — the authoritative conventions + the five standing principles.
- **`apps/strider/README.md`** — the concrete frontend port recipe (copy-this-app steps).
- **`thoughts/astra/plans/0000-astra-migration-roadmap.md`** — phases + decisions A–I.
- **Memories** — `strider-0016-gotchas`, `tanstack-start-skill`, `config-single-source`,
  `telemetry-built-in`, `deploy-apply-with-just`, `no-silent-scope-cuts`,
  `verify-before-acting`, `no-ci-monitoring`.

> **The one-sentence philosophy:** a migration is a *port*, not a rewrite — grep
> `/ruby/data/experiments/faerrin` (or the source app) first and lift its behaviour;
> reinvent only the plumbing that the ecosystem standardizes (config, telemetry, deploy,
> the frontend template).

---

## 0. TL;DR — the dos and don'ts

**Always do**
- ✅ **Port, don't reinvent.** Find the source implementation first; preserve its behaviour (and `player_id`-style identity keys verbatim).
- ✅ **Wire telemetry on day one** — call `init_telemetry`/`initTelemetry` in the *real entrypoint* (service `main`, Dagster code location, SSR server). Importing `observe` ≠ wiring it.
- ✅ **Read all config through `@astra/config` / `astra_config`** from `config.kdl`; mirror every new namespace in **both** the Zod (ts) and Pydantic (py) schemas.
- ✅ **Keep secrets as `ref="sops:KEY"`** in `config.kdl`, resolved lazily at use.
- ✅ **Reproduce both CI lanes locally before pushing** (see §7); commit each CI-green slice, push on chunk completion.
- ✅ **For frontends: copy strider.** Consume `@astra/site-kit` + `@astra/content-build`; keep the shell, replace `src/domain/` + `content/`.
- ✅ **Add a new TS app to `pyproject.toml` `[tool.uv.workspace] exclude`** and to every service Dockerfile's manifest-COPY list.
- ✅ **Give every new TS package ≥1 test** (`bun test` exits 1 on zero test files → reds CI).
- ✅ **Apply deploy/edge changes** with `just up` + `just caddy-reload`, then verify (curl + a SigNoz span).

**Never do**
- ❌ **Call a provider SDK directly** — all LLM calls go through `libs/py/llm` (litellm + dspy).
- ❌ **Read env vars for config** or hardcode ports/service-names/endpoints — `config.kdl` is the single source (the *only* env override is for secrets).
- ❌ **Put plaintext secrets in git.**
- ❌ **Thread raw KDL nodes through code** — parse → validate into Pydantic/Zod at the edge.
- ❌ **Prerender a frontend** (Decision I = SSR Compose service behind Caddy; no `prerender` block).
- ❌ **Import `@astra/config` (no-arg `loadConfig`) from `vite.config.ts`**, or import any workspace TS package there without `vite --configLoader runner` (see §6).
- ❌ **Define a `createServerFn` in a shared lib** — the TanStack Start plugin only transforms server fns in app source.
- ❌ **Vendor fonts** or rely on the host Caddy to serve them — gothic is the single source; the container self-serves (see §6).
- ❌ **Point a containerized service's OTLP endpoint at `localhost`** — use the in-cluster collector name.
- ❌ **Pre-create empty workspace member dirs** (uv hard-errors on a glob-matched dir without a `pyproject.toml`).
- ❌ **Silently cut or defer spec scope** to fit a budget — surface the trade-off and ask.
- ❌ **Watch the GitHub Actions run** to completion — reproduce CI locally, push, confirm one status check.

---

## 1. What "in the astra ecosystem" means

Five standing principles (CLAUDE.md) that every migrated app must satisfy — they are the
real definition of "done":

1. **Telemetry from day one** — OTel traces + metrics + logs to SigNoz, wired in the runtime.
2. **KDL at the edges** — parse KDL → validate into Pydantic/Zod immediately; secrets are `ref=` pointers resolved from SOPS at load. No plaintext in git.
3. **All LLM calls through `libs/py/llm`** (litellm + dspy) — never a provider SDK directly.
4. **strider is the frontend template** — every TanStack frontend follows its build-time-content → generated-modules → route-loader pattern and runs SSR as a Compose service behind Caddy with client RUM.
5. **Preserve identity keys** — `player_id` integers are load-bearing FKs; carry them verbatim.

**Runtime split (Decision H + I)** — decide where the app belongs before you wire it:
- **Pipeline** (data/LLM asset graph) → a **Dagster** asset; one partition per session/date.
- **Long-running service** (bots, SSR frontends, DBs, overlay/render services) → a **Docker Compose** unit (`restart: unless-stopped` + healthcheck).
- **Edge** → **Caddy** (`sites.caddyfile`) — TLS + reverse-proxy.
- **CI** → GitHub Actions.

**Two toolchains, disjoint workspaces** — a dir belongs to whichever lane its manifest
declares: `pyproject.toml` → uv (Python: ruff/ty/pytest), `package.json` → bun
(TypeScript: biome/tsc/bun test). They never cross-claim. Pick one; don't introduce a third language.

---

## 2. The process (every migration runs these three gates)

Leave a paper trail in `thoughts/` (CLAUDE.md / CONTRIBUTING.md §2):

1. **Scope** — `thoughts/shared/research/<date>-<subsystem>-<NNNN>-thoughts.md`. Read the source impl **and verify claims against the real repos** (resolve real config/secrets, load real fixtures — don't list "open questions" you can check now). Call out decisions to revisit.
2. **Spec** — `octo:spec` → `thoughts/astra/specs/<NNNN>-<subsystem>-spec.md`: locked decisions, scope in/out, the slice list, the acceptance gate.
3. **Implement** — `octo:embrace` against the spec. Build the spec's scope **in full** (surface trade-offs, never silently defer — only spec-sanctioned deferrals are OK). Wire telemetry from day one. Commit each CI-green slice; push on chunk completion (reproduce CI locally first; don't watch the GHA run). Then update the memory with the load-bearing gotchas.

**Working style (the expensive lessons):** verify before acting; port don't reinvent;
hermetic tests (CI has no ffmpeg, no live keys, no SOPS age key — inject seams).

---

## 3. Migrating a frontend → the strider SSR template (the common case)

"Non-TanStack" almost always means a frontend (CRA, Vite SPA, Next.js, plain React).
The target is always the **strider SSR template**. Work in slices; keep each CI-green.

### Phase A — Assess the source
- Inventory: routes/pages, the data it renders, where that data comes from (API at runtime? build-time files? a DB snapshot?), client-only widgets (canvas/WebGL/maps), auth, and any server endpoints.
- Decide the **content model**: astra frontends are **build-time content → generated TS modules → route loaders**. Runtime data fetching is the exception, not the default. If the source fetches from an API per request, decide whether it becomes a build-time snapshot (Decision D, e.g. akasha-fe) or a `createServerFn` call.
- Map identity keys you must preserve verbatim.

### Phase B — Scaffold the shell (copy strider)
Follow `apps/strider/README.md`. Copy the shell files (`server.ts`, `vite.config.ts`,
`vitest.config.ts`, `tsconfig.json`, `Dockerfile`, `scripts/`, `src/router.tsx`,
`src/observe/`, generic `src/components/` + `src/lib/`, `src/styles/`). Depend on
`@astra/site-kit`, `@astra/content-build`, `@astra/gothic`, `@astra/observe`,
`@astra/config` (`workspace:*`). Delete `src/domain/` + `content/*`; you'll add your own.

The reusable spine is already in libs — **don't re-copy it**:
- `@astra/site-kit` — `createSsrServer`, `startRum` (`/web`), `contentWatchPlugin`/`gothicFontsPlugin`, `generateRouteTree`, `loadSiteConfig`.
- `@astra/content-build` — `markdownToHtml`, `parseFrontmatter`, `emitModule`, `defineContentSource`/`buildContent`.

### Phase C — Port the domain
- Recreate `src/domain/` (lib + components) and `content/`. Lift the source app's rendering logic; relocate, don't rewrite.
- Register content sources in `scripts/build-content.ts` via `@astra/content-build`; emit generated modules into `src/generated/` (gitignored, regenerated; the runtime imports them, never the filesystem).
- Wire routes in `src/routes/` (thin files; the route *bodies* import domain — they're the wiring seam, edited per app).

### Phase D — Config (single source)
- Add an `<app> { service-name; port }` namespace (plus any app config) to `ontology/ontology-config/config.kdl`.
- **Mirror it in both** `libs/ts/config` (Zod) **and** `libs/py/config` (Pydantic) schemas — even if only one lane reads it (the config tests snapshot the real `config.kdl` in both languages).
- `server.ts` reads `loadConfig().<app>`; `vite.config.ts` reads `loadSiteConfig().<app>` (the node-safe locator). RUM service name derives as `${serviceName}-rum`.

### Phase E — Telemetry
- Server-side: `createSsrServer({ serviceName, port, ssr, clientDir })` wires OTel + a span per SSR request + SIGTERM/SIGINT flush. Nothing else to do.
- Browser RUM: keep the tiny `src/observe/rumConfig.ts` `createServerFn` (returns `{ endpoint, serviceName }` from config) and the `src/observe/rum.ts` caller of `@astra/site-kit/web`'s `startRum`. `__root` dynamic-imports it behind a mount guard.

### Phase F — Deploy
- **Dockerfile** (templated, `ARG APP`): the build stage must COPY **all** app manifests (the frozen lockfile resolves the full workspace) **and** `ontology/ontology-config` (vite.config reads `config.kdl` at build). The runtime stage COPYs `dist`, `content`, `src/generated`, `server.ts`, `package.json`, `node_modules`, `libs/ts`, and `ontology/ontology-config`.
- **Compose** service: `build.args.APP: <app>`, **no `PORT` env** (config-sourced), map the published host port (10350–10399 band), healthcheck, `restart: unless-stopped`.
- **Caddy** block in `sites.caddyfile`: `import astra_site` + `reverse_proxy`. Fonts self-serve from the container (no `gothic_fonts` import). Gate editor/admin paths `local_only` if applicable.
- Add the app to `pyproject.toml` `[tool.uv.workspace] exclude`.

### Phase G — CI + verify
- Reproduce both lanes locally (§7).
- Live-verify (deploy is user-triggered/outward-facing): `just up` (or targeted `docker compose up -d --build <app>`) + `just caddy-reload`, then curl `/`, the fonts path, any gated route, and confirm a `service.name=<app>` SSR span lands via the `signoz_*` MCP.

---

## 4. Framework translation cheat-sheet

| Source pattern | astra (TanStack Start SSR) equivalent |
|---|---|
| CRA / Vite SPA, client-only render | SSR by default (no `prerender`); client-only widgets behind `lazy()` + `<ClientOnly>` |
| Next.js `getServerSideProps` / route `loader` | TanStack route `loader` (build-time content is preferred over per-request fetch) |
| Next.js API route / Express endpoint | `createServerFn` **in app source** (this stack — pinned 1.168 — has no file server-routes; no middleware) |
| `process.env.X` runtime config | `config.kdl` namespace via `@astra/config`; secrets via `ref="sops:..."` |
| `next/image`, static `public/` | keep a `public/` (favicon, symbols); gothic owns webfonts (self-served from `dist/client/fonts`) |
| Tailwind via PostCSS | `@tailwindcss/vite` plugin in `vite.config.ts` (gothic's `@theme`/`@apply` need it or styling ships raw) |
| CSS-in-JS / global CSS | gothic design system + CSS modules; gothic v4 `--color-*` tokens |
| Per-request API data | build-time snapshot (Decision D) **or** a `createServerFn` |
| `Dockerfile` per app, ad-hoc | the templated `ARG APP` Dockerfile; Compose service; Caddy edge |
| Prometheus/StatsD/console logging | `@astra/observe` → SigNoz (OTel traces+metrics+logs) + browser RUM |

For **non-frontend** apps (a service or pipeline step): skip the strider template; still
apply §1 (telemetry, config, KDL/SOPS, LLM-through-libs, runtime split) and §7 (CI). A
pipeline step becomes a Dagster asset; a long-running service becomes a Compose unit.

---

## 5. Detailed dos & don'ts by area

### Config (`config-single-source`)
- **DO** keep `config.kdl` the single source; read via `astra_config`/`@astra/config`; mirror new namespaces in both schemas.
- **DO** use `.strict()` / `extra="forbid"` defaults; a mistyped KDL key should throw, not be silently dropped.
- **DON'T** read env vars (the only env override is secret resolution — `KEY.upper()`); **DON'T** hardcode a port/endpoint/name anywhere but `config.kdl` (beyond the one Dockerfile `ARG APP`).
- **Gotcha:** `vite.config.ts` can't call no-arg `loadConfig()` (it resolves the repo root via Bun-only `import.meta.dir`); use `@astra/site-kit`'s `loadSiteConfig()` (walks from `process.cwd()`).

### Telemetry (`telemetry-built-in`)
- **DO** call `init*Telemetry` in the actual runtime entrypoint; **DO** name the service `astra.<subsystem>`.
- **DON'T** set a containerized service's `otlp-endpoint` to `localhost:NNNN` — inside a container localhost is the container. Use the in-cluster collector name (`http://signoz-otel-collector:4318`). The browser `rum-endpoint` is the *public* Caddy URL (browsers can't reach the in-cluster name).
- **Verify** with the `signoz_*` MCP (not curl/clickhouse), and check `signoz_list_services` shows your `service.name`.

### TypeScript / bun / frontend
- **DO** set `--configLoader runner` on vite `dev`/`build` if `vite.config.ts` imports a workspace TS package (`@astra/site-kit`) — vite's default loader Node-externalizes workspace packages and the vite bin runs under Node, which can't execute their raw `.ts`.
- **DO** keep `createServerFn` in app source; commit `src/routeTree.gen.ts` (biome-ignored); wire `@tailwindcss/vite`; ship `public/`.
- **DO** override `verbatimModuleSyntax: false` in the *frontend* tsconfig only (server bundles otherwise leak typing into the client); leave the base setting for non-Start packages.
- **DON'T** prerender; **DON'T** vendor fonts; **DON'T** ship a TS lib with zero tests.
- **Gotcha:** a path-scoped `biome.json` override is keyed on exact paths — **update its globs when you move files**, or relocated files re-expose suppressed lints. Run `bunx biome ci .` on the **whole repo** (a scoped run misses violations the full run flags).

### Python / uv
- **DO** add a new TS app to `[tool.uv.workspace] exclude`; create a member dir only when it has a manifest (uv rejects empty glob-matched dirs).
- **DON'T** `from __future__ import annotations` in Dagster asset modules (Dagster needs real annotations).
- Keep tests hermetic (no ffmpeg / live keys / SOPS in CI) — inject seams; `skipif` the SOPS-decrypt tests.

### Deploy (`deploy-apply-with-just`)
- **DO** COPY all app manifests in each service Dockerfile (frozen lockfile resolves the full workspace) and `ontology/ontology-config` in both build + runtime stages for frontends.
- **DO** apply changes with `just up` + `just caddy-reload`, then verify — local edits aren't live until then. Public DNS records are a manual, outward-facing step (defer unless told to proceed).
- **DON'T** add a `PORT` env to the Compose service (config-sourced).

### Process / version control
- **DO** commit each CI-green slice (Conventional Commits) and push on chunk completion; **DO** reproduce CI locally first and confirm push + one status check.
- **DON'T** accumulate a large uncommitted tree; **DON'T** watch the GHA run; **DON'T** silently shrink scope.

---

## 6. Frontend-specific load-bearing gotchas (the ones that cost time)

1. **`--configLoader runner`** is mandatory to import `@astra/site-kit` from `vite.config.ts` (see §5). This is the real mechanism behind "vite.config can't import @astra/config."
2. **Adding a workspace member re-runs `bun install`**, which regenerates `bun.lock` *and can bump tools within semver* (biome `2.x`→`2.5.0` once happened, and it's stricter). Reproduce CI exactly: `bunx biome ci .` over the whole repo.
3. **A new workspace member breaks `--frozen-lockfile`** in any Dockerfile that copies a partial manifest set — the root `apps/*`/`libs/ts/*` globs resolve the *full* workspace, so a partial set reads as "lockfile changed." COPY all app manifests.
4. **Fonts self-serve**: `gothicFontsPlugin({ clientOutDir })` copies gothic fonts into `dist/client/fonts` at build; the SSR server static-serves them; the Caddy block has no `gothic_fonts` import and nothing is vendored in git.
5. **Pixi/WebGL** behind `lazy()` + `<ClientOnly>`; editor/admin routes `ssr: false`. Canvas has no unit test — eyeball the dev app after any renderer change.
6. **Coupled content sources** (one source needs another's output) run in declaration order via a shared closure — not the clean independent-source model; document it.
7. **The build stage needs `config.kdl`** (vite.config reads it at build) — COPY `ontology/ontology-config` before `bun run build`.

(See `strider-0016-gotchas` and CONTRIBUTING §8 for the full catalog, incl. Python/Dagster/SigNoz items.)

---

## 7. Reproduce CI locally (before every push)

```bash
# Python lane
uv run ruff check && uv run ruff format --check && uv run ty check && uv run pytest
# TypeScript lane
bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && bun --filter '*' build
```
Scope to the lane/app you touched, but run `biome ci` over the **whole repo**. The
pre-commit gate (`.githooks/pre-commit`) runs the fast format/lint subset (biome
`--error-on-warnings` + ruff) on commit; typecheck + tests stay CI-only. Watch the
**aggregate exit code**, not just the per-package "Exited with code 0" lines.

---

## 8. Definition of done (acceptance checklist)

- [ ] Behaviour ported from the source (identity keys verbatim); no silent scope cuts.
- [ ] All config in `config.kdl`, read via `astra_config`/`@astra/config`, mirrored in both schemas; secrets are `ref="sops:…"`.
- [ ] Telemetry wired in the runtime; `service.name=astra.<app>` spans land in SigNoz (verified via MCP); browser RUM posts to the public endpoint.
- [ ] Both CI lanes green locally; every new TS package has ≥1 test; biome clean on the whole repo.
- [ ] (Frontend) SSR — no prerender; `routeTree.gen.ts` committed; `@tailwindcss/vite` wired; `public/` shipped; fonts self-serve; pixi behind `lazy()`+`<ClientOnly>`; consumes `@astra/site-kit` + `@astra/content-build`; thin `server.ts`/`vite.config.ts`.
- [ ] Deploy wired: templated Dockerfile (all manifests + `ontology/`), Compose unit (no PORT env), Caddy block; app added to uv `exclude`.
- [ ] Live-verified after deploy (`just up` + `just caddy-reload` + curl + a SigNoz span); outward-facing DNS deferred unless told otherwise.
- [ ] Memory updated with the load-bearing gotchas; RESUME current-state updated; committed per-slice and pushed.

---

*Maintained alongside `apps/strider/README.md` (the concrete recipe) and the memories.
If a migration teaches a new gotcha, add it to `strider-0016-gotchas` (or the app's own
memory) and, if broadly applicable, here.*
