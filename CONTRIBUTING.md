# Contributing to astra

A practical guide to doing work in this repo — the workflow, conventions, exact commands, and the
load-bearing gotchas that aren't obvious until you hit them. `CLAUDE.md` is the authoritative
conventions file (and is loaded into every agent session); **this doc is the "how to actually pick up
and ship work here" companion.** Read both.

---

## 1. What astra is (orient first)

astra is the campaign's live stack — a **polyglot monorepo**: Python (data + LLM, managed by **uv**) and
TypeScript (web, managed by **pnpm**), two primary toolchains — plus one deliberately confined third:
Rust, for the `libs/rust/weal-engine` crate only (§4). It began as a re-architecture of
its predecessor (faerrin, since decommissioned and deleted); that migration is long complete, and new work
builds on astra's own established subsystems and patterns.

**Read order before touching a subsystem:**
1. `ASTRA.md` — product vision.
2. `CLAUDE.md` — conventions (authoritative).
3. `thoughts/astra/plans/0000-astra-migration-roadmap.md` — the spine: phases, the **decisions ledger
   (A–I)**, critical path, cutover runbook.
4. `thoughts/shared/memory/MEMORY.md` + the memories it indexes — accumulated facts + feedback.
5. The subsystem's **sub-plan** (`thoughts/astra/plans/NNNN-*.md`), **spec** (`thoughts/astra/specs/`),
   and **pre-impl thoughts** (`thoughts/shared/research/`) if they exist.

**Migration status:** COMPLETE (2026-06-23, Phases 0–6). astra is the live stack — every public host
serves, the pipeline + bots run with SigNoz telemetry, all data migrated. See the spine memory
([[astra-migration-research]]) and `thoughts/shared/RESUME.md` for what's current.

---

## 2. The development process (per subsystem)

Every subsystem moves through three gates, each leaving a doc in `thoughts/`:

1. **Scope** → `thoughts/shared/research/<date>-<subsystem>-<NNNN>-thoughts.md`. Read the sub-plan + any
   prior art, **verify every claim against the actual repo** (resolve real config/secrets, load real
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

- **Reuse what exists; don't reinvent.** For any derivation/transform/algorithm, check whether an
  already-built astra subsystem (or lib) has it and mirror the nearest precedent — bespoke parallel
  helpers drift and diverge.
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
declares** (`pyproject.toml` → uv; `package.json` → pnpm). They never cross-claim.

**Host toolchain:** `mise.toml` declares it (pnpm, uv, just, sops, deno, jq, and the wasm tools for
`just weal-engine-build`); Python and Node come from `.python-version` (3.12) and `.node-version` (24).
On a fresh clone run `mise trust && mise install`, activate mise in your shell, then
**`just bootstrap`** (toolchain, `uv sync`, `pnpm install`, the codex guards' Chromium, the git hooks).
Rust (rustup reads the crate's `rust-toolchain.toml`) and tectonic (assay's book export) are not in
`mise.toml`; install them by hand if you need them.

- **Python (uv):** virtual workspace at root `pyproject.toml`; members `apps/*`, `libs/py/*`, `ontology/*`.
  Lint+format **ruff**, type-check **ty** (Astral, preview, pinned `==0.0.51`), tests **pytest**
  (`importlib` import mode). Python **3.12** everywhere: dev and CI via `.python-version`, production
  via the `python:3.12-slim` Dagster image.
- **TypeScript (pnpm):** workspace at `pnpm-workspace.yaml`; members `apps/*`, `libs/ts/*`. Lint
  **oxlint** (`--type-aware --deny-warnings`), format **oxfmt** (`sortImports` on) — deliberately two
  tools, both VoidZero/oxc (biome retired 0022 S13). Type-check `tsc --noEmit` against
  `tsconfig.base.json` (strict). typecheck/test/build fan out with
  `pnpm -r --no-bail --aggregate-output run <task>` (0037 replaced `vp run -r`, which stopped at the
  first failing package). Pins: Node **24**, pnpm **10.34.4** (root `packageManager` + corepack),
  oxlint **^1.72.0**, oxfmt **^0.57.0**, oxlint-tsgolint **^0.24.0**, typescript **5.x**.
  `vite-plus` 0.2.2 is still a root devDependency until it is removed; nothing runs it.

**uv rejects empty members** (a glob-matched dir without a `pyproject.toml` is a hard error) → don't
pre-create placeholder member dirs; keep glob roots in git with a `.gitkeep` *file*. pnpm ignores
manifest-less dirs, so this is uv-only.

**Rust (confined — the weal engine only, 0032):** `libs/rust/weal-engine/` is the repo's ONLY Rust — the
weal v2 dice-language engine, compiled to wasm and **committed** under `libs/ts/weal-engine/gen/` (the
`@astra/weal-engine` pnpm member consumes it; no app ever runs cargo). Toolchain pinned **1.96.0** via
`rust-toolchain.toml`. Rebuild the artifact with **`just weal-engine-build`** (pinned wasm-bindgen-cli
0.2.127 + wasm-opt 124, hard-required; deterministic — two runs are byte-identical). **Never hand-edit
`gen/`** — it's a build product in git; always regenerate via the recipe. There is **no Rust CI lane**;
the local gate is
`cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`
(run from the crate dir, recorded per slice) — a vitest wasm smoke guards the committed artifact in CI.
See `libs/rust/weal-engine/README.md`.

---

## 5. Reproduce CI locally (do this before every push)

```bash
just ci      # everything CI runs; the pre-push hook runs it too
just check   # the fast format + lint gate over the whole tree (pre-commit runs it on staged files)
just fix     # apply the formatters and safe autofixes for both lanes
just test    # both test lanes
```

Each CI job (`.github/workflows/ci.yml`) runs the `just` recipe with the same name (`just py-test`,
`just ts-lint`, `just codex-row-height-drift-guard`, …), so CI and `just ci` run the same commands.
Two differences: CI path-filters its jobs while `just ci` always runs them all, and the
`vellum-visual-regression` job stays CI-only because its goldens are pinned to the node:24-slim
container's Chromium and fonts. `just ci` also lints your commits with commitlint over
`origin/main..HEAD` (pass another base with `just ci <base>`).

Two hooks in `.githooks/` gate your work; `just bootstrap` (and `pnpm install`'s `prepare` script)
installs them with `git config core.hooksPath .githooks`:

- **pre-commit** runs the `just check` tools on the **staged files only**: `oxlint --type-aware
  --deny-warnings --report-unused-disable-directives` + `oxfmt --check` (TS, same scope as the root
  `package.json` scripts) and `ruff check` + `ruff format --check` (Python). It checks the staged
  content: a partially staged file is checked as staged, and unstaged or untracked files never block
  the commit. For oxlint, a partially staged file is linted through a temporary sibling copy named
  `<name>.__staged__.<ext>`, removed when the hook exits. It's check-only (never edits files); fix
  with `just fix`, then stage the result.
- **Lint exceptions** go inline at the exact line, with a reason:
  `// oxlint-disable-next-line <rule> -- <why>` (in JSX children, `{/* … */}`) or
  `# noqa: <rule> -- <why>`. `.oxlintrc.json` overrides and ruff `per-file-ignores` cover only whole
  categories of file (tests, scripts, CLI entry points). Unused suppressions fail the gate.
- **pre-push** runs `just ci`.

Bypass either in a genuine emergency with `--no-verify` (`git commit --no-verify`,
`git push --no-verify`).

Run one TS app's dev server with `just dev <app>` (e.g. `just dev codex`). The Python apps have no dev
server; they run as Dagster assets, so test them with `uv run pytest apps/<app>`.

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
- **pytest** runs in `importlib` mode: a test can't import a sibling test module by bare name. Put
  shared helpers in a package (`tests/__init__.py`) and import them relatively (`from .helpers import x`).

**TypeScript / pnpm / oxlint+oxfmt**
- **oxlint/oxfmt ignore** generated + fixture files via `.oxlintrc.json`'s `ignorePatterns` /
  `.oxfmtrc.json`'s `ignorePatterns` (`**/routeTree.gen.ts`, `**/src/generated/**`,
  `**/tests/fixtures/**`, the canonical/snapshot JSONs — mirrors biome's old `files.includes`
  negations 1:1). Add new generated paths there or oxlint/oxfmt will fight the generator.
- **plain `oxlint` exits 0 on warnings** — `--deny-warnings` is required to fail the exit code on a
  warning-level rule, and both pre-commit and CI pass it (D6, unified strict — biome's old asymmetry,
  where CI ran plain `biome ci .` but pre-commit ran `--error-on-warnings`, is gone). Similarly
  `oxfmt --check` (not a bare `oxfmt`) is what fails on unformatted files.
- **`--type-aware` can flake under memory pressure** — the tsgolint child occasionally dies with
  `[warn] Linter process terminated abnormally (possibly out of memory)` (exit 254, seen while docker
  builds ran alongside). It is transient: retry before treating a red lint as a regression; a clean run
  prints no warn line.
- **oxfmt is glob-scoped, never bare** — `pnpm run format` / `format:check` wrap oxfmt with explicit
  `apps/**` / `libs/ts/**` / root JS-family globs; a bare `oxfmt .` would rewrite ~110 markdown files,
  every `pyproject.toml`, and the SOPS `secrets.enc.yaml` (confirmed on disk, 0022 R5). Always invoke
  oxfmt through the root scripts, never directly over `.`.
- **pnpm workspace deps resolve only for the package that declares them** (strict, non-hoisting layout —
  no global `node_modules/@astra` symlink) — run a script from inside the declaring package, and declare
  every import explicitly in that package's `package.json` (a phantom dep that happened to resolve via
  hoisting under bun/npm will hard-fail under pnpm).
- **pnpm blocks dependency lifecycle (install/postinstall) scripts by default** — a dep that needs one
  (e.g. `esbuild`'s platform-binary postinstall) silently no-ops until approved via
  `pnpm.onlyBuiltDependencies` in root `package.json` (never `pnpm approve-builds`'s interactive picker
  in an automated context — it can silently write to `ignoredBuiltDependencies` instead if nothing's
  selected).
- **TanStack Start frontends:** SSR is the default (drop any `prerender` block for Decision I — the build
  emits `dist/server/server.js`). The generated `src/routeTree.gen.ts` is committed (oxlint/oxfmt-ignored)
  so CI `tsc` passes without a generate step; it's regenerated on build. `vite.config.ts` is ESM — use
  `import.meta.dirname`, not `__dirname`.

**Deploy / infra**
- Production builds only from the deploy checkout `/ruby/data/astra-deploy` at a pushed commit:
  `just deploy [service…]` (`deploy/deploy.sh`). Push before you deploy; local edits never ship.
  Every host unit (the bots, watchdog, backup) runs from that checkout as well.
- All runtime data lives under `/ruby/data/astra-state` (`config.kdl` `data.root`; the layout is in
  the comment on its `data` block), never in a checkout. pytest points `ASTRA_DATA_ROOT` at the
  checkout under test, so tests never touch it.
- A fresh **SigNoz** won't ingest until the first org/admin is registered (`POST :10351/api/v1/register`,
  then `restart otel-collector`). Host ports live in the **10350–10399** band.
- `sops` decrypts via the age key file directly (no `age` binary needed; `rage`/`rage-keygen` are the
  installed impl).

---

## 9. Memory & docs (project-local — astra owns its own)

Memory lives **in this repo** at `thoughts/shared/memory/`, not in `~/.claude`. One fact per
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
libs/ts/     # observe, config, gothic, vellum-lang  (+ _smoke); weal-engine = committed wasm
libs/rust/   # weal-engine — the only Rust (0032); rebuild via `just weal-engine-build`
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
| How an already-built app is structured | `apps/scribe`, `apps/linguist`, `apps/mouthpiece-backend`, `apps/strider` |
| Accumulated facts + feedback | `thoughts/shared/memory/` (indexed by `MEMORY.md`) |
| Observability | the `signoz_*` MCP tools ([[signoz-mcp]]), not curl/clickhouse |
