# 0029 — codex P5: deploy — spec

**Status:** FINAL (2026-07-15) — authored by the staff-orchestrator over two same-day research
passes (deploy-pattern survey of the sibling frontends + a codex-side deploy-surface audit, both
verified against the real repo/disk); **adversarially reviewed same day: 0 blockers, 1 minor
(D29-55 enumeration missing `build:`/`command:`) + 1 nit (fixture size 2.1 MB not 2.8) + 1 bonus
stale-README find (`README.md:344`'s "307" claim) — all folded in.** The review also positively
verified the load-bearing mechanics: `robots.txt` via `public/`→`dist/client`→clientDir fallback
(general mechanism, favicon-proven); identical-path bind mounts (scribe Dagster-volume precedent,
live-tested); the corpusFs cache inventory matches D29-57's restart rationale exactly (listing/
tree/sources caches are forever-per-process, `entity()` uncached); gate C is genuinely
curl-verifiable (`/spell` SSRs all 2,604 rows, no client fetch); gate F's move-aside drill is
inode-safe (the mount source is `data/search`, the move happens inside it); no port collision,
no CI-filter ripple (blanket `apps/**`), no Caddy header/shadowing conflicts.
**Scope basis:** the 0029 umbrella scope doc
`thoughts/shared/research/2026-07-12-codex-0029-thoughts.md` — C-1 (public, personal-use,
**noindex**), C-6 (gitignored corpus, host image bind-mounts/COPYs it — resolved to bind-mount
here, D29-53), C-7 (refresh on-demand via `just codex-refresh`, never scheduled), C-8 (no auth
gate; standard `astra_site` Caddy block). Its §Risks already leaned bind-mount ("prefer the
artifacts/ bind-mount pattern… Spec pins this (D-candidate)") — pinned here with the real numbers.
**Prerequisite/gate context:** P4.5 BUILT (`157f10b`), A–G met. **Acceptance H (the consolidated
stakeholder review of P2+P3+P4+P4.5) FOLDS INTO THIS PHASE'S EXIT GATE** — stakeholder-resolved
2026-07-15: one review on the live `codex.iridi.cc`, not a separate local pass (D29-58).
**Prior specs:** P1 `0029-codex-p1-ingest-spec.md` (D29-1..21) · P2
`0029-codex-p2-entity-pages-spec.md` (D29-22..31 — its §risks explicitly assigns THIS phase the
real-corpus live-gate obligation: *"P5's live gate must assert a REAL-corpus marker (the dragon
page), not just 200s"*) · P3 `0029-codex-p3-browse-search-spec.md` (D29-32..38) · P4
`0029-codex-p4-rules-browser-spec.md` (D29-39..45) · P4.5 `0029-codex-p45-ux-restyle-spec.md`
(D29-46..52).
**Phase context:** P5 of 5, size S — the smallest 0029 phase. Zero product-surface change; the
app is done. This phase puts it on the internet: image + compose unit + edge + the noindex
completion + the refresh-in-prod story + the consolidated live gate.

## 1. Overview

Deploy `apps/codex` as an SSR Compose service behind Caddy at **`codex.iridi.cc`** (port 10374),
per roadmap Decision I. Codex deploys on the **heartwood-frontend model, not akasha's**: nothing
content-shaped is baked into the image — the ~891 MB of runtime data (corpus + Pagefind bundle)
arrives via read-only bind mounts, and the image is a minimal ~3 MB-dist SSR server.

**Verified against the real repo/disk while authoring this spec (do not re-derive):**

- **The build is corpus-free by design.** `apps/codex/vite.config.ts:18-26` (D29-31): no
  `contentWatchPlugin`, no build-time content step, no `src/generated/` — routes read the corpus
  from disk at REQUEST time via `src/server/corpusFs.ts`. `pnpm build` output = `dist/` **3.3 MB**
  (client hashed assets incl. 45 self-hosted `.woff2` + `dist/server/server.js`). Consequence:
  `docker build` needs config.kdl + app source only, never the corpus.
- **Runtime data footprint (measured 2026-07-15):** `data/corpus/` **688 MB** (88 categories,
  46,192 entities per `manifest.json` categoryCounts) · `data/search/pagefind/` **203 MB**
  (fragment/ 184 MB = 46,192 files 1:1 with entities, index/ 18 MB, filter/ 668 KB — a fresh,
  correctly-built index, not writeFiles accumulation; `build-search.ts:26` rm-rfs first) ·
  `data/snapshots/` 601 MB **runtime-unreferenced** (grep-verified: nothing under `src/server/`
  or `server.ts` touches it — ingest input only) · `fixtures/entities/` 2.1 MB (198 files),
  committed.
  **Doc correction this phase must land:** README + memory claim the Pagefind bundle is
  "~50–55 MB" — the real number is **203 MB**; P5's sizing statements use the measured values.
- **Two distinct runtime read paths.** (1) The Pagefind bundle: `server.ts:34-40` registers the
  ONE staticMount `{urlPrefix: "/pagefind/", dir: `${dataPath}/search/pagefind`}` —
  Range/206-capable via site-kit's `send`-based `serveFile` (`libs/ts/site-kit/src/ssrServer.ts:107-117`),
  fail-soft per-request (404s until the dir exists; a fresh index comes online with **no
  restart**). (2) The corpus: plain `node:fs` reads in `corpusFs.ts` server fns — NOT a
  staticMount; its freshness story is per-process category caching (see D29-57).
- **`config.kdl` `codex.data-path` is a host-absolute path used verbatim at request time**
  (`ontology/ontology-config/config.kdl:301-313`:
  `data-path "/ruby/data/experiments/astra/apps/codex/data"`; consumed at `corpusFs.ts:255-266`
  and `server.ts:32`). Plain config fields have **no env-override mechanism** (the
  `KEY.toUpperCase()` override in `libs/ts/config/src/secrets.ts:60` applies only to SOPS `ref=`
  secrets — the 0027 lesson) and config-single-source forbids a per-environment fork. Every
  sibling frontend instead uses a short in-container path (akasha `audio-dir "/audio"`,
  `config.kdl:170`) — but repointing codex's `data-path` to a short path would break **host-side
  real-corpus serving** (`pnpm build && pnpm start`, exactly how local acceptance runs). The
  repo already has a third convention for this: the Dagster pipeline volumes
  (`deploy/docker-compose.yml:34-47`) bind-mount host-absolute paths onto the **identical
  container-absolute path**. → D29-53.
- **Corpus fail-soft:** `corpusFs.ts` `resolveCorpusRoot()` falls back to the committed 2.1 MB
  fixture corpus with a loud `console.warn` when `<dataPath>/corpus/manifest.json` is absent —
  so a mis-mounted deploy serves a small working fixture site, **not** an error page. This is
  why the live gate MUST assert a real-corpus marker (P2 spec obligation), and why the runtime
  image must carry `fixtures/entities/` (the `findAppRoot()` marker-walk at `corpusFs.ts:229-237`
  targets `fixtures/entities/manifest.json`).
- **The sibling Dockerfile manifest ripple is ALREADY DONE.** All 13 existing app Dockerfiles
  already `COPY apps/codex/package.json` (added opportunistically at P1) — vs ledger 0018's
  12-file ripple, codex's net-new file set is exactly three: `apps/codex/Dockerfile`, a
  `deploy/docker-compose.yml` service block, a `sites.caddyfile` stanza.
- **Root `.dockerignore` does NOT exclude `apps/codex/data`** (checked this session — it excludes
  `.git`/`node_modules`/`dist` etc. only). All frontends build with context `..`, so ~1.5 GB of
  codex data sits in every sibling's build context today; BuildKit's lazy context transfer is why
  nobody noticed. Fix in S1 (also add `artifacts/`, same class of miss).
- **Telemetry is deploy-ready with zero changes.** `initTelemetry` runs inside `createSsrServer`
  (`ssrServer.ts:88-93`, try/catch-guarded, first-call-wins satisfied), service `astra.codex`
  from config; the OTLP endpoint **defaults to the in-cluster
  `http://signoz-otel-collector:4318`** (`libs/ts/config/src/config.ts:284`) — correct once
  containerized on `signoz-net`, same as every sibling. Client RUM: `src/observe/rumConfig.ts`
  serves `telemetry.rumEndpoint` + `astra.codex-rum`.
- **Noindex today = meta tag only.** `src/routes/__root.tsx:37` ships
  `<meta name="robots" content="noindex">` unconditionally (D29-30), with the code comment
  explicitly deferring "the Caddy `X-Robots-Tag` + robots.txt" to P5. **No `X-Robots-Tag` and no
  `robots.txt` exist anywhere in the repo** — both are net-new patterns this phase introduces.
  Ledger's generated `sites.ts` has no codex entry (checked) — C-1's "off the landing grid"
  holds by inaction; the gate asserts it stays that way.
- **No SOPS/secrets involvement:** the codex config block has no `ref=` fields; no
  `environment:` entries needed on the compose unit; `just up` needs no secret additions.
- **Edge mechanics:** `sites.caddyfile:14-31` `(astra_site)` snippet (Cloudflare ACME-DNS,
  zstd/gzip, security headers); per-host stanza = `import astra_site` + `reverse_proxy
  localhost:<port>` (akasha `:66-69`, ledger `:104-107`). `*.iridi.cc` wildcard DNS means **no
  DNS record needed** and the cert mints on first hit (~20–60 s TLS flap — ledger/heartwood
  precedent). `just caddy-reload` (`justfile:502-507`) decrypts the CF token from SOPS at
  adapt-time and reloads the shared parent proxy.
- **Refresh recipes exist and are host-only** (`justfile:466-498`): `codex-refresh`
  (dirty-tree-guarded, fetch ×2 → transform → `codex-search-index`; "not cheap, don't run
  casually") and `codex-search-index` (Pagefind ~3.8 GB RSS — **never** CI/Docker/`vite build`).
  Neither knows about a running container yet → D29-57.
- **Memory correction (record at save):** the `?legacy=` alias is a pure client-side decode
  (`src/domain/browse/urlState.ts:23-27,60-62`) — **no HTTP 307 exists anywhere in codex**; the
  RESUME/memory "307 canonicalization hop" phrasing is wrong. Old `?legacy=` links simply decode
  as `superseded` and the encoder re-emits the canonical param on the next navigation.

## 2. Locked decisions

Carried unchanged: **C-1** public-but-noindexed, off the ledger grid · **C-6** gitignored corpus,
host-built · **C-7** on-demand refresh, never scheduled · **C-8** no auth gate · **Decision I**
SSR Compose service behind Caddy · **D29-30** meta-noindex + `astra.codex` telemetry ·
**D29-31** request-time corpus reads · the deploy-artifacts posture (`user: "1000:1000"`,
bind-mounts over named volumes) · [[no-ci-monitoring]] + [[deploy-apply-with-just]] +
[[flag-paid-live-actions]] working rules.

Continuing the ledger from P4.5's D29-52:

- **D29-53 — Corpus delivery = identical-path read-only bind mounts (no COPY, no config
  change).** The compose unit mounts exactly two narrow dirs, host path == container path:
  - `/ruby/data/experiments/astra/apps/codex/data/corpus` → same path, `:ro`
  - `/ruby/data/experiments/astra/apps/codex/data/search` → same path, `:ro`
  Rationale: (a) `data-path` is consumed verbatim in dev and prod and plain fields have no
  override — identical-path is the only mechanism that satisfies config-single-source without
  breaking host-side real-corpus serving; it's the established Dagster pipeline-volume
  convention, now applied to a frontend for the first time. (b) COPY would bake 891 MB into an
  image that rebuilds on every refresh — rejected with the real numbers. (c) Narrow mounts
  (not the whole `data/`) keep the 601 MB runtime-unreferenced `snapshots/` + `tmp/` out of the
  container entirely (heartwood's narrow-mount precedent). (d) `:ro` because codex is a pure
  read surface; host-side refresh writes propagate through the mount regardless.
  **No `artifacts-init` change and no seed recipe** — both dirs already exist, produced by
  `codex-refresh` at a stable host path outside `artifacts/`. Fresh-host caveat recorded in §6
  (Docker auto-creates missing bind sources as root).
- **D29-54 — Image = the heartwood-minimal Dockerfile shape.** `apps/codex/Dockerfile`, two-stage
  `node:24-slim`, `ARG APP=codex`, the standard 17-manifest COPY list + `pnpm install
  --frozen-lockfile`, `COPY ontology/ontology-config` in BOTH stages (vite.config reads config at
  build time; server.ts at runtime), **no content-input COPY of any kind**, and the runtime stage
  MUST carry `apps/codex/fixtures/` (the fail-soft target) + `dist/` + `server.ts` + the libs
  site-kit runtime needs. CMD = the shared
  `["node", "--import", "../../libs/ts/site-kit/src/nodeTsResolve.mjs", "server.ts"]`. No `USER`
  directive (compose's `user:` governs, sibling posture). **Also in this slice:** root
  `.dockerignore` gains `apps/codex/data` and `artifacts` (build-context hygiene, see §1).
  Zero sibling Dockerfile edits (ripple pre-done).
- **D29-55 — Compose unit.** Service key `codex`, image `astra-codex:local`, container
  `astra-codex` — **copy the akasha-frontend block verbatim**
  (`deploy/docker-compose.yml:236-262`) changing only the codex-specific fields: `build:`
  (`context: ..`, `dockerfile: apps/codex/Dockerfile`, `args: {APP: codex}`) · the explicit
  `command:` override repeating the Dockerfile CMD (every sibling does) · `user: "1000:1000"` ·
  `ports: ["10374:10374"]` · the two D29-53 volumes · `networks: [signoz-net]` · the standard
  node-fetch healthcheck against `http://localhost:10374/` (15 s/5 s/5) · `restart:
  unless-stopped` · **no `environment:`** (no secrets; OTLP endpoint comes from config's
  in-cluster default).
- **D29-56 — Noindex completion (C-1's three layers, two net-new).** (1) `apps/codex/public/
  robots.txt` = `User-agent: *` / `Disallow: /` — lands in `dist/client` and serves at
  `/robots.txt` through the existing clientDir static path. (2) The `codex.iridi.cc` stanza sets
  `header X-Robots-Tag noindex` (value matches the meta tag exactly). (3) The meta tag already
  ships (D29-30). No sitemap, ever. Codex stays OFF ledger's grid (assert-only, no ledger
  change). Stanza shape otherwise identical to ledger's: `import astra_site` + `reverse_proxy
  localhost:10374`.
- **D29-57 — Refresh-in-prod = refresh, then restart the container.** `just codex-refresh` gains
  a final step: if the `astra-codex` container is running, `docker compose restart codex`
  (docker-as-root, from `deploy/`). Rationale: `corpusFs.ts` caches per category per-process, so
  a host-side refresh under a live container yields a mixed-corpus window (stale cached
  categories + fresh disk reads) — a restart is the cheap, deterministic flush. The Pagefind
  staticMount needs no restart (per-request fail-soft) but rides along harmlessly. The
  during-transform torn-read window is accepted (§6) — refresh is deliberate, rare, and
  dirty-tree-guarded. `codex-search-index` alone stays restart-free (index swap is atomic-enough
  via rm-rf + rewrite and served per-request).
- **D29-58 — Exit gate = technical gate A–G + acceptance H folded in
  (stakeholder-resolved 2026-07-15).** H = the consolidated review of P2+P3+P4+P4.5 run against
  the LIVE `codex.iridi.cc`: the P2 spot-set (`creature/red-dragon-adult`, a carve-out creature,
  `spell/heal@legacy`→now `?superseded=1`, `class/summoner`, `rules/counteracting`,
  `creature/ixamè`, `ancestry/index`, `warfare-army/tiger-lord-berserkers`; **M7
  links-not-inlined + M11 statblock-twice are EXPECTED**) + P3 search (the single-common-word
  "heal" ranking limitation is documented+accepted) + P4 tree/sidebars/sources + the five P4.5
  items in the new skin. FYI for the review (not a re-decision): old `?legacy=` links decode
  client-side to `superseded` (no redirect happens — §1 correction). The C-critical check: the
  gate proves the REAL corpus is being served (the dragon page + a full-scale listing count),
  never satisfied by fixture-fallback 200s.

## 3. Deliverables (by component)

| Component | Change |
|---|---|
| `.dockerignore` (root) | + `apps/codex/data`, + `artifacts` |
| `apps/codex/Dockerfile` | NEW — heartwood-minimal shape (D29-54) |
| `apps/codex/public/robots.txt` | NEW — Disallow all (D29-56) |
| `deploy/docker-compose.yml` | + `codex` service block (D29-55) |
| `sites.caddyfile` | + `codex.iridi.cc` stanza incl. `X-Robots-Tag` (D29-56) |
| `justfile` | `codex-refresh` gains the conditional container-restart tail (D29-57) |
| `apps/codex/README.md` | + Deploy section; **correct the stale "~50–55 MB" Pagefind figure (`README.md:122`) to the measured 203 MB, and the stale "pre-existing 307" claim (`README.md:344`) — no redirect exists, the alias decodes client-side** |
| config.kdl / schemas | **NO CHANGE** (D29-53 keeps `data-path` as-is; `public-origin` already set) |
| sibling Dockerfiles | **NO CHANGE** (ripple pre-done) |
| `thoughts/shared/memory/` | at save: P5 section + the two corrections (Pagefind 203 MB; no-307) |

## 4. Slices (each CI-green, committed, conventional)

- **S1 — image + unit + noindex artifacts (no live effect).** `.dockerignore` lines ·
  `apps/codex/Dockerfile` · compose block · `robots.txt` · the `codex-refresh` restart tail ·
  README deploy section + size correction. Local proof, no deploy: `docker build` succeeds
  (corpus absent from context by construction), the built image serves the FIXTURE corpus when
  run without mounts (fail-soft proof), and serves the REAL corpus with the two D29-53 mounts
  attached (dragon-page curl). Reproduce both CI lanes locally; commit
  `feat(codex): 0029 P5 S1 — …`.
- **S2 — edge + go-live + gate A–G.** `sites.caddyfile` stanza → **flag at execution** (live
  action, [[flag-paid-live-actions]]): `just up` (builds+starts the codex unit) + `just
  caddy-reload` → run the full §5 A–G sweep with recorded evidence → commit
  `feat(codex): 0029 P5 S2 — …` + push. Then hand to the stakeholder for H (D29-58); spec →
  BUILT on A–G, → COMPLETE on H sign-off.

## 5. Acceptance criteria (P5 exit gate)

- **A — corpus-free image.** `docker build` succeeds with `apps/codex/data` excluded from the
  context (by `.dockerignore`); image carries `dist/` + `fixtures/entities/`; no corpus bytes in
  any layer.
- **B — unit health.** Container runs as `1000:1000`, healthcheck green, `restart:
  unless-stopped`, on `signoz-net`; both mounts visible read-only in `docker inspect`.
- **C — REAL corpus through the public edge** (the P2-mandated check). Via `https://codex.iridi.cc`:
  `creature/red-dragon-adult` SSR HTML contains a dragon-specific marker (`grep -a`, [[harrow
  precedent]]); a full-scale listing count matches the real corpus (e.g. `/spell` = 2,604 rows,
  the P4.5 figure), which the 2.1 MB fixture cannot satisfy; **no fixture-fallback `console.warn`
  in the container logs**.
- **D — search live.** `/pagefind/*` serves 200 through the edge (Range/206 honored on a
  fragment); an Omnibar query on the live site returns results.
- **E — noindex, all three layers.** `curl -I` shows `X-Robots-Tag: noindex`; `/robots.txt`
  serves the Disallow-all body; SSR HTML carries the meta tag; ledger's live grid does NOT list
  codex.
- **F — refresh + fail-soft drill (no full refresh run — sanctioned: refresh re-downloads
  ~259 MB and is deliberately rare).** Prove the mechanisms instead: (1) the staticMount
  fail-soft — with `data/search/pagefind` temporarily moved aside on the host, `/pagefind/*`
  404s cleanly and recovers on move-back, zero restarts; (2) the D29-57 restart tail executes
  (container restarts, returns healthy); (3) `codex-refresh`'s dirty-tree guard still refuses on
  a dirty `apps/codex`.
- **G — telemetry.** `astra.codex` SSR spans from edge-driven requests visible in SigNoz (MCP
  tools per [[signoz-mcp]]), zero ERROR logs post-deploy; the TLS-flap window noted, not
  alert-paged (Class-A rule watches `severity_text`, container noise stays below it).
- **H — the consolidated stakeholder review (D29-58)** on live `codex.iridi.cc`. Sign-off closes
  0029's product surface; redirects spawn a follow-up phase, not edits to this spec.

## 6. Risks / adversarial notes

- **Fixture-masking is the #1 gate risk** (a mis-mounted deploy still 200s everywhere) — hence
  C's three-pronged real-corpus assert. Do not weaken it to status-code checks.
- **Docker auto-creates missing bind sources as root** ([[deploy-artifacts-run-as-user]]) — on
  THIS host both mount sources exist; a fresh host must run `codex-refresh` before first `up` or
  the mounts materialize as empty root-owned dirs (and the site serves fixture — caught by C).
- **Torn reads during a live refresh:** transform rewrites corpus files in place while the
  container reads per-request; window is minutes-long, deliberate, personal-use-accepted. The
  D29-57 restart lands AFTER the rewrite completes, flushing caches. If this ever matters,
  the fix is an atomic dir-swap refresh — out of scope now.
- **TLS first-hit flap** ~20–60 s on the new host (wildcard cert mints on demand) — expected,
  don't debug it.
- **BuildKit lazy context** explains why the missing `.dockerignore` entries were symptomless;
  they're still wrong — fix is one line each, but do NOT exclude `pnpm-lock.yaml`/`fixtures`
  (builds need them; the existing file's NB comment already warns about this class).
- **203 MB Pagefind bundle = 46k+ small files on a bind mount** — inode-heavy but local-fs;
  no action. If `/pagefind` latency ever surfaces, it's edge-cacheable (out of scope).
- **The healthcheck hits `/`** (12 KB landing) — cheap, and it exercises SSR + config load, not
  just process-up. Matches siblings.
- **No rollback story needed beyond compose** — `docker compose rm`-ing the unit and deleting
  the stanza fully de-publishes; corpus data is host-side and untouched.

## 7. Out of scope (P5)

Refresh automation/scheduling (C-7 stands) · CUP-posture changes or auth (C-1/C-8 stand) ·
sitemap/SEO of any kind · CDN/edge caching of `/pagefind` · adding codex to ledger's grid ·
mounting `snapshots/` into the container · publishing images to a registry (local compose build,
sibling posture) · atomic dir-swap refresh · any product-surface change (P4.5 residue rides to a
future phase only if H redirects).

## 8. Build record (grows per slice)

_(empty — filled by the build orchestrator per slice with per-gate evidence)_
