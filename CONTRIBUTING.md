# Contributing to astra

A practical guide to doing work in this repo — the workflow, conventions, exact commands, and the
load-bearing gotchas that aren't obvious until you hit them. `CLAUDE.md` is the authoritative
conventions file (and is loaded into every agent session); **this doc is the "how to actually pick up
and ship work here" companion.** Read both.

---

## 1. What astra is (orient first)

astra is a **re-architecture of [faerrin](/ruby/data/experiments/faerrin)** — a **polyglot monorepo**:
Python (data + LLM, managed by **uv**) and TypeScript (web, managed by **bun**), two toolchains, no third
language. It is a **port, not a greenfield**: most subsystems have an existing faerrin implementation that
should be lifted/ported, not reinvented.

**Read order before touching a subsystem:**
1. `ASTRA.md` — product vision.
2. `CLAUDE.md` — conventions (authoritative).
3. `thoughts/astra/plans/0000-astra-migration-roadmap.md` — the spine: phases, the **decisions ledger
   (A–I)**, critical path, cutover runbook.
4. `thoughts/shared/memory/MEMORY.md` + the memories it indexes — accumulated facts + feedback.
5. The subsystem's **sub-plan** (`thoughts/astra/plans/NNNN-*.md`), **spec** (`thoughts/astra/specs/`),
   and **pre-impl thoughts** (`thoughts/shared/research/`) if they exist.
6. The faerrin source you're porting (grep faerrin **first** — see §3).

**Migration status (2026-06-20):** Phases 0–3 COMPLETE (substrate + shared libs + the full pipeline:
scribe → linguist → akasha-backend → mouthpiece-backend). Phase 4 (services: weal, orator) + Phase 5
(frontends: strider → akasha-fe, mouthpiece-fe, vellum-fe) are next and parallelize. strider (0014) is
in progress (scaffold shipped). See the spine memory for the live status.

---

## 2. The development process (per subsystem)

Every subsystem moves through three gates, each leaving a doc in `thoughts/`:

