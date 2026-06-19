---
date: 2026-06-18
topic: "faerrin → astra: comprehensive migration discovery (research phase)"
status: research-complete (no code written)
researcher: Claude (octo:auto → Discover, team mode — 6 parallel research agents)
related:
  - /ruby/data/experiments/astra/ASTRA.md (target spec)
  - /ruby/data/experiments/faerrin/CLAUDE.md (source repo)
  - thoughts/shared/research/2026-06-03-monorepo-migration-discovery.md (the phase-1 faerrin migration)
next: a phased migration program (top-level roadmap + per-component sub-plans under thoughts/<component>/plans/)
---

# faerrin → astra: Migration Discovery

`astra` (`/ruby/data/experiments/astra`, a fresh empty git repo) is a **re-architecture** of the
`faerrin` monorepo — not a lift-and-shift. It re-cuts faerrin's 13 packages into ~10 named subsystems
(several split in two), introduces 2 net-new subsystems (`ontology`), and layers in **six net-new
cross-cutting standards** (Dagster+Compose, OTel→SigNoz, litellm+dspy, KDL 2.0, uv/bun polyglot,
git+conventional-commits). This document is the grounded foundation for the migration plan.

## How to read this

- §1 is the master map (start here).
- §2 is per-subsystem detail with file:line evidence.
- §3 covers the six net-new standards + recommendations.
- §4 is the recommended repo skeleton; §5 the dependency-ordered bring-up; §6 cross-subsystem contracts.
- §7 is the **decisions ledger** — the handful of genuine forks that gate planning (with recommendations).
- §8 proposes the Phase-2 plan structure; §9 lists risks.

---

## 1. Master mapping: faerrin → astra

| Astra subsystem | Lang (target) | Sourced from (faerrin) | Disposition | Effort |
|---|---|---|---|---|
| `ontology-being` (table META: players → the PCs they play, campaigns, colors, host identities — **NOT** in-world setting characters, which live in akasha) | py/uv | `mouth/players.toml`, `content/scripts/campaigns.yaml`, `content/scripts/lib/roster.ts` (+ scattered colors) | **NET-NEW** (consolidate 3 split sources) | M |
| `ontology-config` (centralized config + secret refs, KDL) | py/uv | all 8 `.env.example` + `sites.caddyfile` token + hardcoded defaults | **NET-NEW** | M |
| `scribe` (Craig audio → timestamped transcript + audio merge) | py/uv | `wretch` (Python whisperx + TS orchestration) | REORG (py lifts; TS reconciler→py) | M |
| `linguist` (transcript fix + downstream formats) | py/uv | `content/scripts` (ingest/export/script/build-transcripts + review/judge) | **REWRITE** (TS→py) | L |
| `akasha-backend` (PF2e setting content store, "vellum format") | py/uv | `content/wiki` (+ transcripts) | **REWRITE + data migration** | XL ⚠ |
| `akasha-frontend` (setting + linguist scripts + weal roll insights) | ts/bun | `aether` (Astro+Solid) | **REWRITE** (→ TanStack/React) | L |
| `weal-bot` (Discord dice/host bot + send API + roll recording) | **? Rust|TS** | `mouth` (Rust + SQLite) | REORG or REWRITE — **decision §7-B** | M–L |
| `weal-overlay` (OBS dice overlay) | ts/bun | `eerie` (Vite+React+pixi+SSE) | **LIFT** (rename + repoint) | S |
| `gothic` (comprehensive UI framework) | ts/bun | `gothic` (pure-CSS skin) + `vellum/src/render/components` | EXPAND (CSS seed → React lib) | L |
| `vellum-lang` (custom markdown-flavor parser) | ts/bun | `vellum/src/render/{parse,surface,vss,model}.ts` | REORG (extract as pkg) | M |
| `vellum-frontend` (document-forge site + render service) | ts/bun | `vellum` (Vite+React editor + Playwright render) | REORG (Vite→TanStack; render svc lifts) | M |
| `mouthpiece-backend` (roundtable script → TTS audio) | py/uv | `caster` (Bun TTS+LLM pipeline) | **REWRITE** (Bun→py / Dagster) | L |
| `mouthpiece-frontend` (podcast site) | ts/bun | `face` (Astro+Solid) | **REWRITE** (→ TanStack/React) | M |
| `orator-backend` (music bot + tag/upload web UI) | ts/bun | `lark` (Bun bot + Vite/React + SQLite) | LIFT (bot/server) + REWRITE (SPA→TanStack) | M |
| `orator-controller` (Stream Deck plugin) | ts/node | `birdfeed` (+ `lark`'s key-mgmt routes) | REORG (merge; origin configurable) | S |
| `strider` (hexmap journey site) | ts/bun | `strider` (TanStack Start + React) | **REORG** (already on-stack; new data model) | M |
| — *retired* — | — | `llm` (@faerrin Anthropic client) | **REPLACED** by litellm+dspy | — |
| — *shared libs (net-new)* — | py + ts | — | `libs/{py,ts}/observe`, `libs/py/llm`, `libs/{py,ts}/config` | M |

**LOC reality (anchoring survey):** authored code is modest — aether 8.5k, lark 7.2k, vellum 6.3k, mouth
4.3k (Rust), caster ~3k (excl. test .wav), face 2.3k, birdfeed 1.6k, eerie 1.2k, llm 424, gothic 182.
The weight is **data**, not code: `content/` is 37 M wiki + 9.4 M transcripts + 73 M script-context;
`wretch/` shows 15.5k Python files but that's **vendored whisperx/models** (reinstall via uv — do *not*
migrate). **Implication: this migration is dominated by data/format re-modeling and re-architecture, not
by porting large codebases.** The two hardest items (akasha-backend, gothic-as-framework) are the ones
with the least existing code.

