# astra task runner: a thin, grouped index. Sections, in order:
#   dev            the developer entry point (bootstrap, check, fix, test, ci, dev)
#   ci jobs        one recipe per CI job; .github/workflows/ci.yml calls the same recipes
#   host paths     the paths and tools the ops recipes pass to astra-ops
#   deploy         the Docker stack (deploy/deploy.sh) and the host doctor
#   host units     the systemd user units, the watchdog's sudoers, craig-sync
#   astra-data     the pipeline's publish chain (linguist-commit and its parts)
#   heartwood      the wiki agent: one session, revert, backfill, Dagster's requests
#   mouthpiece     the producer experiments
#   backups        snapshot, restore test, SigNoz rules
#   codex, builds  corpus refresh and search index; portal module, assay book, weal wasm
#   edge           the shared reverse proxy
#
# The ops recipes are one-line wrappers over the astra-ops CLI (libs/py/ops): its README lists
# each command, what it asks before running, and where its steps are documented. Paid or live
# commands ask first; `--yes` skips the question (the systemd units and unattended callers pass
# it).
#
# just --list shows the comment line directly above each recipe, so that line is the
# recipe's one-line summary; longer notes go above it.

# Every recipe's arguments are also its shell's "$1".."$@", verbatim (the wrappers forward
# them without re-splitting or interpolating; just 1.23 has no per-recipe attribute for this).
set positional-arguments

# Before this recipe existed, a bare `just` ran the first recipe: `deploy`.
# List the recipes (what a bare `just` does).
default:
    @"{{just_executable()}}" -f "{{justfile()}}" --list --unsorted

# ==== dev: the developer entry point ==========================================================

# Safe to re-run. On a machine without just yet: `mise trust && mise install`, activate
# mise in your shell (`mise activate`), then run this.
# Set up a clone: mise.toml's toolchain, both workspaces, the codex e2e suite's Chromium, hooks.
bootstrap:
    mise trust mise.toml
    mise install
    mise exec -- uv sync
    mise exec -- pnpm install
    mise exec -- pnpm --filter @astra/codex exec playwright install chromium
    git config core.hooksPath .githooks

# The fast format + lint gate for both lanes over the whole tree (pre-commit runs it on staged files).
check: (_each "check" "ts-lint,py-lint,docs-check,ontology-check,routes-check,weal-engine-hash-check,assay-store-check")

# Lint findings the tools can't fix are printed and don't stop the formatters; `just check`
# shows what is left.
# Apply the formatters and the safe autofixes for both lanes.
fix:
    -pnpm run lint:fix
    pnpm run format
    -uv run ruff check --fix
    uv run ruff format

# Run both test lanes.
test: (_each "test" "py-test,ts-test")

# The pre-push hook runs this; commitlint covers base..HEAD. Unlike CI, which path-filters
# its jobs, this always runs every step. Not run here: vellum-visual-regression, because its
# goldens are pinned to the node:24-slim container's Chromium and fonts (a host browser
# renders different pixels); it stays CI-only. weal-engine-rust needs rustup on the host (it
# installs the crate's pinned toolchain on first use).
# pg-test and infra-check need Docker on the host (a throwaway Postgres; the pinned tool images).
# Run everything CI runs, locally (all but the container-only vellum render goldens).
ci base="origin/main": (_each "ci" ("py-lint,ts-lint,docs-check,ontology-check,routes-check,py-typecheck,ts-typecheck,commitlint " + base + " HEAD,py-test,ts-test,ts-build,corpus-validate,vellum-parity,codex-e2e,weal-engine-rust,weal-engine-hash-check,assay-store-check,pg-test,infra-check"))

# `app` is the path under apps/, `<domain>/<role>`. The Python apps have no dev server:
# they run as Dagster assets; test them with `uv run pytest apps/<domain>/py`.
# Run one TS app's dev server, e.g. `just dev codex/web`.
dev app:
    #!/usr/bin/env bash
    set -euo pipefail
    app={{quote(app)}}
    has_dev() { node -e 'process.exit(require(process.argv[1]).scripts?.dev ? 0 : 1)' "$PWD/$1"; }
    if [ -f "apps/$app/package.json" ] && has_dev "apps/$app/package.json"; then
      exec pnpm --dir "apps/$app" run dev
    fi
    if [ -f "apps/$app/pyproject.toml" ]; then
      echo "dev: $app is a Python app with no dev server; try: uv run pytest apps/$app" >&2
    else
      echo "dev: no TS app with a dev script at apps/$app" >&2
    fi
    echo "apps with a dev script:" >&2
    for p in apps/*/*/package.json; do
      if has_dev "$p"; then d="${p#apps/}"; echo "  ${d%/package.json}" >&2; fi
    done
    exit 1

# Run each comma-separated step (a recipe name plus any arguments) even after one fails,
# then fail if any did, so one red step can't hide the rest.
_each label steps:
    #!/usr/bin/env bash
    set -uo pipefail
    IFS=, read -ra steps <<< {{quote(steps)}}
    failed=()
    for step in "${steps[@]}"; do
      printf '\n== just %s\n' "$step" >&2
      read -ra words <<< "$step"
      "{{just_executable()}}" -f "{{justfile()}}" "${words[@]}" || failed+=("$step")
    done
    if [ "${#failed[@]}" -gt 0 ]; then
      printf '\n{{label}}: FAILED: %s\n' "$(IFS=,; echo "${failed[*]}")" >&2
      exit 1
    fi
    printf '\n{{label}}: all %d steps passed\n' "${#steps[@]}" >&2

