# Astra Migration — Program Roadmap (0000)

**Status:** Plan (pre-implementation). **Author:** octo:auto → Plan, team mode (Claude personas).
**Date:** 2026-06-18. **Source:** `/ruby/data/experiments/faerrin`. **Target:** `/ruby/data/experiments/astra`.
**Research foundation:** [`thoughts/shared/research/2026-06-18-astra-migration-discovery.md`](../../shared/research/2026-06-18-astra-migration-discovery.md).

> This is the **spine** of the astra migration: the phases, their concrete work items, the
> dependency ordering, the cutover runbook, and the index of per-component sub-plans. Each phase below
> is actionable on its own; the deep per-component sub-plans (`0001…`) expand the work items into
> file-level steps. astra is a **re-architecture**, not a port — read the research doc first.

---

## 1. Overview

astra rebuilds faerrin as a **polyglot monorepo** (Python/uv for data+LLM, TypeScript/bun for web,
no third language) under net-new standards: **Dagster** (pipeline orchestration) + **Docker Compose**
(service supervision), **OTel→SigNoz** (observability — the *single pane of glass*), **litellm+dspy**
(all LLM), **KDL 2.0** + **SOPS** (config/data + secrets), **git+conventional-commits** (drops jj),
**Caddy** (TLS/static edge). It re-cuts faerrin's 13 packages into ~10 named subsystems plus 2 net-new
(`ontology-being`, `ontology-config`).

Two user decisions set the program's character:

- **Big-bang cutover** — astra is built to completeness in a staging posture, validated as a whole,
  then cut over from faerrin in one rehearsed event. There is **no incremental per-subsystem
  parallel-run in production**, so the plan front-loads validation and ends with a runbook + rollback
  (§7). Everything must be green before the flip.
- **Full vellum** — `vellum-lang` is expanded to be the **single content format for all akasha
  content** (prose, timeline, deity/stat pages, statblocks/handouts), and **every** existing wiki page
  is converted into it. This is the **critical path** (§6): nothing in akasha renders until vellum-lang
  owns every page type and the corpus is converted.

## 2. Locked decisions (binding; mirrored in research §7)

| # | Decision | Choice | Plan consequence |
|---|---|---|---|
| A | Migration strategy | **Big-bang cutover** | Front-load validation; staging parallel-run; rehearsed cutover + rollback (§7). |
| B | weal-bot language | **Rewrite Rust→TS/Bun** | Two toolchains only. **Roller parity harness before deleting Rust** (Phase 4). |
| C | "vellum format" scope | **Full vellum — one format for all content** | Critical path: expand vellum-lang (Phase 2) → convert 100+ pages (Phase 3 akasha-backend). |
| D | akasha consumption | Build-time snapshot | akasha-frontend reads an akasha export at build; no live content API in v1. |
| E | Secrets backend | **SOPS-encrypted in-repo + KDL `ref=`** *(updated 2026-06-18 after H)* | ontology-config KDL holds `ref=` pointers; values in a SOPS-encrypted file (age/PGP), decrypted into env / Dagster config at deploy; nothing plaintext in git. |
| F | Datastore | **Postgres** | weal roll-history + orator library SQLite→PG; preserve `player_id` FKs; drop 47M-row junk. |
| G | Transcription engine | **Groq hosted `whisper-large-v3`** (API) | Per-track + local VAD-trim; preserve Craig speaker separation. **No GPU worker, no local model.** Import the 76 historical whisperx outputs verbatim — **do not re-transcribe.** Cost ≈ $25/yr ongoing. |
| H | App runtime | **Split: Dagster (pipeline) + Docker Compose (services)** *(2026-06-18, replaces Windmill)* | Pipeline = Dagster **asset graph** (one partition per session, lineage); the ~5 daemons + DBs = **Compose services** (restart + healthchecks); Caddy = TLS/static edge; **SigNoz/OTel = the single pane**. No single runtime forced to do both jobs. |

