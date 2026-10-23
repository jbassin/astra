# CLAUDE.md

Root guidance for **astra** — the campaign's live stack (a completed 2026 re-architecture of its
now-decommissioned predecessor, faerrin). astra is a **polyglot monorepo**: Python (data + LLM, managed by **uv**) and TypeScript (web servers +
frontends, managed by **pnpm**) — two primary toolchains, plus a third, **deliberately confined** one:
Rust, for the `libs/rust/weal-engine` crate only (0032), compiled to a **committed** wasm artifact
(`libs/ts/weal-engine/gen/`) that the pnpm workspace consumes — cargo is needed only when the engine
changes, and CI lanes are unchanged (no Rust CI lane). Read [`ASTRA.md`](./ASTRA.md) for the
product vision and [`thoughts/astra/plans/`](./thoughts/astra/plans/) for the migration roadmap (`0000`)
and per-subsystem sub-plans. **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** is the practical onboarding guide —
the dev process, exact CI commands, working-style expectations, and the load-bearing gotchas catalog.

## Version control: plain git + conventional commits (NOT jj)

astra uses **plain git** on GitHub — no jujutsu. Commit
messages follow **Conventional Commits** (`type(scope): subject`, lower-case subject start, lines ≤ 100
chars); CI and `just ci` lint them with commitlint. Two hooks in `.githooks/` (installed by
`just bootstrap` and the root `package.json` `prepare` script → `git config core.hooksPath .githooks`):
- **pre-commit** runs `just check`, the fast **format/lint** gate for both lanes — **oxlint**
  (`--type-aware --deny-warnings`, so warnings block too) + **oxfmt** (`--check`) for TS and **ruff**
  (check + format) for Python. Check-only (never modifies files); fix with `just fix`.
- **pre-push** runs `just ci`: everything CI runs, so a red commit never reaches GitHub.

Bypass either in a genuine emergency with `--no-verify`.

## Memory + thoughts (project-local — astra owns its own)

Project memory and planning docs live **in this repo**, not in the harness default `~/.claude/…`. The memory index is auto-loaded each session via this import:

@thoughts/shared/memory/MEMORY.md

- **Writing memory:** create/update one-fact-per-file memories under `thoughts/shared/memory/` (harness
  format — frontmatter + body), and add a one-line pointer in `MEMORY.md`. Do **not** write astra memory
  to `~/.claude`.
- `thoughts/` is also the home for the migration **plans + specs** (`thoughts/astra/{plans,specs}`) and
  **research** (`thoughts/shared/research/`). astra is the single canonical home for all of these.

## How work gets done

Plan in the conversation, ship in small slices, and let CI be the gate. Don't use `octo:*` skills,
and don't write scope, spec or research documents or decision IDs by default.

1. **Plan.** Agree on the plan in the conversation. Check every claim against the real repo before
   planning on it: read the code, load the config, run the command. Don't list questions you could
   answer now. Write a document only when the work spans sessions: one file with the plan and a
   checklist, kept current as slices land (the model is section 0.1 of
   `thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md`).
2. **Ask only for real decisions.** Product, cost and stakeholder calls belong to Josh. Use the
   question tool for short choices and plain text when the choice needs context. Everything else, decide
   and say what you decided.
3. **Slice.** A slice is one coherent change that leaves `main` green. Build the agreed scope in full;
   if part of it won't fit, say so and ask rather than dropping it quietly. Copy the nearest existing
   astra pattern rather than inventing a new one.
4. **Delegate.** For work with more than one slice, the main session orchestrates and agents implement.
   - Give each independent slice its own agent in its own git worktree. The pre-commit hook lints the
     whole tree, so agents that share a tree block each other's commits.
   - The brief states the goal, what is already ruled out, the files the agent owns, how to verify, and
     the hard rules: no git outside its worktree, no `git stash`, no push, no deploy. The agent reports
     its branch, commit, verification evidence and anything surprising.
   - No checkout holds runtime data: it all lives under `/ruby/data/astra-state` (`config.kdl`
     `data.root`: recordings, episodes, corpora, audio, the astra-data clone). Point agents at those
     paths, read-only, when they need it.
   - Review each diff, cherry-pick it onto `main`, then run `just ci` on the merged result before
     pushing. Each agent proved only its own slice.
   - Run live steps from the main session. The auto-mode classifier blocks subagents from deploying.