# scripts/ontology_gen.py lists the artifacts and their sources: being.canonical.json from
# being.kdl (Python is the one being.kdl parser; @astra/ontology reads the JSON), the
# fixture entity registry, and libs/ts/config's Zod schema from the Pydantic config models.
# Run it after editing being.kdl, defs.kdl, the fixture snapshot or libs/py/config models.py.
# Regenerate the generated ontology artifacts; `--check` writes nothing and fails if one is stale.
ontology-gen *flags:
    uv run python scripts/ontology_gen.py "$@"

# Each TanStack Start frontend commits src/routeTree.gen.ts; `vite dev` and `vite build` rewrite
# it, and this writes the same bytes (every route, editor routes included). Pass
# <domain>/<role> names to limit it to those apps. Run it after adding or renaming a route.
# Regenerate the frontends' route trees; `--check` writes nothing and fails if one is stale.
routes-gen *flags:
    node --import tsx libs/ts/site-kit/scripts/route-tree.ts "$@"

# Writes apps/<name>/web from libs/ts/site-kit/template/ (the next free port in 10350 to 10399
# unless --port is given), adds the app's block to config.kdl and the fixture, its Pydantic
# model, its compose service and its Caddy stanza, then regenerates the Zod schema and links the
# new workspace member. Review the stubs, then commit; `just deploy <name>` and
# `just caddy-reload` put it live.
# Scaffold a TanStack Start frontend on the site-kit preset: `just new-frontend <name> [--port <n>]`.
new-frontend name *flags:
    node --import tsx libs/ts/site-kit/scripts/new-frontend.ts "$@"
    "{{just_executable()}}" -f "{{justfile()}}" ontology-gen
    pnpm install

# Not in CI (CI has no astra-data clone). Reads only; the path is config's data.akasha-content.
# Run the vellum parity check over the real wiki in the astra-data clone.
vellum-parity-live:
    #!/usr/bin/env bash
    set -euo pipefail
    dir="$({{uv_bin}} run --frozen --no-sync python -m astra_ontology_config data.akasha-content)"
    exec {{uv_bin}} run --frozen --no-sync python libs/py/vellum-lang/scripts/corpus_parity.py --dir "$dir"

# ==== ci jobs: one recipe per CI job (ci.yml runs `just <job>`; the names match the job ids) ===

# CI job py-lint: ruff lint + format check.
py-lint:
    uv run ruff check
    uv run ruff format --check

# Every relative link in the living docs (docs/, root docs, READMEs, memory, skills) resolves.
# CI job docs-check: the memory index stays under its size budget and every doc link resolves.
docs-check:
    uv run python scripts/check_docs.py

# Telemetry is off: a sub-second check shouldn't wait on a collector it can't reach.
# CI job assay-store-check: every homebrew store file fits the model and is canonically formatted.
assay-store-check:
    OTEL_SDK_DISABLED=true uv run assay store check

# CI job ontology-check: no generated ontology artifact is stale (`just ontology-gen` fixes it).
ontology-check: (ontology-gen "--check")

# CI job routes-check: no committed route tree is stale (`just routes-gen` fixes it).
routes-check: (routes-gen "--check")

# CI job py-typecheck: ty.
py-typecheck:
    uv run ty check

# CI job py-test: pytest.
py-test:
    uv run pytest

# typecheck and build fan out with `pnpm -r --no-bail`: every member that defines the
# script runs, a failing member doesn't hide the ones after it, and the command still
# exits non-zero. `--aggregate-output` prints each member's log as one block.
# CI job ts-typecheck: tsc --noEmit in every member.
ts-typecheck:
    pnpm -r --no-bail --aggregate-output run typecheck

# The lint and format command lines (with the globs that keep oxfmt off markdown, toml and
# the SOPS file) live once, in the root package.json scripts.
# CI job ts-lint: oxlint + oxfmt check.
ts-lint:
    pnpm run lint
    pnpm run format:check

# One vitest process over every member with a `test` script (root vitest.config.ts projects).
# CI job ts-test: vitest in every member.
ts-test:
    pnpm exec vitest run

# CI job ts-build: build every member, then check the SSR bundles' imports.
ts-build:
    pnpm -r --no-bail --aggregate-output run build
    just ssr-externals-check

# Each built SSR bundle (apps/*/*/dist/server) may import only Node builtins and the app's own
# production dependencies, since the image installs nothing else (site-kit src/ssrExternals.ts).
# Check the built SSR bundles import only builtins and the app's own production dependencies.
ssr-externals-check:
    node --import tsx libs/ts/site-kit/scripts/ssr-externals-check.ts

# The real wiki lives in astra-data, where heartwood validates it before every commit.
# CI job corpus-validate: the akasha corpus gate over the checked-in fixture wiki.
corpus-validate:
    node --import tsx libs/ts/vellum-lang/scripts/validate-corpus.ts --dir fixtures/astra-data/akasha/content

# The `*.pg.test.ts` suites (the migration runner and the orator and weal stores) against a
# real Postgres. CI sets ASTRA_TEST_DATABASE_URL to its `services: postgres` container. Without
# it, this starts a throwaway postgres:16-alpine (the image compose runs) on a free loopback
# port and removes it afterwards. Never set the variable to a live database: the suites create
# and drop databases on that server.
# CI job pg-test: the Postgres stores and the migration runner against a real Postgres.
pg-test:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "${ASTRA_TEST_DATABASE_URL:-}" ]; then
      name="astra-pg-test-$$"
      docker run --rm -d --name "$name" -e POSTGRES_PASSWORD=test \
        -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
      trap 'docker rm -f "$name" >/dev/null' EXIT
      # pg_isready over TCP: the image's init-time server listens on the socket only.
      for _ in $(seq 60); do
        docker exec "$name" pg_isready -h 127.0.0.1 -q && break
        sleep 0.5
      done
      port=$(docker port "$name" 5432/tcp | head -n1 | sed 's/.*://')
      export ASTRA_TEST_DATABASE_URL="postgres://postgres:test@127.0.0.1:$port/postgres"
    fi
    pnpm exec vitest run pg.test