## 3. Source → target map (disposition + sub-plan)

| Astra subsystem | Lang | From faerrin | Disposition | Sub-plan |
|---|---|---|---|---|
| ontology-being | py | players.toml + campaigns.yaml + roster.ts + colors | NET-NEW (consolidate) | 0002 |
| ontology-config | py | 8×.env.example + caddy token + hardcoded defaults | NET-NEW | 0002 |
| libs/py/{observe,llm,config}, libs/ts/{observe,config} | py/ts | — (llm replaces @faerrin/llm) | NET-NEW | 0002 |
| gothic (UI framework) | ts | gothic CSS + vellum render components | EXPAND | 0003 |
| vellum-lang | ts+py | vellum/src/render/{parse,surface,vss,model} | REORG + **EXPAND (full vellum), dual parser** | 0004 |
| scribe | py | wretch | REORG (Groq API + Dagster assets) | 0005 |
| linguist | py | content/scripts | REWRITE (TS→py, Dagster assets) | 0006 |
| akasha-backend | py | content/wiki (+transcripts) | **REWRITE + full-corpus conversion** ⚠ | 0007 |
| mouthpiece-backend | py | caster | REWRITE (Bun→py / Dagster asset graph) | 0008 |
| weal-bot | ts | mouth (Rust) | REWRITE (+parity harness) | 0009 |
| weal-overlay | ts | eerie | LIFT | 0009 |
| orator-backend | ts | lark | LIFT (server) + REWRITE (SPA→TanStack) | 0010 |
| orator-controller | ts/node | birdfeed + lark keys | REORG (merge) | 0010 |
| akasha-frontend | ts | aether | REWRITE (Astro+Solid→TanStack) | 0011 |
| mouthpiece-frontend | ts | face | REWRITE | 0012 |
| vellum-frontend | ts | vellum (editor + render svc) | REORG | 0013 |
| strider | ts | strider | REORG (template; new data model) | 0014 |

## 4. Architecture principles (apply in every sub-plan)

1. **Two toolchains, disjoint workspaces.** uv (`apps/* libs/py/*`) and bun (`apps/* libs/ts/*`) roots
   never nest; per-app manifest decides ownership. One `dist/` at root.
2. **Split runtime** (Decision H), GitHub Actions is CI — three non-overlapping concerns:
   (a) the batch **pipeline** = a **Dagster** asset graph (scribe→linguist→akasha→mouthpiece), one
   **partition per session/date**, scheduled/sensor-triggered, with lineage; (b) the **long-running
   services** (Discord bots, overlay SSE, vellum render service, DBs) = **Docker Compose** units with
   `restart: unless-stopped` + healthchecks; (c) **Caddy** = TLS/static edge serving `dist/` + reverse-
   proxying service APIs. **Visibility is unified by SigNoz/OTel across all three**, not by one runtime.
3. **Telemetry from day one.** Every app imports `libs/{py,ts}/observe` before anything else; no app
   ships without OTel wired to SigNoz.
4. **KDL at the edges.** Parse KDL → validate into Pydantic/Zod immediately; never thread raw KDL
   nodes through code. Secrets are `ref=` pointers resolved from SOPS at load.
5. **Contracts are frozen** (research §6): weal-bot→overlay payload, orator REST + Bearer auth,
   transcript line format, gothic `workspace:*` import. Preserve or version explicitly.
6. **strider is the frontend template.** Every TanStack frontend follows its build-time-content →
   generated-modules → route-loader → prerender pattern.
7. **Preserve identity keys.** `player_id` integers are load-bearing FKs; carry them verbatim.

## 5. Phases

Each phase lists **goal → work items → depends-on → exit gate**. Phases 0–2 are strictly sequential
substrate; 3–5 parallelize within themselves once 2 is done; 6 is the single cutover.