5. **Review where the risk is.** Security and auth changes, data migrations, and anything that replaces
   live content get an independent review before merge. Give the reviewer the code and the goal, not
   your conclusion. Everything else relies on tests and CI.
6. **Gate every commit and push.** Run `just ci` (or at least the touched lanes' `just <job>`
   recipes) before committing, and never commit a red lane; the pre-push hook runs `just ci`. Commit each green slice as you go and push when a chunk is
   done; don't build up unpushed work. After a push, confirm it and check the CI run once; don't poll.
   The bots (`linguist-commit`, heartwood) commit and push only the separate `astra-data` repo (the
   pipeline's published output and the wiki, live clone `/ruby/data/astra-state/astra-data`); they
   never run git in this repo.
7. **Live steps.** Routine live infrastructure work that carries out an agreed plan needs no approval:
   `just up`, edge edits with `just caddy-reload`, installing or removing systemd units, image rebuilds,
   pruning dangling images and build cache, and pushing green commits. State each step in one line as you
   run it. Before rebuilding Dagster, check for in-flight runs. Spending money or replacing published
   content (TTS renders, episodes, snapshots) gets an explicit flag first. Irreversible data loss
   (dropping a volume or database, `prune -a` on the shared Docker daemon) needs an explicit yes.
8. **Wrap up.** Tick the plan's checklist, record load-bearing gotchas in memory (edit entries in place:
   a memory entry describes the current state), then commit and push.

## Two toolchains, disjoint workspaces

- **Python (uv):** virtual workspace at the root `pyproject.toml`; members `apps/*`, `libs/py/*`,
  `ontology/*`. Lint+format = **ruff**, type-check = **ty** (Astral; preview, pinned), tests = **pytest**
  in `importlib` import mode (a test can't import a sibling test module by bare name; shared helpers
  need a `tests/__init__.py` and relative imports). Python is **3.12** everywhere (`.python-version`).
  `just py-lint` / `py-typecheck` / `py-test`.
- **TypeScript (pnpm):** workspace at `pnpm-workspace.yaml` (`apps/*`, `libs/ts/*`); root `package.json`
  pins the exact version via `packageManager` + corepack. Lint = **oxlint** (`--type-aware
  --deny-warnings`), format = **oxfmt** (`sortImports` on) — deliberately two tools (both VoidZero/oxc,
  biome retired at 0022 S13). Type-check = `tsc --noEmit` against `tsconfig.base.json` (strict), stays
  the gate. **typecheck/test/build fan out with `pnpm -r --no-bail --aggregate-output run <task>`**
  (0037: `vp run -r` stopped at the first failing package and hid the rest; `vite-plus` is still a
  devDependency until it is removed). Lint/format stay **direct** oxlint/oxfmt — the explicit globs
  in the root `package.json` scripts are what keep oxfmt off markdown/toml/the SOPS file.
  `just ts-typecheck` / `ts-lint` / `ts-test` / `ts-build`.
- **Disjoint globs, manifest-decided membership.** Both lanes glob `apps/*`; a directory belongs to
  whichever lane its manifest declares (`pyproject.toml` → uv; `package.json` → pnpm). They never
  cross-claim.