# The conformance corpus (fixtures/vellum) pins each parser to committed .meta.json files;
# this runs both on every committed .vellum document and compares their metadata JSON.
# CI job vellum-parity: Python and TS vellum-lang agree on every checked-in vellum document.
vellum-parity:
    uv run python libs/py/vellum-lang/scripts/corpus_parity.py --dir fixtures/vellum --dir fixtures/astra-data/akasha/content --dir apps/strider/web/content

# An empty `from` lints only HEAD (CI's fallback when a push has no usable base).
# CI job commitlint: Conventional Commits over from..to.
commitlint from="origin/main" to="HEAD":
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z {{quote(from)}} ]; then
      exec pnpm exec commitlint --last --verbose
    fi
    exec pnpm exec commitlint --from {{quote(from)}} --to {{quote(to)}} --verbose

# The codex e2e suite (Playwright Test, apps/codex/web/e2e): its server generates the fixture
# corpus and points CODEX_CORPUS_ROOT at it, so it never reads the real corpus. Needs the
# Chromium from `just bootstrap`. Arguments go to `playwright test` (a file, `-g <title>`).
# CI job codex-e2e: listing row geometry, scroll, keys, reload and the filter pane in Chromium.
codex-e2e *args:
    pnpm --filter @astra/codex build
    cd apps/codex/web && pnpm exec playwright test "$@"

# CI-only (see `ci`): runs inside node:24-slim with the Chromium the playwright lock pins.
# CI job vellum-visual-regression: each fixture's rendered PNG against its golden.
vellum-visual-regression:
    pnpm --filter @astra/vellum-render build
    cd apps/vellum/render && node --import tsx scripts/visual-regression.ts

# Needs only the toolchain rustup installs from the crate's rust-toolchain.toml (1.96.0 with
# rustfmt and clippy), not the wasm tools. The second clippy pass bans unwrap in library code;
# tests may unwrap.
# CI job weal-engine-rust: the weal-engine crate's fmt, clippy and tests.
weal-engine-rust:
    cd libs/rust/weal-engine && cargo fmt --check
    cd libs/rust/weal-engine && cargo clippy --all-targets -- -D warnings
    cd libs/rust/weal-engine && cargo clippy -- -D warnings -D clippy::unwrap_used
    cd libs/rust/weal-engine && cargo test

# Needs no Rust toolchain: it hashes the crate's sources against gen/SOURCE_SHA256.
# CI job weal-engine-hash-check: the committed wasm was built from the committed Rust sources.
weal-engine-hash-check:
    libs/rust/weal-engine/tools/gen-stamp.sh check {{quote(weal_stamp)}}

# deploy/tests/infra-check.sh's header lists the checks and their pinned tool versions. Needs
# Docker; the first run builds the edge's Caddy (about a minute), later runs take seconds.
# INFRA_CHECK_ONLY=caddy,shell runs a subset.
# CI job infra-check: compose config, Caddy adapt/validate, shellcheck, systemd verify, hadolint.
infra-check:
    deploy/tests/infra-check.sh

# ==== host paths: what the ops recipes pass to astra-ops ======================================

reverse_proxy_dir := "/ruby/data/reverse-proxy"
sops_age_key := "deploy/sops/age.key"
sops_file := "deploy/sops/secrets.enc.yaml"

# The one data root (0037 Phase 1 item 2c): ALL runtime state — the astra-data clone, every
# service's state dirs, audio, Postgres, the deploy record, locks — lives here, never in a
# code checkout. Mirrors config.kdl data.root (whose comment lists the layout); the same
# ASTRA_DATA_ROOT variable overrides both. The containers run as 1000:1000, so the source
# dirs must exist + be host-owned BEFORE a deploy (Docker auto-creates a missing bind source
# as root); `artifacts-init` (run by every deploy) creates them.
data_root := env_var_or_default("ASTRA_DATA_ROOT", "/ruby/data/astra-state")

# The deploy checkout (0037 OPS-3): the only tree that builds production (`just deploy`) and
# the tree every host unit runs from. `units-install` links the units from here, the backfill
# runs this checkout's recipes, and deploy.sh keeps its venv + node deps in sync. Mirrors
# deploy.sh's ASTRA_DEPLOY_ROOT default.
deploy_root := env_var_or_default("ASTRA_DEPLOY_ROOT", "/ruby/data/astra-deploy")

# astra's own episodes corpus (the live Dagster pipeline's renders + migrated catalog).
# Mirrors config.kdl mouthpiece.episodes-path; override with MOUTHPIECE_EPISODES.
mouthpiece_episodes := env_var_or_default("MOUTHPIECE_EPISODES", data_root + "/mouthpiece/episodes")

# Source for the akasha-frontend session-audio seed: astra scribe's saved dir (mirrors config.kdl
# scribe ingest-saved-dir), laid out as `<date>/audio.mp3`. Override with AKASHA_AUDIO_LIVE.
akasha_audio_live := env_var_or_default("AKASHA_AUDIO_LIVE", data_root + "/scribe/data/saved")

