# Development

How to set up, check, test and extend astra. The process rules (planning, slices, review, live
steps) are in [`CLAUDE.md`](../CLAUDE.md) under "How work gets done"; this file is the toolchain
and its traps.

## Setup

```sh
mise trust && mise install   # host tools from mise.toml; then activate mise in your shell
just bootstrap               # uv sync, pnpm install, the codex guards' Chromium, the git hooks
```

`mise.toml` pins pnpm, uv, just, sops, deno, jq and the wasm tools. Python comes from
`.python-version` (3.12) and Node from `.node-version` (24). Rust (rustup reads the crate's
`rust-toolchain.toml`) and tectonic (assay's book export) are not in `mise.toml`; install them by hand
when you need them. Until mise is active in your shell, pyenv shims fail on a bare `python3` inside
the repo; use `uv run python`.

## Everyday commands

```sh
just check   # format + lint gate over the whole tree (the pre-commit hook runs it on staged files)
just fix     # apply formatters and safe autofixes for both lanes
just test    # both test lanes
just ci      # everything CI runs, plus commitlint over origin/main..HEAD (pre-push runs it)
just dev <domain>/<role>       # one TS app's dev server, e.g. just dev codex/web
uv run pytest apps/<domain>/py # one Python app (they run as Dagster assets, no dev server)
```

Each CI job in `.github/workflows/ci.yml` runs the `just` recipe of the same name, so `just ci`
runs the same commands. Differences: CI path-filters its jobs while `just ci` runs them all, and
`vellum-visual-regression` stays CI-only because its goldens are pinned to the `node:24-slim`
container's Chromium and fonts. `ci-ok` is the one CI job that sums up the others; a new job must be
added to its `needs`.

## Hooks

`just bootstrap` and pnpm's `prepare` script run `git config core.hooksPath .githooks`.

- **pre-commit** checks only the staged content: oxlint (`--type-aware --deny-warnings
  --report-unused-disable-directives`) and oxfmt `--check` for TypeScript, `ruff check` and
  `ruff format --check` for Python. It never edits files; fix with `just fix` and stage the result.
- **pre-push** runs `just ci`.
- **GitHub** then gates `main` with the ruleset `main`: changes arrive only through pull requests
  that pass `ci-ok`, merged by rebase, with no force pushes or deletion. Branches don't need to be
  current with `main`. Only admins can bypass it, and only by merging a pull request
  (`gh pr merge --admin`). Auto-merge is on, and merged branches are deleted.
- Bypass either only in a real emergency with `--no-verify`.

Commit messages follow Conventional Commits; commitlint enforces a lower-case subject start and
body lines of at most 100 characters.

## Toolchains

Two disjoint workspaces share the tree. Apps live at `apps/<domain>/<role>/`
([ADR 0015](adr/0015-repo-layout-by-domain.md)): the Python one is `apps/<domain>/py/`, the
TypeScript ones are `web`, `bot`, `overlay`, `render`, `controller` and portal's four parts. The
location decides the lane, so neither workspace keeps a list of apps.

**Pins.** uv 0.11.19 and just 1.23.0 (`mise.toml`, repeated in `.github/actions/setup-{uv,just}`);
pnpm 10.34.4 (root `packageManager`, repeated in `mise.toml`); Node 24; Python 3.12 (production runs
`python:3.12-slim`); ty `==0.0.51`; oxlint `^1.72.0`, oxfmt `^0.57.0`, oxlint-tsgolint `^0.24.0`;
TypeScript 5; Rust 1.96.0 with wasm-bindgen-cli 0.2.127 and wasm-opt 124 (hard-pinned in
`just weal-engine-build`). Bump a pin deliberately, in every place that repeats it.

**Python (uv).** Virtual workspace in the root `pyproject.toml`; members `apps/*/py`, `libs/py/*`,
`ontology/*`. ruff (line length 100) lints and formats, ty (pinned `==0.0.51`, preview) type-checks,
pytest tests in `importlib` mode.

**TypeScript (pnpm).** Workspace in `pnpm-workspace.yaml`; members `apps/*/*` (a directory without
a `package.json` is skipped) and `libs/ts/*`. Node 24 and pnpm 10.34.4 (root `packageManager`). oxlint and oxfmt lint and format;
`tsc --noEmit` against `tsconfig.base.json` (strict) type-checks; vitest tests. typecheck, test and
build fan out with `pnpm -r --no-bail --aggregate-output run <task>`. `vite-plus` is still a root
devDependency but nothing runs it.

**Rust.** Only `libs/rust/weal-engine` (toolchain 1.96.0 via its `rust-toolchain.toml`). Rebuild the
committed wasm in `libs/ts/weal-engine/gen/` with `just weal-engine-build`, never by hand. There is
no Rust CI lane yet; before committing an engine change run, in the crate dir:
`cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`.
See [`libs/rust/weal-engine/README.md`](../libs/rust/weal-engine/README.md).

## Standing conventions

- **Telemetry in the running process.** Call `init_telemetry("astra.<sub>")` /
  `initTelemetry("astra.<sub>")` in the process that runs the code: the service entrypoint, the
  Dagster code location (`dagster/definitions.py`), a CLI's `main()`. Importing observe does nothing
  by itself. Wire spans, metrics and logs. Short-lived processes must call `shutdown()` or buffered
  exports are lost.
- **TS metrics use `lazyCounter` / `lazyHistogram`** from `@astra/observe`. A
  `getMeter().createCounter()` at module scope runs before `initTelemetry` (import hoisting) and
  stays a no-op forever. `getTracer` and `getLogger` at module scope are fine. Python logs export
  only through `logging.getLogger("astra.<sub>")`; TS `console.log` does not export.
- **Config single source.** Every config value, including tuning constants, ports and paths, lives
  in `ontology/ontology-config/config.kdl` and is read through `astra_config` (Python) or
  `@astra/config` (TypeScript). Both schema mirrors must stay in step. Only the config libraries
  read the environment (the upper-cased secret override).
- **Secrets** are `ref="sops:KEY"` pointers in `config.kdl`; see
  [ADR 0005](adr/0005-sops-secrets-injected-at-deploy.md).
- **KDL at the edges.** Parse KDL and validate into Pydantic or Zod immediately; never pass raw KDL
  nodes around.
- **LLM calls** go through `libs/py/llm`; never call a provider SDK directly. Its client owns the
  `max_tokens` guard, caching and cost telemetry; `make_dspy_lm` returns a bare `dspy.LM` that
  skips them.
- **Identity keys.** `player_id` integers are foreign keys; carry them verbatim.
- **Frontends** follow the strider pattern (build-time content, generated modules, route loaders)
  and run as SSR Compose services ([ADR 0009](adr/0009-ssr-frontends.md)). Before frontend work,
  read the TanStack Start skill bundled with the package
  (`apps/<domain>/web/node_modules/@tanstack/react-start/skills/react-start/SKILL.md`); server
  logic is `createServerFn`.

## Adding an app

Put the app at `apps/<domain>/<role>/`: `py` for a Python app, `web` for a frontend, or a name
for what it is (`bot`, `overlay`, `render`, `controller`). Its manifest (`pyproject.toml` or
`package.json`) makes it a uv or pnpm member; no workspace list needs editing. uv rejects a
`apps/*/py` directory without a `pyproject.toml`, so never create an empty one. A TypeScript app's
`tsconfig.json` extends `../../../tsconfig.base.json`, and its scripts reach the repo root with
three `../`. What is still hand-maintained:

1. A pnpm member: `COPY apps/<domain>/<role>/package.json apps/<domain>/<role>/` in every
   Dockerfile that lists workspace manifests (find them with
   `grep -rl "COPY apps/ledger/web/package.json" --include=Dockerfile`), or `--frozen-lockfile`
   fails. Add its paths to the `.dockerignore` allowlist (literal paths only, no wildcards). A new
   `libs/ts` package needs neither.
2. A Dagster asset: the asset list in `dagster/definitions.py`, and `COPY apps/<domain>/py` in
   `dagster/Dockerfile` (plus its `.dockerignore` line).
3. A service: a compose service in `deploy/docker-compose.yml` (port in 10350 to 10399, `user:
   "1000:1000"`, healthcheck, `restart: unless-stopped`, its secrets in `environment:`). A templated
   frontend Dockerfile takes `APP: <domain>/web`. Paths the container writes are identical-path bind
   mounts under `/ruby/data/astra-state`; add the dir to `deploy.sh` `init_artifacts` and to the
   `config.kdl` `data` comment. A public host is a
   `sites.caddyfile` block with `import astra_site` (plus `import local_only` for private paths); the
   `*.iridi.cc` wildcard needs no DNS step, and the certificate is issued on the first request.
   A frontend that bakes astra-data also needs `COPY --from=astra-data` in its Dockerfile,
   `additional_contexts` in compose, and matching data under `fixtures/astra-data/`.
4. Its config block in `config.kdl` and in both schema mirrors (`libs/py/config`, `libs/ts/config`;
   the Python mirror forbids unknown top-level keys, so even a TS-only app needs it).
5. At least one test: `vitest run` with no test files exits 1.
6. Telemetry in the real entrypoint. TS services get no HTTP auto-instrumentation, so add
   `startActiveSpan` spans on request paths, or traces stay empty while metrics flow. Never log ERROR
   for a user-content problem: every ERROR log pages Discord.
7. A short `README.md`: what it is, where it runs, operations, traps. Check visual changes
   (CSS, pixi) in a real browser; no unit test sees them.
8. A new CI path filter only if the app gets its own CI job (like `codex` or `vellumRender` in
   `.github/workflows/ci.yml`); the `py` and `ts` lanes already watch `apps/*/py/**` and `apps/**`.

## Traps

**Python and Dagster**
- A Dagster asset module must not use `from __future__ import annotations`; Dagster reads the
  `context` and config annotations at definition time.
- Tests are hermetic: CI has no ffmpeg, no API keys and no age key. Inject seams (stub LLM client,
  mock TTS, fake ffmpeg runner). A test that really decrypts SOPS must skip without `sops` and the
  key. Such a test passes locally and fails in CI; to reproduce CI, put a failing `sops` shim first
  on `PATH`.
- Long verbatim strings (ported prompts) are written as implicit string concatenation, so source
  lines stay under 100 characters and the string stays byte-identical.
- In `importlib` mode a test cannot import a sibling test module by bare name; put shared helpers in
  a package (`tests/__init__.py`) and import relatively.
- ty ignores use `# ty: ignore[code]`, not `# type: ignore`. For a library without stubs, alias the
  type to `Any` once.
- Lint exceptions go inline with a reason: `# noqa: <rule> -- <why>` or
  `// oxlint-disable-next-line <rule> -- <why>`. Path overrides cover only whole file categories.
  An unused suppression fails the gate.

**TypeScript and pnpm**
- Always run oxfmt through the root scripts (`pnpm run format`, `format:check`). A bare `oxfmt .`
  rewrites markdown, `pyproject.toml` files and the SOPS file.
- Generated files (`routeTree.gen.ts`, `src/generated/**`, test fixtures) are listed in
  `.oxlintrc.json` and `.oxfmtrc.json` `ignorePatterns`; add new generated paths there.
- `--type-aware` lint can die under memory pressure (exit 254, "possibly out of memory"). Retry
  before treating it as a regression.
- pnpm does not hoist: declare every import in the package that uses it, and run scripts from that
  package.
- pnpm blocks dependency install scripts unless they are listed in `pnpm.onlyBuiltDependencies` in
  the root `package.json`.
- `routeTree.gen.ts` is committed so CI typechecks without a generate step; a build regenerates it.
- The SSR smoke tests of ledger, harrow, strider and akasha read whatever `dist/` exists; after a
  dependency change run the app's build first.
- SSR HTML contains UTF-8 glyphs, so plain `grep` may treat it as binary; use `grep -a`.

**Deploy and data**
- A secret's environment variable is its SOPS key upper-cased (`portal_mcp_api_key` becomes
  `PORTAL_MCP_API_KEY`), not the config field name. A mismatch leaves the secret unset, and a
  fail-closed service crash-loops.
- An MCP client keeps the tool list it connected with; after a deploy that adds tools, reconnect
  (`/mcp` in Claude Code).
- Local edits never ship: merge the pull request, then `just deploy`. See [`deploy/README.md`](../deploy/README.md).
- Tests point `ASTRA_DATA_ROOT` at the checkout under test and never touch `/ruby/data/astra-state`.
  Without `CODEX_CORPUS_ROOT`, codex in a worktree reads the main checkout's real corpus, because
  `codex.data-path` is absolute.
- A worktree has no gitignored data (corpora, recordings); read the main checkout's copies
  read-only when needed.