---

## 2. Per-subsystem findings (evidence)

### 2.1 scribe ← wretch
Pipeline (TS orchestration `wretch/src/process.ts`, pure-Python transcription `wretch/python/transcribe.py`):
**zip detect** (`process.ts:27-53`, Craig stem `<guild>_<channel>_<date>_<id>`) → **integrity gate**
(`unzip -t`, FUSE-safe, `:58`) → **extract + track filter** (keep `.aac` whose stem is a known Discord ID,
`:62-68`) → **audio merge** (`ffmpeg amix`, `audio.ts:28-31`) → **whisperx** (`large-v3`, int8, word-align,
per-track `.json`, model-load `@run_once`, `python/models.py:32-38`) → **time-merge** (`SoundStack.drain()`
pops globally-earliest start, `soundStack.ts`) → **`data/saved/{date}/script.json`** (array of
`{start,end,text,words,user}`; `user` is raw Discord ID here). Python deps: `whisperx>=3.3.4`, pydub,
loguru. **Disposition:** `transcribe.py`/`models.py` LIFT into uv; the TS reconciler (level-triggered,
disk-as-ledger) REWRITE to Python as Dagster partitioned assets. The disk-ledger/resume discipline is load-bearing
(multi-hour sessions) and must survive into the asset-materialization model. ⚠ whisperx output is
non-deterministic across versions — **do not re-transcribe the 76 canonical historical sessions.**
**DECIDED (G):** go-forward transcription = Groq hosted `whisper-large-v3` (API; per-track + local
VAD-trim; no GPU worker / no local model); historical sessions imported verbatim.

### 2.2 linguist ← content/scripts
TS pipeline (`bunx tsx scripts/run.ts`), four LLM-free stages + a separate LLM "review/judge":
1. **ingest** (`pipeline/ingest.ts`) — read wretch `script.json` (or remote API), apply `defs.yaml` regex
   corrections, resolve Discord-ID → `{name,color}` via `lib/roster.ts`, seconds→`HH:MM:SS`. Emits
   `scripts/data/{date}.json`.
2. **export** (`pipeline/export.ts`) — wipe+regen `wiki/Script/`, build wikilink auto-linker corpus from
   `wiki/` (excl. `Script/`, `Timeline.md`), match session→campaign by keyword score
   (`lib/campaigns.ts`, threshold ≥15), emit directive-markdown `wiki/Script/{Campaign}/{date}.md`.
3. **script** (`pipeline/script.ts`) — emit per-session `.txt` LLM-context for caster
   (`scripts/script/{arc}.{slug}.{date}.txt`).
4. **build-transcripts** (`build-transcripts.ts`) — emit canonical `transcripts/{same}.txt` as
   `{NNNNNN}\t{Character}: {text}` (6-digit per-file line IDs from `000001`).
   Real sample (`transcripts/000.through-a-song-darkly.2026-6-1.txt`): `000001\tBenny: now recording…`.