### Phase 0 — Foundation  → sub-plan 0001
**Goal:** an empty-but-green astra repo: dual workspaces, CI, deploy substrate, conventions.
**Work items:**
1. Repo skeleton per research §4 (dirs, `.gitignore` incl. `dist/`+`Caddyfile`+SOPS keys, `README`, `CLAUDE.md`).
2. uv workspace root (virtual `pyproject.toml`, `ruff.toml`) + bun workspace root (`package.json`,
   `tsconfig.base.json`, `biome.json`) — disjoint globs, two lockfiles.
3. `.github/workflows/ci.yml` with parallel jobs (`py-lint` ruff, `py-typecheck` ty, `py-test`,
   `ts-typecheck`, `ts-lint`, `ts-test`, `ts-build`) gated by `dorny/paths-filter`; composite
   `actions/setup-{uv,bun}`.
4. `commitlint.config.js` + a CI `commit-msg` lane (conventional commits).
5. `deploy/docker-compose.yml`: **Dagster** (webserver + daemon + a code-location container) + its
   **Postgres**, **SigNoz**(+ClickHouse) + otel-collector, **Caddy**; `deploy/otel-collector.yaml`;
   `Caddyfile.example`; a SOPS-decrypt entrypoint shim.
6. One trivial py lib + one trivial ts lib as "hello, green" smoke (proves both lanes build/test).
**Depends-on:** none. **Exit gate:** `ci.yml` green on an empty repo; `docker compose up` brings the
**Dagster UI + SigNoz UI** up; OTLP :4318 reachable; SOPS decrypt works; conventional-commit lint
rejects a bad message.

### Phase 1 — Substrate (config, truth, shared libs)  → sub-plan 0002
**Goal:** the things every other subsystem imports.
**Work items:**
1. **ontology-config**: KDL schema for config + secret-`ref=`; `libs/{py,ts}/config` = a KDL loader that
   validates into typed structs and resolves `ref=` pointers from the **SOPS-decrypted** secret file
   (or injected env). Migrate the full env inventory (research §2 shared-libs table) into KDL.
2. **ontology-being** (table META — players → the PCs they play, campaigns, colors, host identities
   [weal-bot Discord hosts **and** mouthpiece podcast personas, as **distinct** types]; **NOT** in-world
   setting characters, which live in akasha): KDL schema; consolidate the 3 split
   sources (`players.toml`, `campaigns.yaml`, `roster.ts`) + the missing color hex values; **preserve
   `player_id`**. Pydantic models + a typed accessor lib.
3. **libs/py/observe + libs/ts/observe**: OTel init shims (py `opentelemetry-instrument` wiring; ts
   `telemetry.ts` `--preload`) exporting to SigNoz.
4. **libs/py/llm**: litellm+dspy client replacing `@faerrin/llm` — re-establish the `max_tokens→raise`
   guard, cache-prefix behavior, forced-tool→Pydantic outputs, cost logging→OTel.
**Depends-on:** Phase 0. **Exit gate:** a smoke app reads config from KDL + a SOPS-decrypted secret,
emits a trace to SigNoz, and makes one litellm→Claude call with cost recorded; ontology round-trips KDL
in both py and ts from one shared fixture.

### Phase 2 — Shared content + UI  → sub-plans 0003 (gothic), 0004 (vellum-lang)
**Goal:** the UI framework and the content language — both on the critical path.
**Work items:**
1. **gothic**: port the 20 tokens + fonts; add a token→JS build; build the React component library
   (typography, panels, cards, buttons, layout primitives) + absorb vellum's render components
   (StatCard/ProseCard/TraitPill/Redaction/ActionGlyph/DocumentView). Storybook.
2. **vellum-lang (EXPAND — critical path)**: define the full-vellum grammar that covers **all** akasha
   page types — prose + frontmatter, timeline entries (replacing raw HTML `Timeline.md`), deity/stat
   `:: field` blocks, statblocks/handouts, and cross-references (replacing Obsidian `[[wikilinks]]`).
   Pure/total parser → typed AST; py **and** ts parsers with a shared conformance fixture suite.