# The Drive FUSE mount craig-sync copies Craig recordings from. Override with CRAIG_DROP_DIR.
craig_drop_dir := env_var_or_default("CRAIG_DROP_DIR", "/ruby/data/home/drive/Craig")

# uv binary (absolute — the systemd user units have a minimal PATH without uv, same reason the
# units hardcode just's path). Override with UV_BIN on another host. Every `{{uv_bin}} run`
# passes --frozen --no-sync: these recipes run in the deploy checkout, where a plain `uv run`
# could rewrite a stale uv.lock (leaving the checkout dirty, so the next deploy refuses it) or
# re-sync the venv under a running heartwood agent. deploy.sh's locked sync is the only one
# there; in a dev tree run `uv sync` yourself. The dev recipes above use the PATH `uv`.
uv_bin := env_var_or_default("UV_BIN", "/home/jbassin/.local/bin/uv")

# The astra-ops CLI with the justfile's own paths passed explicitly (argument lists, never a
# shell). `set positional-arguments` hands each wrapper's arguments over verbatim as "$@".
ops := quote(uv_bin) + " run --frozen --no-sync astra-ops --data-root " + quote(data_root) + " --uv " + quote(uv_bin) + " --mouthpiece-episodes " + quote(mouthpiece_episodes) + " --akasha-audio " + quote(akasha_audio_live) + " --deploy-root " + quote(deploy_root) + " --just " + quote(just_executable()) + " --craig-drop-dir " + quote(craig_drop_dir)

# ==== deploy: the Docker stack (deploy/) and the host doctor ==================================

# Deploy production (0037 OPS-3): everything lives in deploy/deploy.sh (header = steps,
# flags, exit codes, where the live sha is recorded). Builds ONLY from the deploy checkout
# ($ASTRA_DEPLOY_ROOT, default /ruby/data/astra-deploy) at a PUSHED commit — origin/main, or
# `--sha <rev>` for a rollback — never from this working tree, so push first. Takes the
# deploy lock, injects the SOPS secrets (Decision E), labels every image with the sha.
#   just deploy                     whole stack at origin/main
#   just deploy akasha-frontend     one service (same secret injection — never use a bare
#                                   `docker compose up -d <svc>`, it starts it with no secrets)
#   just deploy --sha <rev> [svc]   a pushed older commit (rollback)
#   just deploy --dry-run [svc]     checks only; prints the compose command
#   just deploy --restart <svc>     restart without a build, under the same lock
# Deploy production from the deploy checkout at a pushed commit (all of it, or the named services).
deploy *args:
    ASTRA_DATA_ROOT="{{data_root}}" "{{justfile_directory()}}/deploy/deploy.sh" "$@"

# Alias of `just deploy` (the old name; same args). No args = the whole stack.
up *services:
    "{{just_executable()}}" -f "{{justfile()}}" deploy "$@"

# Docker would otherwise create a missing bind source as root (the root-owned-writes problem).
# `just deploy` does this itself; the dir list lives in deploy/deploy.sh.
# Create the data root's dirs as the host user (uid 1000) before a deploy.
artifacts-init:
    ASTRA_DATA_ROOT="{{data_root}}" "{{justfile_directory()}}/deploy/deploy.sh" --init-artifacts

# deploy/doctor.sh's header lists the checks: tool versions against mise.toml, compose
# bind-mount sources, the linked systemd units, lingering and the age key, edge certificate
# expiry and `astra-expires:` markers. Exits 1 on any failure. DOCTOR_SKIP=certs,binds skips.
# Read-only host check.
doctor:
    ASTRA_DATA_ROOT="{{data_root}}" ASTRA_DEPLOY_ROOT="{{deploy_root}}" "{{justfile_directory()}}/deploy/doctor.sh"

# The UI's "Terminate" cannot stop a run's container (only dagster-daemon mounts the Docker
# socket; ADR 0030), so this runs the cancel inside the daemon. Exit codes: libs/py/ops
# pipeline.py. `--yes` skips the question.
# Terminate a Dagster run and stop its run container (LIVE).
pipeline-terminate run_id *flags:
    @{{ops}} pipeline-terminate "$@"

# Never touches the astra project. Needs Docker; about 20 s. Not in `ci`.
# Check deploy/wait-healthy.sh (deploy.sh's health wait) against throwaway alpine containers.
deploy-health-test:
    "{{justfile_directory()}}/deploy/tests/wait-healthy-test.sh"

# Stop the stack; keep volumes (ClickHouse / Postgres / SigNoz data persist).
down:
    cd deploy && docker compose down

# The SigNoz volumes hold the alert rules, the discord-ops channel and the users; the rules
# are also in deploy/signoz/rules/ and the nightly backup (`just backup-now` first if in
# doubt). A fresh SigNoz needs re-onboarding on the next `up`.
# Stop AND drop the SigNoz volumes (asks for confirmation first).
[confirm("down-volumes DELETES the SigNoz volumes (alert rules, notification channel, users). Type y to continue:")]
down-volumes:
    cd deploy && docker compose down -v

# ==== host units: systemd user units, the watchdog's sudoers, craig-sync ======================

# The groups and their units: deploy/systemd/units.txt (`just doctor` checks the same list).
# Re-run after a deploy that edits a unit, or systemd keeps the old one. Needs lingering.
# Link + enable the systemd user units from the deploy checkout (no group = all; idempotent).
units-install *groups:
    @{{ops}} units-install "$@"