5. **review/judge** (`scripts/surface/judge.ts` via `lib/llm.ts`) — two-model haiku→sonnet judge proposes
   `defs.yaml` corrections. **Only LLM user in content.**

**Disposition:** REWRITE TS→Python. `defs.yaml` LIFT. The `export` step's wiki-page generation is really a
*rendering* concern → belongs with akasha-frontend, not linguist. The `.txt`/transcript outputs become
linguist's artifacts consumed by mouthpiece + akasha-frontend.

### 2.3 akasha-backend ← content/wiki ⚠ (the hard one)
Obsidian vault (~100+ pages, 37 M) with **four inconsistent page types**: (a) prose + YAML frontmatter
(`title/tags/aliases/img`); (b) **deity stat-blocks** using an informal `**Field** :: value <br />`
convention (NOT machine-parsed today — rendered as plain markdown, e.g. `wiki/Divinity/Outer Gods/Heir of
the Plague.md`); (c) **`Timeline.md`** = raw `<ul><li style=…>` HTML, explicitly excluded from the
pipeline (`lib/content.ts:21`); (d) **`Script/`** = generated `:::transcript-line{…}` directive markdown.
aether reads the vault via an Astro glob collection `base:"../content/wiki"` (`content.config.ts:23-38`);
backlinks/folder-index/breadcrumbs are computed at build time (`aether/src/lib/site.ts`).

⚠ **"store content in vellum format" is the single biggest ambiguity.** The *current* `vellum-lang`
(§2.9) targets PF2e **statblocks/handouts**, not general wiki prose/timeline/biography pages. So either
(i) vellum-lang must be **substantially expanded** to be akasha's general content format, or (ii) wiki
prose stays its own markdown and only statblock-like content is "vellum format." This blocks all wiki
migration until resolved (**decision §7-C**). Also unspecified: how `akasha-frontend` *consumes*
akasha-backend (build-time filesystem snapshot? HTTP API? KDL index?) — **decision §7-D**.

### 2.4 akasha-frontend ← aether (REWRITE: Astro+Solid → TanStack+React)
Astro 5 SSG MPA; 8 Solid islands (`Darkmode, Explorer, Graph, Popover, ReaderMode, Search,
TranscriptPlayer, DiceDashboard`). Search = `astro-pagefind` over built HTML
(`Search.tsx:35` lazy-imports `/pagefind/pagefind.js`). Slug logic = verbatim Quartz port
(`src/lib/slug.ts`, isomorphic, **carries over unchanged** — the load-bearing URL invariant). Build hardcodes
`publicDir:"./assets"`, `outDir:"./public"`; the 763-file byte-identical rule is a **faerrin live-site
constraint that dissolves in astra** — but **URL slugs must be preserved** to keep inbound links alive.
Hardest Solid→React ports: `Graph.tsx` (pixi+d3 force sim), `TranscriptPlayer.tsx` (progressive-enhancement
DOM attach — inline comment warns against reactive rewrites), `Explorer.tsx` (per-folder signals). Pagefind
re-integration on TanStack is unresolved (run as post-build CLI over prerendered HTML).

### 2.5 weal-bot ← mouth (Rust)
Cargo workspace, 3 crates: `roller` (pure nom Pratt dice DSL + eval, ~1700 lines, well-tested), `chart`
(distribution URLs), `discord` (serenity gateway + axum control-plane + SQLx). Dice detection: every
message → `roller::roll()`; parse/eval failure = silent no-op (`handler.rs:706-713`). **Save guards** for
the 47.16 M-row junk: `MAX_POOL=30`, `MAX_BASE=100` (`handler.rs:442-470`); analytics also exclude
`player_id<>6` (S.C.H.I.S.M., no Discord user). SQLite schema (`migrations/0001_init.sql`): `dice(id, base,
value, source, timestamp, player_id, blame_id)` + index `(base,timestamp)`; `funcs(id,name,payload)` macros.
Identity from `players.toml` (snowflakes→profile). Send API: `POST /api/v1/speak {host,guild,channel,
message,img?}` on `127.0.0.1:10203` (`http.rs`). Roll→overlay POST: best-effort `reqwest` to `FEED_WS_URL`
with `X-Eerie-Token`, v1 payload `{v,user,expression,total,value,is_crit,is_fumble}` (`handler.rs:596-629`).
**Disposition/decision §7-B:** keep Rust (3rd toolchain) vs rewrite TS/Bun (collapse toolchains; roller
port documented "feasible"). `player_id` integers are load-bearing FKs into the dice history — **must be
preserved through any datastore migration.**