**Depends-on:** Phase 1. **Exit gate:** vellum-lang parses a representative sample of every page type
into a stable AST, identically in py+ts; gothic renders that AST (via the React renderer) in Storybook.

### Phase 3 — Pipeline (Python, Dagster assets)  → 0005 scribe, 0006 linguist, 0007 akasha-backend, 0008 mouthpiece-backend
**Goal:** the data pipeline craig→scribe→linguist→akasha→mouthpiece as a **Dagster asset graph**, one
**partition per session/date** (each session re-materializes its own assets; lineage + caching are free).
**Work items:**
1. **scribe (0005)**: replace self-hosted whisperx with a **Groq `whisper-large-v3` API client** —
   per-track submit + a local VAD-trim (cheap CPU) to preserve Craig's perfect speaker separation while
   sending only voiced audio; add a local forced-align pass *only if* word-level timestamps prove needed
   (canonical transcript is line-level, so likely not). Model the reconciler as **Dagster
   partitioned assets** (disk-ledger/resume → asset materialization state). **No GPU worker, no 2.9 GB
   local model.** **Import the 76 historical whisperx outputs verbatim — do not re-transcribe** (their
   JSON shape is the contract; go-forward output is the same model family, so downstream stays consistent).
2. **linguist (0006)**: port ingest/script/build-transcripts to Python **Dagster assets**; `defs.yaml`
   lifts; the review/judge LLM step → dspy (strong fit). Emits canonical transcripts + mouthpiece context.
3. **akasha-backend (0007) ⚠ critical path**: build the content store (vellum SSOT); **convert the 141
   wiki pages to full-vellum** — most pass through (`[[links]]`+prose+frontmatter), only ~22 need
   structural conversion (9 `::`→`:::fields`, 13 HTML→`:::timeline`/markdown) + a **sigil-collision
   scan** across all 141 (validated by the TS parser, D2). Resolve crossrefs (page index +
   ontology-being) into the edge list; bake faerrin git dates into frontmatter. Emit the build-time
   snapshot (corpus + metadata). **The Quartz-faithful graph/slug (`site.ts`/`slug.ts`) lifts to TS at
   akasha-frontend build — not reimplemented in Python (D2).**
4. **mouthpiece-backend (0008)**: rewrite caster's 5 cached stages as a **Dagster asset graph** in
   Python (the cached stages → assets; per-session partitions); LLM → litellm/dspy (dspy as typed
   plumbing for the two-pass tavern flow; **golden A/B vs the TS output** to guard tone); TTS/ffmpeg stay
   HTTP/subprocess; grounding reads akasha.
**Depends-on:** Phase 2 (akasha needs vellum-lang+gothic; mouthpiece needs libs/py/llm + akasha).
**Exit gate:** end-to-end dry-run on one historical session (one partition) produces transcript → vellum
content → roundtable script+audio; full wiki corpus converts to vellum with zero parser errors;
mouthpiece golden A/B within tolerance.

### Phase 4 — Long-running services (Docker Compose)  → 0009 weal, 0010 orator
**Goal:** the Discord bots + overlay + controller running as **Docker Compose services**
(`restart: unless-stopped` + healthchecks), behind Caddy, observed by SigNoz.
**Work items:**
1. **weal-bot (0009)**: **first** build a roller parity harness — extract golden dice-eval vectors from
   the Rust `roller` crate; then port the Pratt parser + eval to TS, pass the harness; discord.js
   gateway + Bun.serve `/api/v1/speak`; roll recording → **Postgres** (preserve `player_id`, exclude
   junk); roll→overlay v1 POST. **weal-overlay**: lift eerie, repoint, drop v0 schema.