# Prompts for your password (system scope). Each file passes `visudo -c` first; the check
# afterwards never runs the commands.
# One-time ROOT step: install the watchdog's NOPASSWD sudoers drop-ins (gdrive, ethtool).
alert-sudoers-install:
    @{{ops}} alert-sudoers-install "$@"

# craig-sync.timer runs this every 5 min. It bounds every Drive mount access without waiting
# on it, so a wedged mount fails the unit (and pages) instead of hanging it.
# Copy new Craig recordings from the Drive FUSE mount into scribe's incoming dir.
craig-sync:
    @{{ops}} craig-sync "$@"

# ==== astra-data: the pipeline's publish chain (libs/py/ops publish.py) =======================

# Under the git-publish lock: commit the linguist datasets, refresh + commit the mouthpiece
# snapshot, push the clone, seed audio + redeploy the frontends for what changed. A failed push
# still redeploys, then exits 1 (OnFailure pages). linguist-commit.service passes --yes.
# Commit + push the pipeline's new output in astra-data, then redeploy what changed (LIVE).
linguist-commit *flags:
    @{{ops}} linguist-commit "$@"

# Callers (linguist-commit, heartwood) hold the git-publish lock and call this in-process.
# Exit 8 = fetch, rebase or push failed; the local commits stay and the next caller retries.
# Push the astra-data clone's local commits (LIVE).
_astra-data-push *flags:
    @{{ops}} astra-data-push "$@"

# The frontend's single build input. Writes only; linguist-commit commits it. Runs on the HOST
# (needs uv + ffprobe). `--allow-shrink` publishes a deliberate removal.
# Regenerate the mouthpiece episode catalog snapshot in the astra-data clone (writes only).
mouthpiece-publish *flags:
    @{{ops}} mouthpiece-publish "$@"

# Copy the pipeline's episode mp3s into the audio dir mouthpiece-frontend serves (LIVE).
mouthpiece-seed *flags:
    @{{ops}} mouthpiece-seed "$@"

# Copy scribe's session recordings into the audio dir akasha-frontend serves (LIVE).
akasha-seed *flags:
    @{{ops}} akasha-seed "$@"

# ==== heartwood: the wiki agent (libs/py/ops heartwood.py, backfill.py) =======================

# dspy's PythonInterpreter runs Deno + Pyodide, and its runner.js imports an UNPINNED
# `npm:pyodide` + deno.land/std, fetched into the Deno cache on first use (network). Run once
# per host, and again after a Deno-cache wipe or a new Pyodide release — then re-run gate C
# (the scripted real-Deno test). Prints the resolved Pyodide version for the build record.
# dspy calls bare `deno`, hence the PATH; `prepare_sandbox_env` also sets DENO_NO_PACKAGE_JSON
# and a real-path DENO_DIR — the same env every agent run uses.
# Warm the heartwood agent's sandbox (Deno + Pyodide).
heartwood-sandbox-warm:
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="$HOME/.deno/bin:$PATH"
    deno --version | head -1
    {{uv_bin}} run --frozen --no-sync python -c 'from astra_heartwood.agent.run import make_interpreter as mk, sandbox_version as v; i = mk(); print("sandbox:", i.execute("print(1)").strip()); print("pyodide:", v(i)); i.shutdown()'

# Every git step runs in the astra-data clone, never the code repo:
#   just heartwood-agent 2025-8-28              run → publish → commit → push → redeploy
#   just heartwood-agent 2025-8-28 --dry-run    run + artifacts only (still PAID)
#   just heartwood-agent 2025-8-28 --no-push    commit locally, no push/redeploy
#   ... --model=<id> [--sub-model=<id>]         override heartwood.model / sub-model once
#   ... --yes                                   skip the question (unattended callers)
# Exit codes 0–10 and 64: the heartwood.py docstring.
# Run + publish one session via the heartwood agent (PAID + LIVE; --dry-run / --no-push).
heartwood-agent date *flags:
    @{{ops}} heartwood-agent "$@"

# A failed push still redeploys, then exits 8; 9 = redeploy failed. Rerunning retries both.
# Push the astra-data clone and redeploy akasha-frontend (the heartwood tail; LIVE).
_heartwood-push-deploy *flags:
    @{{ops}} heartwood-push-deploy "$@"

# Undo one published heartwood session: revert commit + ledger line + push + redeploy (LIVE).
heartwood-revert date *flags:
    @{{ops}} heartwood-revert "$@"

# Runs DETACHED as the transient user unit `heartwood-backfill` (output: <data root>/heartwood/
# backfill.log), with linguist-commit and the request runner paused. `from` = first date;
# re-running resumes. Stop: `systemctl --user stop heartwood-backfill`. Steps: backfill.py.
# Replay all pending faerrin sessions, detached + budget-capped (PAID + LIVE).
heartwood-backfill *args:
    @{{ops}} heartwood-backfill "$@"

# The backfill's body: its systemd unit runs this with --yes. Not for running by hand.
_heartwood-backfill-loop *args:
    @{{ops}} heartwood-backfill-loop "$@"

# Refuses while the backfill still runs.
# Re-arm linguist-commit + the request runner and drop the watchdog lock after a hard-killed backfill.
heartwood-backfill-reset:
    @{{ops}} heartwood-backfill-reset "$@"

# Started by heartwood-request.path when Dagster files a request, and hourly by its timer; a
# no-op with nothing pending. heartwood-request.service passes --yes.
# Run heartwood for every pending Dagster session_wiki request (PAID + LIVE per request).
heartwood-requests *flags:
    @{{ops}} heartwood-requests "$@"