### 2.6 weal-overlay ← eerie (LIFT)
Vite+React 19+pixi SPA + a plain `Bun.serve` doing SSE hub + ingest + static. `connectFeed()` EventSource
with OBS-aware reconnect (`feed.ts:19-56`). Schema accepts v0+v1 from the bot (`schema.ts`); eerie does no
dice logic — mirrors `is_crit/is_fumble`. **Lift almost verbatim**: rename, repoint to weal-bot, drop the
v0 shape once weal-bot ships v1 only. Already on astra's exact stack (Vite+React+gothic).

### 2.7 gothic ← gothic (+ vellum components) — EXPAND
Today: 3 CSS files + 5 fonts, **zero React/components**. Tokens: void palette, phosphor-teal `--accent`,
amber `--accent-amber`, parchment/wax/gold-leaf "diegetic substrate", motion easings. Fonts: Caslon
Antique + ITC Serif Gothic via absolute `/fonts/` URLs; IBM Plex Mono referenced but not bundled.
Consumers: strider + vellum. **Gap to "comprehensive UI framework":** needs a React component library
(buttons/cards/panels/typography), layout primitives, token→JS build, and absorption of vellum's render
components (`StatCard, ProseCard, TraitPill, Redaction, ActionGlyph, DocumentView`). The 20 tokens + 3 font
families are the seed; the rest is net-new.

### 2.8 / 2.9 vellum → vellum-frontend + vellum-lang
**vellum-lang** (extract `src/render/{parse,surface,vss,model}.ts` + `MARKDOWN.md` spec): two source-to-source
pre-passes (`compileVss` lowers `@kind "Title" | attr:val {body}` braces; `desugar` rewrites `@2`→`:action`,
`||x||`→`:redact`, `#fire`→`:trait`) → remark(directive+gfm) → `VellumDocument {mode, nodes:
(VellumBlock|VellumProse|VellumColumns)[]}`. Six block kinds (statblock/hazard/item/spell/handout/edict),
3 inline directives. Parser is pure/total (never throws; bad input → `ErrorChip`). ⚠ VSS brace syntax is
**not** portable CommonMark; the `:::` form is. **vellum-frontend**: Vite+React editor (CodeMirror) +
**warm-Chromium Playwright render service** (`renderService.ts` — one browser, isolated contexts,
egress-blocked, semaphore-gated; `window.vellumRender()` hook). Render service ports **verbatim** (Bun.serve,
framework-independent). Editor SPA → TanStack. The `src/render/` library splits: parser→vellum-lang,
React renderer→vellum-frontend/gothic.

### 2.10 mouthpiece-backend ← caster (REWRITE Bun→Python)
5 cached stages (`src/cli.ts`): **ingest** (reads `../content/transcripts` + `../content/wiki` excl.
`Script/`) → **distill** (`callTool` → `SessionDigest` beats) → **script** (two-pass default:
`callText` improv → `callTool` dress; opt `--sharpen`) → **tts** (ElevenLabs `eleven_v3` Text-to-Dialogue
default / EdgeTTS / mock; IPA pronunciation lexicon) → **assemble** (ffmpeg stitch, EBU R128, optional
tavern ambient bed). Output `out/<id>.episode.mp3` + sidecars; face reads `out/` by path. Default model
`claude-opus-4-8`. Three podcast host personas hardcoded in `script/hosts.ts`. **Disposition:** ideal
Dagster asset graph (cached stages → assets) in Python; LLM→litellm+dspy; ffmpeg/TTS stay HTTP/subprocess. The two-pass
*tavern-tone* craft is tuned & green — **tone-regression risk on the Python re-port** (recommend golden A/B).

### 2.11 mouthpiece-frontend ← face (REWRITE)
Astro 5 SSG + 1 Solid island (`Player.tsx`, ~290 lines, MediaSession + scrubbing). Build-time loader
imports types from `pkg/caster/src/` and scans `caster/out/` (`episodes.ts`), copies audio via Astro hook.
Solid→React port is 1:1 mechanical; the real change is the **data source** (caster/out → mouthpiece-backend
artifacts). Smaller than aether.