- **uv rejects empty members (gotcha).** A glob-matched *directory* lacking a `pyproject.toml` is a hard
  `uv` error — so **do not pre-create empty placeholder member dirs**; create a member dir only when you
  give it a manifest. Glob roots (`apps/`, `libs/py/`, `ontology/`) are kept in git via a `.gitkeep`
  *file* (a dotfile isn't matched by `*`). pnpm silently ignores manifest-less dirs, so this is uv-only.

## Runtime split (roadmap Decision H) vs CI

Three non-overlapping concerns; **SigNoz/OTel is the single pane across all three**, not one runtime:

- **Pipeline** (craig → scribe → linguist → akasha → mouthpiece) = a **Dagster** asset graph, one
  partition per session/date, scheduled/sensor-triggered, with lineage. *(This supersedes the older
  "windmill" mention in earlier drafts of `ASTRA.md`.)*
- **Long-running services** (Discord bots, overlay SSE, vellum render service, DBs, **the SSR frontends** —
  Decision I) = **Docker Compose** units (`restart: unless-stopped` + healthchecks).
- **Edge** = **Caddy** (TLS + reverse-proxying service APIs **+ the SSR frontend servers**). *(Frontends are
  SSR Compose services now, not prerendered static `dist/` — Decision I, decided on 0014.)*
- **CI** = GitHub Actions (`.github/workflows/ci.yml`) — parallel, path-filtered jobs.

## Standing principles (apply in every subsystem)

1. **Telemetry from day one.** Every app imports `libs/{py,ts}/observe` before anything else; no app
   ships without OTel wired to SigNoz.
2. **KDL at the edges.** Parse KDL → validate into Pydantic/Zod immediately; never thread raw KDL nodes
   through code. Secrets are `ref=` pointers resolved from a **SOPS**-decrypted file at load — no
   plaintext in git.
3. **All LLM calls** go through `libs/py/llm` (litellm + dspy); never call a provider SDK directly.
4. **strider is the frontend template** — every TanStack frontend follows its build-time-content →
   generated-modules → route-loader pattern, and runs **SSR as a Compose service behind Caddy** with
   client RUM (Decision I — not prerendered static `dist/`).
5. **Preserve identity keys.** `player_id` integers are load-bearing FKs; carry them verbatim.

## Layout

```
apps/        # per-subsystem apps (py or ts, manifest-decided); sites build to dist/
libs/py/     # observe, config, llm  (+ _smoke)
libs/ts/     # observe, config, gothic, vellum-lang  (+ _smoke); weal-engine = committed wasm artifact
libs/rust/   # weal-engine — the ONLY Rust in the repo (0032); builds via `just weal-engine-build`
ontology/    # ontology-being, ontology-config (py truth + config stores)
dagster/     # Dagster definitions (loads each pipeline app's assets; schedules/sensors)
deploy/      # docker-compose.yml (Dagster + SigNoz + services), otel-collector.yaml, SOPS
sites.caddyfile  # host-edge config for the shared reverse proxy; `just caddy-reload`
.github/     # CI workflow (each job runs a `just <job>` recipe) + composite setup-{uv,pnpm,just}
thoughts/    # research + per-subsystem plans + specs + memory
dist/        # all site-gen output (gitignored), served by Caddy
```

## Pins (set in Phase 0; TS toolchain finalized 0022 S15)

- The host toolchain is declared in **`mise.toml`** (pnpm, uv, just, sops, deno, jq, wasm-bindgen,
  wasm-opt); **`just bootstrap`** installs it and both workspaces on a fresh clone.
- Python **3.12** (`.python-version`; production runs `python:3.12-slim`; `requires-python` stays
  `>=3.12`); **ty** pinned (`==0.0.51`, preview — bump deliberately).
- Node **24** (`.node-version` + root `engines.node`); pnpm **10.34.4** (root `packageManager` +
  corepack; `mise.toml` repeats it); uv **0.11.19** and just **1.23.0** (`mise.toml`, repeated in
  `.github/actions/setup-{uv,just}`); oxlint **^1.72.0** + oxfmt **^0.57.0** (+ oxlint-tsgolint
  **^0.24.0** for type-aware lint); typescript **5.x**; `vite-plus` **0.2.2** is a leftover
  devDependency (no longer the orchestrator; `pnpm -r` replaced it).
- Rust **1.96.0** (pinned via `libs/rust/weal-engine/rust-toolchain.toml`) for the weal-engine crate
  ONLY — compiled to the committed `libs/ts/weal-engine/gen/` wasm via `just weal-engine-build`
  (wasm-bindgen-cli **0.2.127** + binaryen wasm-opt **124**, both hard-pinned in the recipe). cargo
  runs only when the engine changes; **no Rust CI lane** — the local gate
  (`cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`) is recorded per
  slice, and a vitest wasm smoke guards the committed artifact in CI.
- Reproduce CI locally: **`just ci`**. Each CI job runs the `just` recipe of the same name, so this
  is exactly what `.github/workflows/ci.yml` runs (`ci-ok` sums the jobs up), minus the path filters
  and the vellum render goldens, which need CI's node:24-slim container. `just check` is the fast
  lint subset, `just fix` applies the formatters, `just test` runs both test lanes.