# ==== mouthpiece: the producer experiments (0034) =============================================

# Idempotent; the first run fetches Pyodide into DENO_DIR (network), later runs are offline.
# Warm the dspy sandbox (Deno + Pyodide) the producer runs in.
mouthpiece-sandbox-warm:
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="$HOME/.deno/bin:$PATH"
    deno --version | head -1
    {{uv_bin}} run --frozen --no-sync python -c 'from astra_llm.rlm import make_interpreter as mk, sandbox_version as v; i = mk(); print("sandbox:", i.execute("print(1)").strip()); print("pyodide:", v(i)); i.shutdown()'

# PAID (OpenRouter: the producer RLM + one two-pass script per experiment-models arm,
# ≈ $2–3), never live: writes only under <data root>/mouthpiece/experiments/<date>/<run>/.
#   just mouthpiece-experiment 2026-10-5
#   just mouthpiece-experiment 2026-10-5 --arm glm-5.3
#   just mouthpiece-experiment 2026-10-5 --reuse-brief /ruby/data/astra-state/mouthpiece/experiments/2026-10-5/<run>
# The 0034 producer comparison for one session (PAID).
mouthpiece-experiment date *flags: mouthpiece-sandbox-warm
    cd "{{justfile_directory()}}" && {{uv_bin}} run --frozen --no-sync astra-mouthpiece-producer experiment "$@"

# dossier + script are PAID (OpenRouter) and write only under <data root>/mouthpiece/
# experiments/roundtable-<latest>/<run>/; render is PAID + LIVE.
#   just mouthpiece-roundtable dossier                  survey the main campaign → mystery file
#   just mouthpiece-roundtable script <run-dir>         ~45-min roundtable script from it
#   just mouthpiece-roundtable render <run-dir>         TTS + assemble into episodes/ + auto-publish
# The prediction-roundtable special (PAID; render is also LIVE).
mouthpiece-roundtable *args: mouthpiece-sandbox-warm
    cd "{{justfile_directory()}}" && export PATH="$HOME/.deno/bin:$PATH" && {{uv_bin}} run --frozen --no-sync astra-mouthpiece-roundtable "$@"

# ==== backups and alerting as code (0037 OPS-6): astra-backup.sh, SigNoz rules, host metrics ===
# Nightly snapshot to the sda disk (/ruby/data/plex/data/astra-backups): pg_dump of the three
# astra databases, the irreplaceable state dirs and the SigNoz alert rules; 14 daily + 8 weekly
# kept. The script's header has what, why, retention and the manual restore. `just units-install
# backup` installs the nightly timer (03:30) and the weekly restore test (Sunday 05:30).

# Take one snapshot now, in the foreground (waits if the nightly run holds the lock).
backup-now:
    "{{justfile_directory()}}/deploy/systemd/astra-backup.sh" run

# Each Postgres dump goes into a throwaway --network none container and its row counts are
# compared with dump time and live; state dirs get file counts + a sha256 sample vs the
# source; rule files must parse. Read-only against the live stack. A pass writes the stamp the
# watchdog checks; astra-restore-test.timer runs this weekly.
# Prove the newest snapshot (or the named one) restores.
backup-restore-test *snapshot:
    "{{justfile_directory()}}/deploy/systemd/astra-backup.sh" restore-test "$@"

# Rules only — never the notification channel, which holds the webhook. The nightly backup
# logs a warning when the live rules drift from the committed copy. deploy/signoz/rules is the
# source of truth: export only to capture a rule someone made in the UI, then commit it.
# Re-export the live SigNoz alert rules into deploy/signoz/rules/ for git.
signoz-rules-export:
    "{{justfile_directory()}}/deploy/systemd/astra-backup.sh" export-rules "{{justfile_directory()}}/deploy/signoz/rules"

# Read-only. Exit 0 in sync, 1 drift, 2 could not compare (SigNoz down). No
# ops.signoz-api-key yet is a WARN and exit 0 (astra-ops itself exits 3). The watchdog runs it
# every 15 min and pages on drift once the key exists. Details: libs/py/ops README.
# Compare the live SigNoz alert rules with deploy/signoz/rules.
signoz-rules-check:
    #!/usr/bin/env bash
    rc=0
    {{ops}} signoz-rules-check || rc=$?
    [ "$rc" -eq 3 ] && exit 0
    exit "$rc"

# Matches rules by their `alert` name: creates the missing, replaces the changed, never
# deletes (a live-only rule is reported). Prints the plan and changes nothing unless --yes.
# Make SigNoz's alert rules match deploy/signoz/rules (dry run; --yes applies).
signoz-rules-apply *flags:
    @{{ops}} signoz-rules-apply "$@"

# astra-metrics.timer runs this every 2 min; by hand it is a safe one-off (it only rewrites
# the textfile). The metrics and why: libs/py/ops/src/astra_ops/host_metrics.py.
# Write the host metrics (TLS expiry, container health, Dagster heartbeats, data freshness).
host-metrics:
    @{{ops}} host-metrics "$@"

# astra-smoke.timer runs this every 10 min; by hand it is a safe one-off (GETs only, and it
# rewrites one textfile). The checks and their markers: libs/py/ops/src/astra_ops/smoke.py.
# Fetch one real page per public site through the edge and write the smoke metrics.
smoke:
    @{{ops}} smoke "$@"

# ==== codex (0029): corpus releases ===========================================================