### 2.12 orator-backend ← lark
Bun single-process: `@discordjs/voice` (pure-JS `opusscript`+`@noble/ciphers`; needs `@snazzah/davey`
native for DAVE/E2EE ≥0.19 or WS 4017), `bun:sqlite` library (collections/tracks/tags/track_tags/playlists/
playlist_items/download_jobs/download_job_items/api_keys; tags have color), yt-dlp/ffmpeg ingest, **large
REST surface** (`/api/v1/{collections,tracks(+bulk-move/delete/rename/tag),tags,playlists,ingest(upload/
youtube/jobs+SSE),playback(play/stop/pause/resume/next/prev/loop),voice,keys}`). Auth: web session OR
Bearer API key. **Disposition:** bot+server LIFT (already TS/web lane); the Vite/React SPA → TanStack
(rewrite). Keep Bun/TS (no language change warranted).

### 2.13 orator-controller ← birdfeed (+ lark keys)
Elgato Node SDK plugin (Node 20/24 mandated by SDK — stays outside Bun lane). Polls
`/api/v1/playback/now` @2.5 s; collection→tag nav; fixed origin `https://lark.iridi.cc` (`controller.ts:21`,
**make configurable**). Merges with lark's `api_keys` + `/keys` routes as the credential half. ⚠ never
tested on physical hardware yet.

### 2.14 strider ← strider (REORG — the canonical template)
**Already on astra's exact stack**: TanStack Start + Vite + React 19, file-based routing, build-time
content script (`scripts/build-content.ts` → `src/generated/` typed modules) → route-loader lookup,
`@faerrin/gothic` via `workspace:*` (`__root.tsx:14`), pixi via `<ClientOnly>`, static prerender to
`dist/client/`. **This is the reference template for every other astra frontend.** The faction/layer/skein
data model is campaign-specific and gets redesigned for the hexmap-journey concept, but the *architecture*
(build-time content → generated modules → loaders → prerender) transplants directly.

---

## 3. Net-new standards (decisions + how they assemble)

### 3.1 Runtime: Dagster (pipeline) + Docker Compose (services) — Decision H
*(Supersedes the earlier Windmill plan. Windmill can do both — incl. persistent WS Discord bots — but it
forces one tool to be both a workflow engine and a service supervisor; the field overwhelmingly splits
these. We split too.)*
- **Pipeline = Dagster.** The batch chain craig→scribe→linguist→akasha→mouthpiece is a **software-defined
  asset graph**, modeled with **one partition per session/date** — each session re-materializes its own
  assets, with free lineage + caching (caster/linguist already cache per stage). Python-native (fits the
  py pipeline), strong UI, OTel support, scheduled/sensor-triggered. Self-host = `docker compose`
  (Dagster webserver + daemon + code-location container + its own Postgres).
- **Services = Docker Compose.** The ~5 long-running daemons (weal-bot + orator Discord gateways, voice
  playback, weal-overlay SSE, the vellum render service) + DBs run as Compose services with
  `restart: unless-stopped` + healthchecks on one host. A Discord bot is a persistent WS process — this
  is exactly what a supervisor (Compose/systemd) is for.
- **Edge = Caddy.** Serves the prerendered frontends from `dist/` + reverse-proxies the service APIs.
- **Single pane = SigNoz/OTel**, not a single runtime: observability spans Dagster + the Compose services
  uniformly, which is the *visibility* ASTRA.md actually asks for.
- **Division of labor:** GitHub Actions = CI (lint/test/build on PR); Dagster = pipeline runtime; Compose
  = service runtime; Caddy = edge; SigNoz = observability. No overlap.

### 3.2 OpenTelemetry → SigNoz (observability)
Self-host SigNoz (`docker compose`, ClickHouse + OTLP collector :4317/:4318). One host collector-contrib
agent for host/container metrics + logs.
- **Python (uv):** pin `opentelemetry-distro`+`opentelemetry-exporter-otlp` in `pyproject.toml` (the
  `bootstrap -a install` flow breaks under `uv sync`); run via `opentelemetry-instrument`.
- **TS (bun):** `NodeSDK` + OTLP exporters in a `telemetry.ts`, loaded via `bun --preload` (Bun lacks
  `--require`).
- Put both behind shared libs `libs/{py,ts}/observe` so every app wires identically from day one.