2. **orator-backend (0010)**: lift the lark bot+server (Bun/TS); library SQLite→**Postgres**; rewrite
   the Vite/React SPA → TanStack. **orator-controller**: merge birdfeed + lark key-mgmt; make origin
   configurable.
**Depends-on:** Phase 1 (config/being). Can run parallel to Phase 3/5. **Exit gate:** each bot runs as a
Compose service that survives restart; weal-bot passes the parity harness + records a roll to PG + drives
the overlay; orator plays audio + the controller drives it (hardware test still open from faerrin — note
in runbook).

### Phase 5 — Frontends (TanStack/React → dist/)  → 0011 akasha-fe, 0012 mouthpiece-fe, 0013 vellum-fe, 0014 strider
**Goal:** all sites, strider-templated, building to `dist/` (served by Caddy).
**Work items:**
1. **strider (0014)** first — establish/confirm the canonical template; new hexmap-journey data model.
2. **akasha-frontend (0011)**: rewrite aether on TanStack; consume akasha's vellum snapshot via
   gothic's renderer; port the 8 Solid islands → React (Graph/TranscriptPlayer/Explorer are the hard
   ones); **lift `slug.ts` + `site.ts` verbatim** (preserve URLs + compute the graph:
   backlinks/folder-index/breadcrumbs/tags/Explorer); re-integrate Pagefind as a post-build step;
   surface weal roll-probability insights.
3. **mouthpiece-frontend (0012)**: rewrite face on TanStack; data source = mouthpiece-backend artifacts;
   Player.tsx Solid→React.
4. **vellum-frontend (0013)**: editor SPA → TanStack; render service lifts verbatim (a Compose service);
   consume vellum-lang as a package.
**Depends-on:** Phase 2 (gothic, vellum-lang) + the matching backend. **Exit gate:** every site builds
to `dist/`, renders real migrated data, URL slugs verified against faerrin for akasha.

### Phase 6 — Cutover  → sub-plan 0015
**Goal:** one rehearsed switch faerrin→astra. See the runbook (§7).
**Work items:** full staging parallel-run; data migration (final); Caddy host flip; DNS; rotate the
leaked `DICE_FEED_URL` webhook + all carried secrets; decommission faerrin pieces; keep faerrin as
rollback for a defined window.
**Depends-on:** Phases 3–5 all green. **Exit gate:** every astra host serves correctly behind Caddy;
the pipeline runs on its Dagster schedule; bots live as Compose services; rollback rehearsed.

## 6. Critical path & sequencing

```
Phase0 ─ Phase1 ─ Phase2 ┬─ vellum-lang ─ akasha-backend ─ akasha-frontend ┐
                         │  (full-vellum conversion = the long pole)        │
                         ├─ gothic ───────────────────────────────────────┤
                         ├─ scribe ─ linguist ─ mouthpiece-be ─ mouthpiece-fe
                         ├─ weal / orator (parallel, off Phase1)            │
                         └─ strider (template) ────────────────────────────┴─ Phase6 cutover
```
**The long pole is vellum-lang → akasha-backend (full-corpus conversion) → akasha-frontend.** Draft and
start sub-plans 0004 and 0007 **first/deepest**. Big-bang means Phase 6 cannot start until *every* lane
is green, so the slowest lane sets the date — protect the akasha lane.

## 7. Cutover runbook (big-bang)

1. **Freeze** faerrin content/data writes (announce a window).
2. **Final data migration** in dependency order: ontology (being/config) → historical scribe outputs →
   transcripts → **wiki→vellum corpus** → weal roll-history (PG, junk excluded, `player_id` preserved)
   → orator library (PG) → caster `out/` artifacts.
3. **Staging parallel-run**: run astra fully against migrated data; diff akasha URLs/pages vs faerrin;
   run the pipeline once end-to-end (one Dagster backfill over recent partitions); smoke every site + bot.
