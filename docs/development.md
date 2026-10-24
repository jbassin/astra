# Development

How to set up, check, test and extend astra. The process rules (planning, slices, review, live
steps) are in [`CLAUDE.md`](../CLAUDE.md) under "How work gets done"; this file is the toolchain
and its traps.

## Setup

```sh
mise trust && mise install   # host tools from mise.toml; then activate mise in your shell
just bootstrap               # uv sync, pnpm install, the codex guards' Chromium, the git hooks
just doctor                  # read-only check: tool versions vs mise.toml, binds, units, certs
```

`mise.toml` pins pnpm, uv, just, sops, deno, jq and the wasm tools. Python comes from
`.python-version` (3.12) and Node from `.node-version` (24). Rust (rustup reads the crate's
`rust-toolchain.toml`) and tectonic 0.17.0 (`just book`) are not in `mise.toml`; install them by
hand when you need them. Until mise is active in your shell, pyenv shims fail on a bare `python3`
inside the repo; use `uv run python`.

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
container's Chromium and fonts. `just ci` also runs the weal-engine crate's cargo gate, so the host
needs rustup. `pg-test` runs the `*.pg.test.ts` suites against a real Postgres: CI gives it a
`services: postgres` container, and locally the recipe starts a throwaway one, so `just ci` needs
Docker. `infra-check` needs it too: it runs shellcheck, hadolint, the edge's Caddy and
`systemd-analyze` from pinned images (deploy/README.md says what it checks). Shell-script
findings are fixed or disabled inline with a reason (`# shellcheck disable=SCxxxx # why`), and
Dockerfile ones the same way (`# hadolint ignore=DLxxxx` under a comment that says why). `ci-ok` is the one CI job that sums up the others; a new job must be added to its `needs`.

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

**Python (uv).** Virtual workspace in the root `pyproject.toml`; members `apps/*/py`, `apps/*/tools`
(hand-run tools the Dagster image does not install), `libs/py/*`, `ontology/*` and `dagster` (the
code location, `astra-pipeline`). ruff (line length 100) lints and formats, ty (pinned `==0.0.51`, preview) type-checks,
pytest tests in `importlib` mode. The root `[tool.uv.sources]` is the only sources table: it marks
every member package `{ workspace = true }` and members inherit it, so a member lists an `astra-*`
dependency by name only. A new member gets a line there.

**TypeScript (pnpm).** Workspace in `pnpm-workspace.yaml`; members `apps/*/*` (a directory without
a `package.json` is skipped) and `libs/ts/*`. Node 24 and pnpm 10.34.4 (root `packageManager`). oxlint and oxfmt lint and format;
`tsc --noEmit` against `tsconfig.base.json` (strict) type-checks; vitest tests. typecheck and build
fan out with `pnpm -r --no-bail --aggregate-output run <task>`. Tests run in one vitest process from
the root `vitest.config.ts` (`just ts-test`, or `pnpm vitest run` at the root): every workspace
package with a `test` script is a project with its own config, globalSetup and environment, and
the run fails when a project has no test files (`vitest.empty-projects.ts`). A package with nothing
to build has no `build` script; `pnpm -r run build` skips it, and `deploy/node.Dockerfile` runs
`pnpm run --if-present build`.
`pnpm --filter <pkg> test` still runs one package alone. A dependency that two or more packages use has one version, in
the `catalog:` of `pnpm-workspace.yaml`, and each package.json names it `"catalog:"`; bump it there.
zod is off the catalog until its users converge (codex and menhir resolve 4.6.7, the rest 4.4.3).

**Rust.** Only `libs/rust/weal-engine` (toolchain 1.96.0 via its `rust-toolchain.toml`). Rebuild the
committed wasm in `libs/ts/weal-engine/gen/` with `just weal-engine-build`, never by hand. Two CI
jobs guard it ([ADR 0027](adr/0027-rust-ci-lane.md)), both in `just ci`: `weal-engine-rust` (fmt,
clippy, tests; needs rustup on the host) and `weal-engine-hash-check`, which fails when `gen/` is
stale against the Rust sources and needs no Rust (it is also in `just check`). The build also
writes `gen/weal_api.d.ts`, the TS types of the engine's JSON results (generated from the Rust by
`ts-rs`), and `gen/weal_builtins.json` plus the weal-bot guide's built-in list (from the builtin
registry); crate tests fail when they lag the Rust.
See [`libs/rust/weal-engine/README.md`](../libs/rust/weal-engine/README.md).