### 3.3 litellm + dspy (LLM) — replaces `@faerrin/llm`
**Layering:** dspy is the program layer, litellm the transport; dspy routes through litellm via
`dspy.LM("anthropic/claude-opus-4-8")`. Even Claude-only, litellm buys uniform call surface + retries/
fallbacks + cost tracking (retires `pricing.ts`) + caching + **OTel hooks** (serves §3.2).
- **SDK-first** (in-process) for linguist + mouthpiece. Stand up the **litellm proxy only when** the TS
  side needs inference or you want one org-wide spend/OTel ledger.
- **dspy fit:** *strong* for linguist transcript-fixing (constrained transform, optimizable against a small
  gold set); *partial* for mouthpiece creative script-gen (no crisp metric — use dspy as typed plumbing
  over the existing two-pass flow, keep craft in prompts, don't expect optimizer gains).
- **Parity to re-establish in Python:** `stop_reason==max_tokens → raise` guard; ≥4096-token cache-prefix
  behavior; forced-tool JSON schema → Pydantic typed outputs. (`@faerrin/llm` call-site table in §2 of the
  shared-libs agent run: all sites are in caster + `content/scripts/lib/llm.ts`.)

### 3.4 KDL 2.0 (config + data serialization)
Nodes + positional args + `key=val` props + `{}` children; typed (`#true/#false/#null`). Finalized v2.
- **(a) config** (ontology-config): clean fit — `mouthpiece { model "…"; two-pass #true }`.
- **(b) secrets (Decision E → SOPS):** ⚠ **do NOT store plaintext secrets in KDL** (it's the env-var
  problem, not a fix). KDL holds only **`ref=` pointers** (e.g.
  `anthropic-api-key ref="sops:secrets.enc.kdl#anthropic"`); the real values live in a **SOPS-encrypted
  file** (age/PGP) in-repo, decrypted into env / Dagster config at deploy. Lint-block plaintext values.
- **(c) data** (ontology-being): `player "josh" { discord-id "…"; characters { character "Reed" class="rogue" } }`.
- **Parsers (risk — young, ~single-maintainer):** Python `ckdl` (fast, C) or `kdl-py` (pure, v2); TS
  `@bgotink/kdl` (format-preserving round-trip — best for human-edited files) or `kdljs`. **Keep KDL at the
  edges** (load → validate into Pydantic/Zod immediately) so the parser is swappable; verify a shared
  fixture round-trips identically in both languages before standardizing.
- **vellum-format vs KDL are orthogonal layers:** vellum = prose/content documents (akasha-backend); KDL =
  structured truth/config (ontology). They meet only by *reference* (a vellum doc cites an ontology entity).
  No KDL inside vellum bodies; no prose inside KDL.

### 3.5 Polyglot repo (uv + bun) & 3.6 VCS/CI/hosting
Two **non-nesting** workspace roots: uv (`[tool.uv.workspace] members=["apps/*","libs/py/*"]`, one
`uv.lock`, root virtual pkg) + bun (`workspaces:["apps/*","libs/ts/*"]`, one `bun.lock`). Per-app manifest
(`pyproject.toml` *or* `package.json`) decides the toolchain; globs stay disjoint. Single repo-root
`dist/` (gitignored) for all site builds, served by Caddy. Plain **git** (drop jj for astra),
**conventional commits** via `commitlint` in CI, one `ci.yml` with parallel jobs
(`py-lint`(ruff)/`py-typecheck`(ty)/`py-test`/`ts-typecheck`/`ts-lint`/`ts-test`/`ts-build`) gated by
`dorny/paths-filter`. Caddy: one gitignored root `Caddyfile` (embeds Cloudflare DNS token, per faerrin's
gotcha) + a committed `Caddyfile.example`; one block per host.

---

## 4. Recommended repo skeleton

```
astra/
├─ ASTRA.md  CLAUDE.md  README.md
├─ pyproject.toml  uv.lock              # uv workspace root (virtual): apps/* libs/py/*
├─ package.json    bun.lock             # bun workspace root: apps/* libs/ts/*
├─ ruff.toml  tsconfig.base.json  .editorconfig  biome.json  commitlint.config.js
├─ Caddyfile (gitignored)  Caddyfile.example
├─ dist/ (gitignored)                   # all site-gen output, served by Caddy
├─ ontology/
│  ├─ ontology-being/   (py)  table META: players→PCs, campaigns, colors, hosts (KDL) — not setting (akasha)
│  └─ ontology-config/  (py)  KDL config + secret-refs (values resolved from SOPS at load)
├─ apps/
│  ├─ scribe/ linguist/ akasha-backend/ mouthpiece-backend/      (py)   pipeline
│  ├─ akasha-frontend/ mouthpiece-frontend/ vellum-frontend/ strider/  (ts)   sites → dist/
│  ├─ weal-overlay/ orator-controller/                           (ts/node)
│  ├─ weal-bot/        (ts — §7-B)            [Compose service]
│  └─ orator-backend/  (ts)                   [Compose service]
├─ libs/
│  ├─ py/  observe/  config/  llm/            # OTel init, KDL+SOPS config reader, litellm+dspy
│  └─ ts/  observe/  config/  gothic/  vellum-lang/  # OTel preload, KDL config, UI framework, parser
├─ dagster/            # Dagster definitions: loads each pipeline app's assets; schedules/sensors
├─ deploy/
│  ├─ docker-compose.yml     # dagster(webserver+daemon+pg), signoz(+clickhouse), otel-collector,
│  │                         #   weal-bot, orator-backend, vellum-render, litellm-proxy(opt), caddy
│  └─ otel-collector.yaml
├─ .github/workflows/ci.yml + actions/setup-{uv,bun}/
└─ thoughts/           # research + per-component plans (carried from faerrin)
```

---

## 5. Dependency-ordered bring-up sequence

1. **Repo skeleton + dual workspaces** (both lockfiles, root configs, empty `dist/`, `.gitignore`, CLAUDE.md).
2. **Infra substrate** — `deploy/docker-compose.yml`: SigNoz+ClickHouse+collector + Dagster(+PG) + Caddy;
   confirm OTLP :4318 reachable + Dagster UI up. *(Infra-first so everything emits telemetry from day one.)*
3. **ontology-config + `libs/{py,ts}/observe` + `libs/{py,ts}/config`** — config/secret SSOT (KDL + SOPS),
   OTel shims, config reader. *Everything depends on config + telemetry.*
4. **ontology-being + `libs/py/llm` + `libs/ts/gothic` + `libs/ts/vellum-lang`** — truth store, LLM client,
   UI kit, parser. *No app builds before these.*
5. **Pipeline apps (py), upstream→downstream:** scribe → linguist → akasha-backend → mouthpiece-backend, as
   Dagster assets (one partition per session).
6. **Long-running services (Docker Compose):** weal-bot (+overlay), orator-backend (+controller), vellum-render.
7. **Frontends (ts → dist/):** strider (template first) → akasha-frontend → mouthpiece-frontend →
   vellum-frontend.
8. **CI gates + Caddy multi-site + commitlint** — lock green, route hosts, cut over.

---

## 6. Cross-subsystem contracts (must be preserved/redesigned)

- **weal-bot → weal-overlay:** POST v1 `{v,user,expression,total,value,is_crit,is_fumble}` + `X-Eerie-Token`;
  URL from ontology-config.
- **orator-backend ↔ orator-controller:** Bearer-key REST; `/api/v1/playback/now` @2.5 s; configurable origin.
- **scribe → linguist → {akasha-frontend, mouthpiece-backend}:** transcript artifacts (line-numbered).
- **mouthpiece-backend → akasha-backend:** reads wiki corpus for grounding (was filesystem; becomes an
  akasha query — **decision §7-D**).
- **mouthpiece-backend → mouthpiece-frontend:** `<id>.episode.mp3` + sidecars (was `out/` path; becomes
  artifact store).
- **{strider, vellum-frontend, akasha-frontend} → gothic:** `workspace:*` import (strider is the live pattern).

---

## 7. Decisions ledger (these gate the plan)

**DECIDED 2026-06-18** (user). Recommendations kept for context; **Decision column is binding.**

| # | Decision | **DECIDED** | Consequence for the plan |
|---|---|---|---|
| A | Migration strategy | **Big-bang cutover** (greenfield, switch all at once) | No incremental safety net → plan needs heavy pre-cutover validation gates + a rehearsed cutover runbook + rollback-to-faerrin. |
| B | weal-bot language | **Rewrite to TS/Bun** | Two toolchains only (py+ts), no Rust lane. **Build a roller parity harness first** (golden dice-eval vectors) before deleting Rust. |
| C | "vellum format" scope | **Full vellum — one format for ALL content** | ⚠ **Critical path.** vellum-lang must be expanded to own prose/timeline/deity/statblock; ALL ~100+ wiki pages re-authored/converted into vellum. Largest single work item; gates akasha-frontend. |
| D | akasha consumption | Build-time snapshot (my call) | akasha-frontend reads an akasha-backend export at build; no live API in v1. |
| E | Secrets backend | **SOPS-encrypted in-repo + KDL `ref=`** (updated 2026-06-18) | KDL holds only `ref=` pointers; values in a SOPS-encrypted file (age/PGP), decrypted into env / Dagster config at deploy; nothing plaintext in git. (Was "Windmill variables" — moot after H dropped Windmill.) |
| F | Datastore | Postgres (my call) | Dagster + litellm-proxy already need PG; weal roll-history + orator library move SQLite→PG; preserve `player_id` FKs, exclude 47M-row junk on migrate. |
| G | Transcription engine | **Groq hosted `whisper-large-v3` API** (added 2026-06-18) | Replaces self-hosted whisperx: no GPU worker, no local model. Per-track + local VAD-trim preserves Craig speaker separation. Cost ≈ $9–25/yr ongoing (76 sessions × 3.5 hr × 4.7 speakers, measured). **Import 76 historical sessions verbatim — do not re-transcribe.** |
| H | App runtime | **Split: Dagster (pipeline) + Docker Compose (services)** (revised 2026-06-18) | Replaces the earlier Windmill plan. Pipeline = Dagster asset graph (per-session partitions, lineage); ~5 daemons + DBs = Compose services (restart/healthchecks); Caddy = TLS/static edge; SigNoz/OTel = the single pane. |

Remaining within-sub-plan details I'll recommend in place: Pagefind replacement for akasha-frontend search,
dspy-vs-raw-litellm for mouthpiece creative gen, litellm proxy timing, biome-vs-eslint, gothic token→JS build.

---

## 8. Proposed Phase-2 plan structure (phased program)

A top-level roadmap (`thoughts/shared/plans/astra-migration-roadmap.md`) + per-component sub-plans under
`thoughts/<component>/plans/NNNN-*.md`, grouped into 6 phases mirroring §5:

- **Phase 0 — Foundation:** repo skeleton, dual workspaces, CI, `deploy/` (Dagster+SigNoz+Compose), conventions.
- **Phase 1 — Substrate:** ontology-config, ontology-being, `libs/{py,ts}/observe`, `libs/py/llm`, `libs/{py,ts}/config`.
- **Phase 2 — Shared:** gothic (UI framework), vellum-lang (extract).
- **Phase 3 — Pipeline (py):** scribe, linguist, akasha-backend (the XL item), mouthpiece-backend.
- **Phase 4 — Services:** weal-bot (+overlay), orator-backend (+controller).
- **Phase 5 — Frontends (ts):** strider (template) → akasha-frontend → mouthpiece-frontend → vellum-frontend.
- **Phase 6 — Cutover:** Caddy routing, data migration, parallel-run validation, decommission faerrin pieces.

Each sub-plan: scope, the relevant §7 decision, data/contract migration steps, parity/validation criteria,
risks. The akasha-backend sub-plan is the critical path and should be drafted first/deepest.

---

## 9. Risks (top)

1. **akasha-backend / "vellum format"** (XL, §7-C) — undefined target format over 100+ heterogeneous pages;
   critical path; nothing downstream renders until resolved.
2. **Creative tone regression** porting caster's tuned two-pass tavern flow Bun→Python — needs golden A/B.
3. **KDL tooling maturity** (young parsers, cross-language parity) — keep at edges, JSON fallback ready.
4. **Roll-history migration** — preserve `player_id` FKs, exclude the 47 M-row junk (`player_id<>6`,
   `base≤100`, `pool≤30`); whisperx non-determinism + Decision G (go-forward = Groq `whisper-large-v3` API) mean **don't
re-transcribe** the 76 historical sessions — import verbatim.
5. **Two control surfaces** (Decision H) — Dagster runs the pipeline, Compose runs the services; keep them
   coherent (one `deploy/` dir, SigNoz as the unified view) so ops isn't split-brained. A Discord bot as a
   Compose service is standard; the prior "run bots in Windmill" concern is moot.
6. **3rd toolchain (Rust)** if weal-bot stays Rust — own CI lane, polyglot friction.
7. **Secret hygiene** — a `DICE_FEED_URL` webhook token was leaked in faerrin git history (still needs
   rotating); do not carry plaintext secrets into KDL.
8. **Solid→React** ports (aether's Graph/TranscriptPlayer/Explorer) — highest-effort frontend work.