# Refresh the codex corpus (D29-4): re-fetch both snapshots, then build and publish a new
# release (`codex-build`). A deliberate, diffable event, never implicit in a build —
# refuses to run if the git index is dirty under apps/codex/ingest (the
# corpus-manifest.json diff must be reviewable alone, the linguist-commit-timer
# lesson applied here too). Re-downloads ~259 MB (AoN) + the Foundry sparse
# clone; not cheap, don't run casually. Flags go to codex-build (`--allow-shrink`).
codex-refresh *flags:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    if [ -n "$(git status --porcelain -- apps/codex/ingest)" ]; then
      echo "codex-refresh: apps/codex/ingest has uncommitted changes — commit or stash first" >&2
      echo "(the corpus-manifest.json diff from this refresh must be reviewable alone):" >&2
      git status --porcelain -- apps/codex/ingest >&2
      exit 1
    fi
    echo "codex-refresh: fetching Foundry snapshot..."
    pnpm --filter @astra/codex-ingest cli fetch-foundry
    echo "codex-refresh: fetching AoN snapshot..."
    pnpm --filter @astra/codex-ingest cli fetch-aon
    "{{just_executable()}}" codex-build {{flags}}

# Build a codex release from the snapshots on disk and make it current: transform and
# Pagefind index into <codex.data-path>/releases/.staging-*, validate (schema generation,
# not the fixture, entity files match the manifest, no fewer entities than the current
# release unless --allow-shrink, an index exists), rename to releases/<content hash>, then
# swap the releases/current symlink. A running codex follows `current` per request: no
# restart. Keeps the 3 newest releases plus the one codex serves (its /healthz; when codex
# doesn't answer, prunes nothing). A rejected (rolled-back) release needs --force. HOST-ONLY (the indexer peaks at ~3.8 GB RSS):
# never in CI, a Docker build or `vite build`. Run it from a clean checkout at a pushed
# commit; the transform reads code and the homebrew store from the checkout.
codex-build *flags:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    codex_data="$({{uv_bin}} run --frozen --no-sync python -m astra_ontology_config codex.data-path)"
    pnpm --filter @astra/codex-ingest cli release build {{flags}}
    echo ""
    echo "codex-build: report.md summary:"
    head -n 40 "$codex_data/releases/current/corpus/report.md"

# Rebuild only the codex Pagefind index (D29-34) over the current release's corpus and
# publish it as a new release (the corpus is hardlinked, not copied). Same host-only
# posture as codex-build.
codex-search-index *flags:
    pnpm --filter @astra/codex-ingest cli release build --reuse-corpus {{flags}}

# Make an older codex release current again: the given id, or by default the newest one
# before the current release that no rollback rejected. The target must pass the same
# checks a build does. The release left behind is marked rejected: returning to it (by a
# rollback, or a rebuild that hashes to it) needs --force. Instant; a running codex
# follows on its next request. `just codex-rollback [<id>] [--force]`.
codex-rollback *args:
    pnpm --filter @astra/codex-ingest cli release rollback {{args}}

# List the codex releases on disk, newest first; `*` marks the current one.
codex-releases:
    pnpm --filter @astra/codex-ingest cli release list

# One-time: turn the flat <codex.data-path>/corpus and search/ into the first release and
# point releases/current at it. Hardlinks, so the flat dirs stay intact for a server that
# still mounts them; remove them after codex serves from releases/. A no-op once a
# current release exists.
codex-migrate-releases:
    pnpm --filter @astra/codex-ingest cli release migrate

# Opt-in, host-only (not in `ci`): check the current release's corpus the
# way a production server does (this schema generation, not the fixture), spot-check
# it, and render an entity page from it through a fresh build. Every other codex test
# and guard reads the committed fixture.
codex-real-corpus:
    pnpm --filter @astra/codex build
    cd apps/codex/web && CODEX_REAL_CORPUS=1 pnpm exec vitest run src/realCorpus.test.ts

# ==== builds: portal module, assay book, weal wasm ============================================

# dist/ is gitignored; the server's Docker build packages module.json + dist/ into portal.zip
# (D11 — install by Manifest URL, no host file-drop in steady state).
# Bundle the Foundry module (tsdown -> apps/portal/module/dist/main.js).
portal-module-build:
    pnpm --filter @astra/portal-module build

# D11's primary path is the Manifest URL (https://portal.iridi.cc/module/module.json), which
# Foundry fetches itself. This builds the module and copies module.json + dist/ into the live
# Foundry data dir (FOUNDRY_DATA_DIR, default the foundry_faerrin container's bind source);
# Foundry re-reads it on the next world launch or module refresh. No restart.
# File-drop FALLBACK install of the Foundry module into the live Foundry data dir.
portal-module-install:
    @{{ops}} portal-module-install "$@"

# Regenerates the committed .tex from the homebrew store, then compiles the PDF with tectonic
# into apps/assay/py/books/liturgy_vol2/. The PDF is a build output and git-ignored (ADR 0018);
# commit the .tex diff. tectonic is a host tool, not in mise.toml; the recipe refuses any
# version but the one the committed .tex was proven with.
# Build the Liturgy Vol.2 book (`--no-compile` writes only the .tex).
book *flags:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    want="0.17.0"
    if [[ " $* " != *" --no-compile "* ]]; then
      if ! command -v tectonic >/dev/null; then
        echo "book: tectonic is not on PATH (want $want; cargo install tectonic --version $want)" >&2
        exit 1
      fi
      have="$(tectonic --version | awk '{print $2}')"
      if [ "$have" != "$want" ]; then
        echo "book: tectonic $have found, want $want" >&2
        exit 1
      fi
    fi
    OTEL_SDK_DISABLED=true {{uv_bin}} run --frozen assay export-book "$@"