## Standing conventions

- **Telemetry in the running process.** Wire it in the process that runs the code; importing
  observe does nothing by itself. A Python CLI's `main()` wraps its body in
  `with astra_observe.run("astra.<sub>"):`, which initialises traces, metrics and logs and always
  flushes on exit (return, exception or SIGTERM). A long-lived process (the Dagster code location,
  `dagster/definitions.py`) calls `init_telemetry("astra.<sub>")`. A Node service never inits
  telemetry itself: it runs under `node --import @astra/observe/register` (the
  `deploy/node.Dockerfile` CMD and each app's `start` script), which installs traces, metrics and
  logs before app code loads, adds HTTP server and client spans (`node:http`) and fetch spans
  (undici), and owns SIGTERM/SIGINT. App cleanup goes in `onShutdown(fn)`; a fatal startup error
  logs `fatal` and calls `exitAfterFlush(1)`. The service name is the `service-name` of the
  config.kdl block that the app's `package.json` names in `"astra": { "config": "<namespace>" }`.
- **Where telemetry goes.** The process picks the endpoint, never the caller, in both languages:
  `ASTRA_RUNTIME=container` (set in `dagster/Dockerfile` and `deploy/node.Dockerfile`) exports to
  `telemetry.otlp-endpoint`; unset means the host and `telemetry.host-otlp-endpoint`. Every
  signal carries `deployment.environment`: `test` under pytest or vitest (where nothing is
  exported), `production` in a container or when run from the deploy checkout
  (`$ASTRA_DEPLOY_ROOT`), else `development`.
- **Logs.** Python logs export only through `logging.getLogger("astra.<sub>")`. In TS use
  `logger("astra.<sub>").info/warn/error/fatal(msg, attrs)` from `@astra/observe`; every record
  (also a raw `getLogger().emit`) at INFO or above is mirrored to stdout as one line, so
  `docker logs` shows it. Don't also `console.*` the same line. TS `console.log` does not export.
- **Ignored errors.** A `catch` that deliberately swallows an error calls
  `reportIgnored(site, err)` (TS) or `astra_observe.report_ignored(site, exc)` (Python): one
  `astra.errors.ignored{site}` count and a DEBUG record, instead of a bare `catch {}`. A catch
  that is control flow (a stat that answers "not a file") needs neither.
- **Telemetry in tests.** Take the `telemetry_capture` fixture (or `astra_observe.testing.capture`)
  in Python, or `captureTelemetry()` from `@astra/observe/testing` in TS, to assert on spans,
  metrics and logs in memory. Don't build ad-hoc providers or monkeypatch tracers.
- **TS metrics use `lazyCounter` / `lazyHistogram`** from `@astra/observe`. They bind on first
  use, so a module that also loads in tests or scripts (where no provider is installed) stays
  correct; under register a module-scope `getMeter()` would work too, but keep one convention.
- **Config single source.** Every config value, including tuning constants, ports and paths, lives
  in `ontology/ontology-config/config.kdl` and is read through `astra_config` (Python) or
  `@astra/config` (TypeScript). Each language's loader validates only the namespaces its apps read
  and ignores the rest, so a bad value in one language's block cannot stop the other's processes.
  Python's `WholeConfig` holds every namespace, and one CI test (`test_whole_config_kdl_validates`
  in `libs/py/config`) validates the whole file against it. The `libs/py/config` `models.py`
  docstring records which language reads which namespace. Pydantic is the one schema: the TS Zod
  schema (`libs/ts/config/src/config.gen.ts`) is generated from it for the namespaces in
  `TS_NAMESPACES` by `just ontology-gen`, and `just ontology-check` (in `just check` and CI) fails
  when the committed file is stale. Every namespace and every plaintext field is required with no
  default, so a value lives only in `config.kdl` and a missing key fails the load; a secret field
  is `Secret | None = None`. Every field needs a reader outside the config libraries and
  tests: `test_config_readers.py` fails on one that nothing names, so delete a field with its last
  reader (a field read only through a computed name goes in its `ALLOWLIST`, with the reason). Loader tests use `fixtures/config/`, not the real file. Only the
  config libraries read the environment (the upper-cased secret override). Find the checkout with
  `find_repo_root()` / `findRepoRoot()` from the config libraries; don't write another walk-up.