1. **Scope** → `thoughts/shared/research/<date>-<subsystem>-<NNNN>-thoughts.md`. Read the faerrin source +
   the sub-plan, **verify every claim against the actual repos** (resolve real config/secrets, load real
   ontology, inspect real fixtures — don't list "open questions" that are checkable now), and surface the
   decisions to confirm before speccing.
2. **Spec** → `thoughts/astra/specs/<NNNN>-<subsystem>-spec.md` via `octo:spec`. Match the format of an
   existing spec (`0005-scribe`, `0008-mouthpiece-backend`). Encode: decisions in force, scope in/out,
   locked technical decisions, acceptance criteria, risks, hand-off. Flag decisions that need the user.
3. **Implement** → `octo:embrace`. Build the spec's scope **in full**, commit per green slice, update the
   memory with the load-bearing gotchas when done.

The whole flow can be driven by an agent; the artifacts are the durable record.

---

## 3. Working style (the expensive lessons — read these)

These are the failure modes that have actually bitten. They're also in `thoughts/shared/memory/` as
feedback memories ([[verify-before-acting]], [[no-silent-scope-cuts]]).

- **Port faerrin; don't reinvent.** astra is a port. For any derivation/transform/algorithm, **grep
  faerrin first** and lift the existing function (parity is the point). Example: folder-index page titles
  → faerrin's `folderIndexName` (`pkg/content/scripts/lib/folder-index.ts`), not a bespoke helper.
- **Verify before acting.** Don't act on a default or assumption when the truth is checkable. Read a
  skill/command's docs before running it; resolve real config; inspect the real corpus. "I assumed the
  flat-basename world" is how 45 folder-note pages silently broke.
- **Build the spec's scope in full; never silently cut.** Don't collapse/defer/skip spec'd scope to fit
  your budget. If it's too big, **say so and surface the trade-off** — let the user decide. Only defer
  what the spec explicitly sanctions (e.g. a paid live-run gate).
- **Commit-as-you-go, push-on-chunk.** This repo is trunk-based on `main` with per-slice commits (see the
  git log). Commit each CI-green slice with a Conventional Commit message; **push when a chunk/subsystem
  is done**, after reproducing CI locally. Don't accumulate a large uncommitted/unpushed tree. After
  pushing, don't watch the GHA run to completion — confirm the push + one status check ([[no-ci-monitoring]]).

---

## 4. Toolchains & workspaces

Two **disjoint** workspaces over the same tree; **a directory belongs to whichever lane its manifest
declares** (`pyproject.toml` → uv; `package.json` → bun). They never cross-claim.

- **Python (uv):** virtual workspace at root `pyproject.toml`; members `apps/*`, `libs/py/*`, `ontology/*`.
  Lint+format **ruff**, type-check **ty** (Astral, preview, pinned `==0.0.51`), tests **pytest**.
- **TypeScript (bun):** workspace at root `package.json`; members `apps/*`, `libs/ts/*`. Lint+format
  **biome** (one tool). Type-check `tsc --noEmit` against `tsconfig.base.json` (strict). Pins: bun
  **1.3.14**, biome **2.x**, typescript **5.x**, Python **≥3.12**.

**uv rejects empty members** (a glob-matched dir without a `pyproject.toml` is a hard error) → don't
pre-create placeholder member dirs; keep glob roots in git with a `.gitkeep` *file*. bun ignores
manifest-less dirs, so this is uv-only.

---

## 5. Reproduce CI locally (do this before every push)

```bash
# Python lane
uv sync
uv run ruff check && uv run ruff format --check && uv run ty check && uv run pytest

# TypeScript lane
bun install
bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && bun --filter '*' build
```

CI (GitHub Actions, `.github/workflows/ci.yml`) is parallel + path-filtered, so scope your local run to
the lane/app you touched. There are **no local git hooks** — format/lint/typecheck/test run in CI and
locally, never pre-commit. Conventional-commit messages are linted by commitlint.

---

## 6. Standing conventions (from CLAUDE.md — the ones you'll trip on)

- **Telemetry from day one.** Every app wires `libs/{py,ts}/observe` to SigNoz **in its actual runtime**
  (call `init_telemetry` in the Dagster code location / the service entrypoint). *Importing observe ≠
  wiring it.* ([[telemetry-built-in]])
- **Config single-source.** ALL config lives in `ontology/ontology-config` and is read via `astra_config`
  (py) / the ts config lib — no hardcoded/duplicated config or ad-hoc env reads. ([[config-single-source]])
- **Secrets:** KDL holds `ref="sops:KEY"` pointers; values live in a **SOPS**-encrypted file, resolved
  lazily (`SecretRef.resolve()`). No plaintext in git. Parse KDL → validate into Pydantic/Zod immediately;
  never thread raw KDL nodes through code.
- **All LLM calls** go through `libs/py/llm` (litellm; dspy only where an optimizer pays off — e.g. the
  linguist judge). Never call a provider SDK directly. The `max_tokens→raise` guard, prompt caching, and
  cost→OTel live in `LiteLLMClient` — don't bypass them (`make_dspy_lm` is a bare `dspy.LM` that does).
- **Preserve identity keys.** `player_id` integers are load-bearing FKs; carry them verbatim.
- **strider is the frontend template** — every TanStack frontend follows its build-content →
  generated-modules → route-loader pattern, and (Decision I) runs **SSR as a Compose service behind
  Caddy** with client RUM, not prerendered static `dist/`.

---

## 7. Runtime model (Decision H + I)

Four non-overlapping concerns; **SigNoz/OTel is the single pane across all of them**:

- **Pipeline** (craig → scribe → linguist → akasha → mouthpiece) = a **Dagster** asset graph, one
  partition per session/date, sensor-chained, in `dagster/definitions.py`.
- **Long-running services** (Discord bots, overlay, the SSR frontends — Decision I, DBs) = **Docker
  Compose** units (`restart: unless-stopped` + healthchecks) in `deploy/`.
- **Edge** = **Caddy** (TLS + reverse-proxying service APIs **and** the SSR frontend servers).
- **CI** = GitHub Actions.

---

## 8. Gotchas catalog (the ones that cost time)

**Python / uv / Dagster**
- **Dagster asset modules must NOT `from __future__ import annotations`** — Dagster introspects the
  `context`/`config` annotations at definition time and needs real types, not strings.
- **Hermetic tests are mandatory** (CI has no ffmpeg, no live API keys, no SOPS age key). Inject seams:
  stub `LlmClient` (`call_text`/`call_tool`), mock TTS provider, fake ffmpeg runner. Keep arg-builders
  pure. Tests that actually decrypt SOPS must `skipif` on `which sops` + the age key file.
- **ruff** = line-length **100**, rules `E,F,I,UP,B,SIM`. Long verbatim strings (ported prompts) → express
  as **implicit string concatenation** (byte-identical, source lines <100), not triple-quoted; pull deeply
  nested long descriptions to module constants. `zip()` needs `strict=`.
- **ty** is pinned preview; missing third-party stubs → alias the type to `Any` (don't scatter ignores).
  Its ignore syntax is `# ty: ignore[code]`, **not** `# type: ignore`. Prefer a `cast(...)` over a
  duck-typed attribute ty can't see.
- **pytest** collides on same-basename test files across packages → use unique basenames.

**TypeScript / bun / biome**
- **biome ignores** generated + fixture files via `files.includes` negations (`!**/routeTree.gen.ts`,
  `!**/src/generated/**`, `!**/tests/fixtures/**`, the canonical/snapshot JSONs). Add new generated paths
  there or biome will fight the generator.
- **`biome ci` prints "errors emitted" but exits 0 on warnings/infos** — trust the exit code.
- **bun workspace deps resolve only for the package that declares them** (no global `node_modules/@astra`
  symlink) — run a script from inside the declaring package.
- **TanStack Start frontends:** SSR is the default (drop any `prerender` block for Decision I — the build
  emits `dist/server/server.js`). The generated `src/routeTree.gen.ts` is committed (biome-ignored) so
  CI `tsc` passes without a generate step; it's regenerated on build. `vite.config.ts` is ESM — use
  `import.meta.dirname`, not `__dirname`.

**Deploy / infra**
- A fresh **SigNoz** won't ingest until the first org/admin is registered (`POST :10351/api/v1/register`,
  then `restart otel-collector`). Host ports live in the **10350–10399** band.
- `sops` decrypts via the age key file directly (no `age` binary needed; `rage`/`rage-keygen` are the
  installed impl).

---

## 9. Memory & docs (project-local — astra owns its own)

Memory lives **in this repo** at `thoughts/shared/memory/`, not in `~/.claude` or faerrin. One fact per
file (frontmatter + body), with a one-line pointer in `MEMORY.md` (auto-loaded each session). Types:
`user` / `feedback` (how to work — include the why + how-to-apply) / `project` / `reference`. When you
finish a subsystem, **add its load-bearing gotchas to the spine memory** and write any new feedback
lessons. Don't duplicate what the code/git already records.

`thoughts/` also holds the migration **plans** (`thoughts/astra/plans/`), **specs**
(`thoughts/astra/specs/`), and **research** (`thoughts/shared/research/`).

---

## 10. Version control

Plain **git** on GitHub (`github.com:jbassin/astra`), trunk-based on `main`, **Conventional Commits**
(commitlint-enforced). Commit trailers (per `CLAUDE.md`'s session config) end commits/PRs as configured.
Cadence: commit each green slice, push on chunk completion (§3). Reproduce CI locally first; confirm push
+ one status check; don't babysit the GHA run.

---

## 11. Layout

```
apps/        # per-subsystem apps (py or ts, manifest-decided); frontends are SSR services
libs/py/     # observe, config, llm, ontology  (+ _smoke)
libs/ts/     # observe, config, gothic, vellum-lang  (+ _smoke)
ontology/    # ontology-being (table META), ontology-config (KDL config/secret refs)
dagster/     # Dagster code location (loads each pipeline app's assets; schedules/sensors)
deploy/      # docker-compose.yml, otel-collector.yaml, SOPS
sites.caddyfile  # host-edge config for the shared reverse proxy (`just caddy-reload`)
thoughts/    # plans + specs + research + memory
dist/        # site build output (gitignored)
```

---

## 12. Quick reference

| Need | Where |
|---|---|
| **Resume / pick up work** | **`thoughts/shared/RESUME.md`** (current state + next action) |
| The plan / decisions ledger | `thoughts/astra/plans/0000-astra-migration-roadmap.md` |
| A subsystem's contract | `thoughts/astra/specs/NNNN-*-spec.md` |
| Why a decision was made | the roadmap decisions table + the spec + the spine memory |
| The faerrin source to port | `/ruby/data/experiments/faerrin/pkg/<name>` |
| How an already-built app is structured | `apps/scribe`, `apps/linguist`, `apps/mouthpiece-backend`, `apps/strider` |
| Accumulated facts + feedback | `thoughts/shared/memory/` (indexed by `MEMORY.md`) |
| Observability | the `signoz_*` MCP tools ([[signoz-mcp]]), not curl/clickhouse |