# Rebuild the committed @astra/weal-engine wasm artifact from
# libs/rust/weal-engine: cargo (wasm32 release; the 8 MiB stack flag lives in
# the crate's .cargo/config.toml, target-scoped) → wasm-bindgen --target
# nodejs into libs/ts/weal-engine/gen → wasm-opt -O2 in place → re-write
# gen/package.json {"type":"commonjs"} (wasm-bindgen won't; the CJS marker is
# what lets the ESM wrapper createRequire the glue) → regenerate gen/weal_api.d.ts
# (the JSON contract's TS types, from api.rs via ts-rs) → write gen/SOURCE_SHA256,
# the staleness stamp weal-engine-hash-check verifies. BOTH tools are
# HARD-REQUIRED at pinned versions (committed bytes must be
# machine-independent): wasm-bindgen-cli 0.2.127 (== the crate's wasm-bindgen
# pin) and binaryen wasm-opt version 124; mise.toml installs both.
# Machine-independent bytes (WEAL-4): --remap-path-prefix rewrites $CARGO_HOME,
# which the dependency panic locations name, to /cargo. It goes in via
# --config, which cargo appends to the config file's rustflags array; a
# RUSTFLAGS env var would REPLACE that array and drop the stack flag.
# Deterministic: two runs → byte-identical gen/ (recorded at S5).
weal_bindgen_version := "0.2.127"
weal_wasm_opt_version := "124"
weal_stamp := "wasm-bindgen=" + weal_bindgen_version + " wasm-opt=" + weal_wasm_opt_version

# Rebuild the committed weal-engine wasm (pinned wasm-bindgen + wasm-opt; byte-deterministic).
weal-engine-build:
    #!/usr/bin/env bash
    set -euo pipefail
    cd libs/rust/weal-engine
    gen="../../ts/weal-engine/gen"
    command -v wasm-bindgen >/dev/null || { echo "FATAL: wasm-bindgen not installed — cargo install wasm-bindgen-cli --version {{weal_bindgen_version}} --locked" >&2; exit 1; }
    command -v wasm-opt >/dev/null || { echo "FATAL: wasm-opt not installed — binaryen version_{{weal_wasm_opt_version}} release into ~/.local/bin" >&2; exit 1; }
    bg_v="$(wasm-bindgen --version | awk '{print $2}')"
    [ "$bg_v" = "{{weal_bindgen_version}}" ] || { echo "FATAL: wasm-bindgen $bg_v != pinned {{weal_bindgen_version}}" >&2; exit 1; }
    wo_v="$(wasm-opt --version | awk '{print $3}')"
    [ "$wo_v" = "{{weal_wasm_opt_version}}" ] || { echo "FATAL: wasm-opt $wo_v != pinned {{weal_wasm_opt_version}}" >&2; exit 1; }
    cargo_home="${CARGO_HOME:-$HOME/.cargo}"
    cargo build --release --target wasm32-unknown-unknown \
      --config "target.wasm32-unknown-unknown.rustflags = [\"--remap-path-prefix=$cargo_home=/cargo\"]"
    wasm-bindgen --target nodejs --out-dir "$gen" target/wasm32-unknown-unknown/release/weal_engine.wasm
    wasm-opt -O2 -o "$gen/weal_engine_bg.wasm" "$gen/weal_engine_bg.wasm"
    printf '{\n  "type": "commonjs"\n}\n' > "$gen/package.json"
    # The JSON contract's TS types (gen/weal_api.d.ts, from api.rs by ts-rs) and the builtin
    # reference (gen/weal_builtins.json and the player guide's list, from the prelude registry).
    WEAL_WRITE_TS_BINDINGS=1 cargo test --lib --quiet -- ts_bindings_are_current builtin_reference_is_current
    if strings -n 8 "$gen/weal_engine_bg.wasm" | grep -qF "$HOME"; then echo "FATAL: the wasm embeds $HOME (path remapping failed)" >&2; exit 1; fi
    tools/gen-stamp.sh write {{quote(weal_stamp)}}
    sha256sum "$gen"/weal_engine_bg.wasm "$gen"/weal_engine.js

# ==== edge: the SHARED reverse proxy at /ruby/data/reverse-proxy =============================
# A custom `caddy` binary with the cloudflare-dns plugin (the stock /usr/bin/caddy lacks it)
# whose Caddyfile `import`s this repo's sites.caddyfile. The ACME-DNS token comes from SOPS at
# adapt time and is never written to disk.

# The decrypted CF token, exported as {$CF_API_TOKEN} for the caddyfile adapter.
cf_token := "CF_API_TOKEN=\"$(SOPS_AGE_KEY_FILE=" + sops_age_key + " sops -d --extract '[\"cloudflare_key\"]' " + sops_file + ")\""

# Reload the shared reverse proxy with astra's sites (CF token from SOPS, substituted at adapt time — never on disk).
caddy-reload:
    {{cf_token}} {{reverse_proxy_dir}}/caddy reload --config {{reverse_proxy_dir}}/Caddyfile --adapter caddyfile

# Validates the main Caddyfile (which imports astra's sites) so parent snippets like local_only
# resolve. Adapt-only; no provisioning.
# Validate the merged edge config.
caddy-validate:
    {{cf_token}} {{reverse_proxy_dir}}/caddy validate --config {{reverse_proxy_dir}}/Caddyfile --adapter caddyfile

# Tail the edge logs (mirrors the reverse-proxy justfile's `logs`).
caddy-logs:
    journalctl -fu caddy.service