- **Secrets** are `ref="sops:KEY"` pointers in `config.kdl`; see
  [ADR 0005](adr/0005-sops-secrets-injected-at-deploy.md). Read one with `SecretRef.require()`
  (raises, naming the config key, when it is unset or blank) or `SecretRef.optional()` (unset or
  blank gives `None`/`undefined`). Don't wrap `resolve()` in app code.
- **KDL at the edges.** Parse KDL and validate into Pydantic or Zod immediately; never pass raw KDL
  nodes around. Don't hand-walk nodes: declare the shape as a model and decode it with
  `astra_config.kdl` `decode(Model, load_kdl(path))` or `@astra/config`
  `decodeKdl(schema, loadKdl(path))`. Fields are child nodes by default; mark the rest with
  `Arg`/`Prop`/`Children` (Python `Annotated[...]`) or `kdl.arg`/`kdl.prop`/`kdl.children` (TS,
  wrapping the outermost schema). A missing required field raises `KdlDecodeError` naming the node
  path. Quote hand-inserted KDL strings with `kdl_quote`/`kdlQuote`.
- **Generated ontology artifacts.** Python is the one `being.kdl` parser. `just ontology-gen`
  writes `ontology/ontology-being/being.canonical.json` from it, which `@astra/ontology` reads,
  regenerates the fixture entity registry, and writes `libs/ts/config/src/config.gen.ts` from
  the Pydantic config models; `just ontology-check` (in `just check` and CI) fails when one is
  stale. Run `just ontology-gen` after editing `being.kdl`, `defs.kdl`, the fixture snapshot or
  `libs/py/config` `models.py`, and commit the output; never edit the generated files by hand.
- **LLM calls** go through `libs/py/llm`; never call a provider SDK directly. Its client owns the
  `max_tokens` guard, caching, the one cost meter (`astra.llm.attempts`, `.tokens`, `.cost_usd`,
  by `model`, `provider` and `caller`; `meter.py`) and the one retry policy (`retry.py`). Give
  each client a `caller`, and don't wrap calls in your own retry loop; an asset with a Dagster
  `RetryPolicy` wraps its LLM work in `llm_failures_final()`. `make_dspy_lm` returns a bare
  `dspy.LM` that skips them; pass `lm_class=` a `MeteringMixin` subclass with a `caller`.
- **Identity keys.** `player_id` integers are foreign keys; carry them verbatim.
- **Frontends** follow the strider pattern (build-time content, generated modules, route loaders)
  and run as SSR Compose services ([ADR 0009](adr/0009-ssr-frontends.md)). Before frontend work,
  read the TanStack Start skill bundled with the package
  (`apps/<domain>/web/node_modules/@tanstack/react-start/skills/react-start/SKILL.md`); server
  logic is `createServerFn`.

## Adding an app

A new TanStack Start frontend starts from `just new-frontend <name>`: it writes the app and does
steps 2 and 3 below for it (see `libs/ts/site-kit/README.md`). Everything else starts by hand.

Put the app at `apps/<domain>/<role>/`: `py` for a Python app, `web` for a frontend, or a name
for what it is (`bot`, `overlay`, `render`, `controller`). Its manifest (`pyproject.toml` or
`package.json`) makes it a uv or pnpm member; no workspace list needs editing. uv rejects a
`apps/*/py` directory without a `pyproject.toml`, so never create an empty one. A TypeScript app's
`tsconfig.json` extends `../../../tsconfig.base.json`, and its scripts reach the repo root with
three `../`. Every Node service builds from the one `deploy/node.Dockerfile`, which finds the
workspace members itself, so a new pnpm member or `libs/ts` package needs no Docker change. A Node
service depends on `@astra/observe`, names its config block in its `package.json`
(`"astra": { "config": "<namespace>" }`, whose block needs a `service-name`), and its `start`
script runs `node --import ../../../libs/ts/site-kit/src/nodeTsResolve.mjs --import
@astra/observe/register <entry>`, like the image's CMD. What
is still hand-maintained:

1. A Dagster asset: register it in its app's `assets.defs`, pin its name in
   `dagster/tests/test_definitions.py`, and, for a new pipeline app, add the app to
   `merge(...)` in `dagster/definitions.py` and the dependencies in `dagster/pyproject.toml`,
   plus `COPY apps/<domain>/py` in `dagster/Dockerfile`.
2. A service: a compose service in `deploy/docker-compose.yml` (port in 10350 to 10399, `<<:
   *astra-app` for the uid-1000 user, the `telemetry` network and restart policy; a service
   that talks to a store or another service lists every network it needs, see
   [`deploy/README.md`](../deploy/README.md) "Networks"; a healthcheck merging
   `*node-healthcheck` with its own `test`, its secrets in `environment:`). A Node service's
   `build:` merges `*node-build` and sets `args`: `APP: <domain>/<role>`, plus `ENTRY` when the
   server is not `server.ts`, and `RUNTIME` when it needs ffmpeg or Chromium (the
   `node.Dockerfile` header lists the knobs). It sets no `command:`; the image's CMD runs the
   entry. Bind mounts use the long form `{ <<: *bind, source: ..., target: ... }`, whose
   `create_host_path: false` fails the deploy when the host dir is missing. The runtime image holds the whole built app dir, so a new
   data dir such as menhir's `quizzes/` needs no COPY. Paths the container writes are
   identical-path bind mounts under `/ruby/data/astra-state`; add the dir to `deploy.sh`
   `init_artifacts` and to the `config.kdl` `data` comment. A public host is a
   `sites.caddyfile` block with `import astra_site` (plus `import local_only` for private paths); the
   `*.iridi.cc` wildcard needs no DNS step, and the certificate is issued on the first request.
   A frontend that bakes astra-data also needs a `content-<app>` stage in `deploy/node.Dockerfile`
   (`CONTENT: <app>` in compose), `additional_contexts` in compose, and matching data under
   `fixtures/astra-data/`.
3. Its config block in `config.kdl` and in Pydantic (`libs/py/config` `models.py`): in `Config` if
   Python reads it, else in `WholeConfig`, which the whole-file CI test checks. A block TS reads also
   goes in `TS_NAMESPACES`; then run `just ontology-gen` and commit the regenerated Zod schema. Add
   the block to the ownership list in the `models.py` docstring, and to `fixtures/config/config.kdl`
   (every field is required, so the fixture sets them all).
4. A `test` script (`vitest run`) and at least one test. The script is how the root vitest config
   finds the package, and the root run fails on a project with no test files.
5. Telemetry in the real entrypoint. TS services get no HTTP auto-instrumentation, so add
   `startActiveSpan` spans on request paths, or traces stay empty while metrics flow. Never log ERROR
   for a user-content problem: every ERROR log pages Discord.
6. A short `README.md`: what it is, where it runs, operations, traps. Check visual changes
   (CSS, pixi) in a real browser; no unit test sees them.
7. A new CI path filter only if the app gets its own CI job (like `codex` or `vellumRender` in
   `.github/workflows/ci.yml`); the `py` and `ts` lanes already watch `apps/*/py/**`,
   `apps/*/tools/**` and `apps/**`.

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
- `routeTree.gen.ts` is committed so CI typechecks without a generate step. `vite dev` and
  `vite build` rewrite it; `just routes-gen` writes the same bytes without a server (run it after
  adding or renaming a route), and `just routes-check` (in `just check` and CI) fails when one is
  stale.
- Every frontend's SSR smoke test rebuilds `dist/` when it is missing or older than the app's
  sources or any `libs/ts` file (site-kit's `describeSsrSmoke`; codex's own smoke uses its
  `bundleIsStale`).
- SSR HTML contains UTF-8 glyphs, so plain `grep` may treat it as binary; use `grep -a`.
- A Postgres schema change is a new numbered file in the app's `migrations/` directory
  (`libs/ts/pg-migrate`). Never edit an applied one: the app then refuses to start. A store
  change needs a `*.pg.test.ts` case; they run in `just pg-test`.

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