4. **Flip**: point Caddy hosts at astra `dist/` + service ports; update DNS; enable the Dagster schedule.
5. **Rotate secrets** (esp. the historically-leaked webhook) as part of the flip, not before.
6. **Hold faerrin** as rollback for a defined window; document the revert (Caddy + DNS back).

## 8. Data migration inventory

| Data | Volume | From | To | Notes |
|---|---|---|---|---|
| wiki | 37 M, ~100+ pages, 4 formats | content/wiki | akasha (full-vellum) | ⚠ scripted + hand-checked conversion |
| transcripts | 9.4 M, 42 files | content/transcripts | linguist outputs | line format preserved |
| script-context | 73 M | content/scripts | linguist/mouthpiece | regenerable; migrate or rebuild |
| roll history | ~47 M rows (mostly junk) | mouth SQLite | weal PG | exclude `player_id<>6`,`base≤100`,`pool≤30`; keep `player_id` FKs |
| music library | low | lark SQLite | orator PG | schema port |
| episodes | caster/out | caster | mouthpiece artifacts | regenerable |
| ontology | small | players.toml/campaigns.yaml/roster.ts | KDL | consolidate + add color hexes |
| historical scribe | 76 sessions | wretch saved/ + content/scripts/data | scribe import (verbatim JSON) | **do not re-transcribe** (Decision G) |

## 9. Global success criteria

- `bun run ci` + uv CI both green across all apps/libs.
- `docker compose up` yields Dagster + SigNoz + collector + Caddy + the bot/render services; every app emits traces.
- Pipeline runs craig→…→mouthpiece on a Dagster schedule, one partition per session.
- All ~100+ wiki pages parse as full-vellum with zero errors; akasha URLs match faerrin's slugs.
- weal-bot passes the roller parity harness; roll history migrated (junk excluded, FKs intact).
- mouthpiece tone golden A/B within tolerance.
- No plaintext secrets in git; KDL holds only `ref=`; SOPS file decrypts at deploy.
- Cutover + rollback rehearsed.

## 10. Sub-plan index

| # | Sub-plan | Status |
|---|---|---|
| 0001 | Phase 0 — Foundation | **drafted** (this batch) |
| 0002 | Phase 1 — ontology + shared libs | **drafted** |
| 0003 | gothic — UI framework | **drafted** |
| 0004 | vellum-lang — full-vellum grammar ⚠ | **drafted** |
| 0005 | scribe | **drafted** |
| 0006 | linguist | **drafted** |
| 0007 | akasha-backend — content store + corpus conversion ⚠ | **drafted** |
| 0008 | mouthpiece-backend | **drafted** |
| 0009 | weal-bot + weal-overlay | **drafted** |
| 0010 | orator-backend + orator-controller | **drafted** |
| 0011 | akasha-frontend | **drafted** |
| 0012 | mouthpiece-frontend | **drafted** |
| 0013 | vellum-frontend | **drafted** |
| 0014 | strider | **drafted** |
| 0015 | Phase 6 — cutover | **drafted** |

## 11. Risks (top — see research §9 for full list)

1. **akasha/full-vellum** is the long pole and the riskiest item; under-estimating the conversion
   delays the whole big-bang. Mitigate: draft 0004+0007 first; build the converter early; budget hand-review.
2. **Tone regression** porting caster→mouthpiece Bun→Python — golden A/B gate.
3. **Roller rewrite** correctness — parity harness before deleting Rust.
4. **KDL tooling maturity** — keep at edges; cross-language fixture parity; JSON fallback ready.
5. **Big-bang has no production safety net** — the runbook + rehearsed rollback are mandatory, not optional.
6. **Secret hygiene** — SOPS keys managed out of git; rotate the leaked webhook at cutover; no plaintext in KDL.
7. **Two control surfaces** (Dagster for pipeline, Compose for services) — keep them coherent via one
   `deploy/` dir + SigNoz as the unified view; document where each lives so ops isn't split-brained.
