# CLAUDE.md

Root guidance for **astra** — the next-generation rebuild of [faerrin](/ruby/data/experiments/faerrin).
astra is a **polyglot monorepo**: Python (data + LLM, managed by **uv**) and TypeScript (web servers +
frontends, managed by **bun**) — two toolchains, no third language. Read [`ASTRA.md`](./ASTRA.md) for the
product vision and [`thoughts/astra/plans/`](./thoughts/astra/plans/) for the migration roadmap (`0000`)
and per-subsystem sub-plans. **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** is the practical onboarding guide —
the dev process, exact CI commands, working-style expectations, and the load-bearing gotchas catalog.

## Version control: plain git + conventional commits (NOT jj)

astra uses **plain git** on GitHub — no jujutsu. (faerrin used jj; astra deliberately does not.) Commit
messages follow **Conventional Commits** (`type(scope): subject`); CI lints them with commitlint. There
are **no local hooks** — format/lint/typecheck/test run in CI (GitHub Actions), not pre-commit.

## Memory + thoughts (project-local — astra owns its own)

Project memory and planning docs live **in this repo**, not in faerrin and not in the harness default
`~/.claude/…`. The memory index is auto-loaded each session via this import:

@thoughts/shared/memory/MEMORY.md

- **Writing memory:** create/update one-fact-per-file memories under `thoughts/shared/memory/` (harness
  format — frontmatter + body), and add a one-line pointer in `MEMORY.md`. Do **not** write astra memory
  to the faerrin repo or to `~/.claude`.
- `thoughts/` is also the home for the migration **plans + specs** (`thoughts/astra/{plans,specs}`) and
  **research** (`thoughts/shared/research/`). astra is the single canonical home for all of these.

## Development process (per subsystem)

Each subsystem moves through three gates, leaving a paper trail in `thoughts/`:

1. **Scope** — a verified pre-implementation research doc at
   `thoughts/shared/research/<date>-<subsystem>-<NNNN>-thoughts.md`: read the faerrin source + the sub-plan,
   **verify claims against the actual repos** (resolve real config/secrets, load real ontology, inspect
   real fixtures — don't list "open questions" that are checkable now), and call out decisions to revisit
   before speccing.
2. **Spec** — author the NLSpec with **`octo:spec`** → `thoughts/astra/specs/<NNNN>-<subsystem>-spec.md`,
   built on the scoping doc and the sub-plan's settled decisions.
3. **Implement** — drive the build with **`octo:embrace`** against that spec; wire telemetry from day one,
   reproduce CI lanes locally before pushing, then update the memory (`thoughts/shared/memory/`) with the
   load-bearing gotchas. Build the spec's scope **in full** — don't quietly collapse or defer pieces to fit
   a budget; surface the trade-off and ask (only spec-sanctioned deferrals are OK). And **port faerrin's
   existing implementation** rather than reinventing it — grep faerrin first.

**Version control cadence (not "commit only when asked"):** commit each CI-green slice with a Conventional
Commit message as you go, and **push when a chunk/subsystem is done** — after reproducing the CI lanes
locally (don't then watch the GHA run; confirm push + one status check, per the memory). Mirror the git
log's per-slice rhythm; don't accumulate a large uncommitted/unpushed working tree.

## Two toolchains, disjoint workspaces

- **Python (uv):** virtual workspace at the root `pyproject.toml`; members `apps/*`, `libs/py/*`,
  `ontology/*`. Lint+format = **ruff**, type-check = **ty** (Astral; preview, pinned), tests = **pytest**.
  Run `uv sync`, `uv run pytest`, `uv run ruff check`, `uv run ty check`.
- **TypeScript (bun):** workspace at the root `package.json`; members `apps/*`, `libs/ts/*`. Lint+format
  = **biome** (one fast tool, chosen over eslint+prettier). Type-check = `tsc --noEmit` against
  `tsconfig.base.json` (strict). Run `bun install`, `bun --filter '*' {typecheck,test,build,lint}`.
- **Disjoint globs, manifest-decided membership.** Both lanes glob `apps/*`; a directory belongs to
  whichever lane its manifest declares (`pyproject.toml` → uv; `package.json` → bun). They never
  cross-claim.
- **uv rejects empty members (gotcha).** A glob-matched *directory* lacking a `pyproject.toml` is a hard
  `uv` error — so **do not pre-create empty placeholder member dirs**; create a member dir only when you
  give it a manifest. Glob roots (`apps/`, `libs/py/`, `ontology/`) are kept in git via a `.gitkeep`
  *file* (a dotfile isn't matched by `*`). bun silently ignores manifest-less dirs, so this is uv-only.

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
libs/ts/     # observe, config, gothic, vellum-lang  (+ _smoke)
ontology/    # ontology-being, ontology-config (py truth + config stores)
dagster/     # Dagster definitions (loads each pipeline app's assets; schedules/sensors)
deploy/      # docker-compose.yml, otel-collector.yaml, SOPS, Caddyfile.example
.github/     # CI workflow + composite setup-{uv,bun} actions
thoughts/    # research + per-subsystem plans (carried from faerrin)
dist/        # all site-gen output (gitignored), served by Caddy
```

## Pins (set in Phase 0)

- Python ≥ 3.12; **ty** pinned (`==0.0.51`, preview — bump deliberately).
- bun **1.3.14**; biome **2.x**; typescript **5.x**.
- Reproduce CI locally:
  `uv run ruff check && uv run ruff format --check && uv run ty check && uv run pytest` and
  `bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && bun --filter '*' build`.
