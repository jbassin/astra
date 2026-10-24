# astra task runner. Three concerns:
#   - dev: the developer entry point (bootstrap, check, fix, test, ci, dev) and one recipe
#     per CI job. .github/workflows/ci.yml calls the same recipes, so CI and `just ci` run
#     the same commands.
#   - the Docker substrate (deploy/): Dagster + SigNoz + the strider services.
#   - the host edge: the SHARED reverse proxy at /ruby/data/reverse-proxy (a custom
#     `caddy` binary w/ the cloudflare-dns plugin — the stock /usr/bin/caddy lacks
#     it) whose Caddyfile `import`s this repo's sites.caddyfile. The caddy recipes
#     reload/validate it, sourcing the ACME-DNS token from SOPS (never committed).
#
# just --list shows the comment line directly above each recipe, so that line is the
# recipe's one-line summary; longer notes go above it.

# Every recipe's arguments are also its shell's "$1".."$@", verbatim (the astra-ops wrappers
# forward them without re-splitting; just 1.23 has no per-recipe attribute for this).
set positional-arguments

# Before this recipe existed, a bare `just` ran the first recipe: `deploy`.
# List the recipes (what a bare `just` does).
default:
    @"{{just_executable()}}" -f "{{justfile()}}" --list --unsorted

# --- dev: the developer entry point ---

# Safe to re-run. On a machine without just yet: `mise trust && mise install`, activate
# mise in your shell (`mise activate`), then run this.
# Set up a clone: mise.toml's toolchain, both workspaces, the codex guards' Chromium, hooks.
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
# pg-test needs Docker on the host (it starts a throwaway Postgres).
# Run everything CI runs, locally (all but the container-only vellum render goldens).
ci base="origin/main": (_each "ci" ("py-lint,ts-lint,docs-check,ontology-check,routes-check,py-typecheck,ts-typecheck,commitlint " + base + " HEAD,py-test,ts-test,ts-build,corpus-validate,vellum-parity,codex-row-height-drift-guard,codex-virtualization-interaction-guard,weal-engine-rust,weal-engine-hash-check,assay-store-check,pg-test"))

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

# --- dev: one recipe per CI job (ci.yml runs `just <job>`; the names match the job ids) ---

# CI job py-lint: ruff lint + format check.
py-lint:
    uv run ruff check
    uv run ruff format --check

# CI job docs-check: the memory index stays under its size budget and every relative link
# in the living docs (docs/, root docs, READMEs, memory, skills) resolves.
docs-check:
    uv run python scripts/check_docs.py

# Telemetry is off: a sub-second check shouldn't wait on a collector it can't reach.
# CI job assay-store-check: every homebrew store file fits the model and is canonically formatted.
assay-store-check:
    OTEL_SDK_DISABLED=true uv run assay store check

# scripts/ontology_gen.py lists the artifacts and their sources: being.canonical.json from
# being.kdl (Python is the one being.kdl parser; @astra/ontology reads the JSON), the
# fixture entity registry, and libs/ts/config's Zod schema from the Pydantic config models.
# Run it after editing being.kdl, defs.kdl, the fixture snapshot or libs/py/config models.py.
# Regenerate the generated ontology artifacts; `--check` writes nothing and fails if one is stale.
ontology-gen *flags:
    uv run python scripts/ontology_gen.py {{flags}}

# CI job ontology-check: no generated ontology artifact is stale (`just ontology-gen` fixes it).
ontology-check: (ontology-gen "--check")

# Each TanStack Start frontend commits src/routeTree.gen.ts; `vite dev` and `vite build` rewrite
# it, and this writes the same bytes (every route, editor routes included). Pass
# <domain>/<role> names to limit it to those apps. Run it after adding or renaming a route.
# Regenerate the frontends' route trees; `--check` writes nothing and fails if one is stale.
routes-gen *flags:
    node --import ./libs/ts/site-kit/src/nodeTsResolve.mjs libs/ts/site-kit/scripts/route-tree.ts {{flags}}

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
ssr-externals-check:
    node --import ./libs/ts/site-kit/src/nodeTsResolve.mjs libs/ts/site-kit/scripts/ssr-externals-check.ts

# The real wiki lives in astra-data, where heartwood validates it before every commit.
# CI job corpus-validate: the akasha corpus gate over the checked-in fixture wiki.
corpus-validate:
    node --import ./libs/ts/site-kit/src/nodeTsResolve.mjs libs/ts/vellum-lang/scripts/validate-corpus.ts --dir fixtures/astra-data/akasha/content

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
    {{uv_bin}} run --frozen --no-sync python libs/py/vellum-lang/scripts/corpus_parity.py --dir fixtures/vellum --dir fixtures/astra-data/akasha/content --dir apps/strider/web/content

# Not in CI (CI has no astra-data clone). Reads only; the path is config's data.akasha-content.
# Run the vellum parity check over the real wiki in the astra-data clone.
vellum-parity-live:
    #!/usr/bin/env bash
    set -euo pipefail
    dir="$({{uv_bin}} run --frozen --no-sync python -m astra_ontology_config data.akasha-content)"
    exec {{uv_bin}} run --frozen --no-sync python libs/py/vellum-lang/scripts/corpus_parity.py --dir "$dir"

# An empty `from` lints only HEAD (CI's fallback when a push has no usable base).
# CI job commitlint: Conventional Commits over from..to.
commitlint from="origin/main" to="HEAD":
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z {{quote(from)}} ]; then
      exec pnpm exec commitlint --last --verbose
    fi
    exec pnpm exec commitlint --from {{quote(from)}} --to {{quote(to)}} --verbose

# The codex Chromium guards generate the fixture corpus and point CODEX_CORPUS_ROOT at it,
# so they never read the real corpus. They need the Chromium from `just bootstrap`.
# CI job codex-row-height-drift-guard: the listing row pitch is exactly 24px.
codex-row-height-drift-guard:
    pnpm --filter @astra/codex build
    cd apps/codex/web && node --import ../../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/rowHeightDriftGuard.ts

# CI job codex-virtualization-interaction-guard: listing scroll, keys and reload in Chromium.
codex-virtualization-interaction-guard:
    pnpm --filter @astra/codex build
    cd apps/codex/web && node --import ../../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/virtualizationInteractionGuard.ts

# CI-only (see `ci`): runs inside node:24-slim with the Chromium the playwright lock pins.
# CI job vellum-visual-regression: each fixture's rendered PNG against its golden.
vellum-visual-regression:
    pnpm --filter @astra/vellum-render build
    cd apps/vellum/render && node --import ../../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/visual-regression.ts

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

# One git publisher at a time (0036 D36-5): linguist-commit and the heartwood recipes hold
# this flock while they publish. heartwood_dir mirrors config.kdl heartwood.artifacts-path
# (per-run artifacts, backfill.log and backfill.lock, which the request runner and the
# watchdog also read).
git_publish_lock := data_root + "/locks/git-publish.lock"
heartwood_dir := data_root + "/heartwood"

# The deploy checkout (0037 OPS-3): the only tree that builds production (`just deploy`) and
# the tree every host unit runs from (craig-sync, linguist-commit, heartwood-request, watchdog,
# alerting, backup; 0037 item 2c moved the last two bots here). The install recipes link those
# units from here, and deploy.sh keeps its venv + node deps in sync for them. Mirrors
# deploy.sh's ASTRA_DEPLOY_ROOT default.
deploy_root := env_var_or_default("ASTRA_DEPLOY_ROOT", "/ruby/data/astra-deploy")

# astra's own episodes corpus (the live Dagster pipeline's renders + migrated catalog).
# Mirrors config.kdl mouthpiece.episodes-path; override with MOUTHPIECE_EPISODES.
mouthpiece_episodes := env_var_or_default("MOUTHPIECE_EPISODES", data_root + "/mouthpiece/episodes")

# Source for the akasha-frontend session-audio seed (the combined Craig recordings the
# transcript pages play, served same-origin at /audio/<date>.mp3): astra scribe's saved
# dir (mirrors config.kdl scribe ingest-saved-dir, the scribe→linguist handoff), laid out
# as `<date>/audio.mp3`. Override with AKASHA_AUDIO_LIVE.
akasha_audio_live := env_var_or_default("AKASHA_AUDIO_LIVE", data_root + "/scribe/data/saved")

# uv binary (absolute — the linguist-commit systemd user timer has a minimal PATH without
# uv, same reason the service hardcodes just's path). Override with UV_BIN on another host.
# Every `{{uv_bin}} run` passes --frozen --no-sync: these recipes run in the deploy checkout,
# where a plain `uv run` could rewrite a stale uv.lock (leaving the checkout dirty, so the next
# deploy refuses it) or re-sync the venv under a running heartwood agent. deploy.sh's locked
# sync is the only one there; in a dev tree run `uv sync` yourself. The dev-only recipes above
# use the PATH `uv` and may relock.
uv_bin := env_var_or_default("UV_BIN", "/home/jbassin/.local/bin/uv")

# The deploy checkout's host tooling (its venv and node deps) is shared: deploy.sh re-syncs it
# under an exclusive flock on this file, and the heartwood recipes hold a shared flock on it
# while they use it, so a deploy never swaps packages under a running agent (see deploy.sh
# step 3b). Mirrors deploy.sh's HOST_TOOLING_LOCK. Lock order: git_publish_lock, then this
# one; never take git_publish_lock while holding this one (drop it, take git-publish, retake).
host_tooling_lock := data_root + "/locks/host-tooling.lock"

# The data-publishing recipes (linguist-commit, _astra-data-push, mouthpiece-publish, the audio
# seeds, heartwood-agent, _heartwood-push-deploy, heartwood-revert) are thin wrappers over the
# astra-ops CLI (libs/py/ops, 0037 ops-1a): argument lists, never a shell, and the justfile's
# own paths passed explicitly. Every paid or live one asks first; `--yes` skips the question
# (the systemd units and the heartwood request runner pass it). `set positional-arguments` hands
# the recipe's arguments over verbatim as "$@".
ops := quote(uv_bin) + " run --frozen --no-sync astra-ops --data-root " + quote(data_root) + " --uv " + quote(uv_bin) + " --mouthpiece-episodes " + quote(mouthpiece_episodes) + " --akasha-audio " + quote(akasha_audio_live)

# --- Docker substrate (deploy/) ---

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
deploy *args:
    ASTRA_DATA_ROOT="{{data_root}}" "{{justfile_directory()}}/deploy/deploy.sh" {{args}}

# Read-only host check (deploy/doctor.sh; its header lists the checks): tool versions against
# mise.toml, compose bind-mount sources, the linked systemd units, lingering and the age key,
# edge certificate expiry and `astra-expires:` markers. Exits 1 on any failure.
# DOCTOR_SKIP=certs,binds skips checks.
doctor:
    ASTRA_DATA_ROOT="{{data_root}}" ASTRA_DEPLOY_ROOT="{{deploy_root}}" "{{justfile_directory()}}/deploy/doctor.sh"

# Check deploy/wait-healthy.sh (deploy.sh's health wait) against a throwaway compose project of
# alpine containers; never touches the astra project. Needs Docker; about 20 s. Not in `ci`.
deploy-health-test:
    "{{justfile_directory()}}/deploy/tests/wait-healthy-test.sh"

# Alias of `just deploy` (the old name; same args). No args = the whole stack.
up *services:
    "{{just_executable()}}" -f "{{justfile()}}" deploy {{services}}

# Create the data root's dirs as the host user (uid 1000) BEFORE a deploy
# (Docker would otherwise create a missing bind source as root — the root-owned-writes
# problem). `just deploy` does this itself; the dir list lives in deploy/deploy.sh.
artifacts-init:
    ASTRA_DATA_ROOT="{{data_root}}" "{{justfile_directory()}}/deploy/deploy.sh" --init-artifacts

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

# Bridge new Craig recordings from the Drive fuse mount → scribe's LOCAL incoming dir.
# Docker can't bind-mount the google-drive-ocamlfuse mount (not in the daemon's
# namespace), so the host copies new zips down; the craig_drop_sensor (watching the
# local dir) then runs the pipeline. Idempotent: skips zips already synced, copies via
# a `.partial` + atomic rename so the sensor never sees a half-downloaded file. Run on
# a 5-min systemd user timer (`just craig-timer-install`).
craig_drop_dir := env_var_or_default("CRAIG_DROP_DIR", "/ruby/data/home/drive/Craig")
craig-sync:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    src="{{craig_drop_dir}}"
    # scribe.incoming-path from config.kdl (under data.root), through the checkout's venv
    # (deploy.sh keeps the deploy checkout's in sync). Local disk, never the FUSE mount.
    dest="$({{uv_bin}} run --frozen --no-sync python -m astra_ontology_config scribe.incoming-path)"
    case "$dest" in /?*) ;; *) echo "craig-sync: ERROR — could not read scribe.incoming-path from config" >&2; exit 1 ;; esac
    probe_timeout="${CRAIG_SYNC_PROBE_TIMEOUT:-20}"   # listing the mount is near-instant
    copy_timeout="${CRAIG_SYNC_COPY_TIMEOUT:-900}"    # a real ~1 GB recording: minutes over Drive

    # Watchdog: bound EVERY access to the google-drive-ocamlfuse mount WITHOUT ever
    # `wait`-ing on it. A process blocked on a wedged FUSE mount sits in uninterruptible
    # D state, so `timeout`/SIGTERM/SIGKILL can't reap it and would hang us too (proven:
    # a hung mount once stalled this oneshot in `activating` for hours, so the timer never
    # re-armed and the whole pipeline silently stalled at the front door). Instead we run
    # the access in the background and poll with `kill -0` (which never touches the mount);
    # on timeout we abandon the child (it clears harmlessly once the mount recovers) and
    # return non-zero, so the oneshot FAILS — a `failed` unit is visible/alertable and lets
    # craig-sync.timer compute its next trigger, whereas a hung `activating` unit can't.
    run_bounded() {
      local limit="$1"; shift
      "$@" & local pid=$! waited=0
      while kill -0 "$pid" 2>/dev/null; do
        if [ "$waited" -ge "$limit" ]; then
          kill -KILL "$pid" 2>/dev/null || true   # best-effort; D-state ignores it, fine
          return 124
        fi
        sleep 1; waited=$((waited + 1))
      done
      wait "$pid"   # child already exited on its own — surface its real status
    }

    mkdir -p "$dest"   # local disk — safe, never the FUSE mount

    # Enumerate the mount through the watchdog (the bare glob readdir is itself a mount
    # access that can wedge), capturing the listing to a local temp file.
    listing="$(mktemp)"
    trap 'rm -f "$listing"' EXIT
    if ! run_bounded "$probe_timeout" \
        bash -c 'shopt -s nullglob; for f in "$1"/*.zip; do printf "%s\n" "$f"; done' _ "$src" \
        >"$listing"; then
      echo "craig-sync: ERROR — Drive mount '$src' unresponsive (>${probe_timeout}s); failing so the unit is visible/alertable." >&2
      exit 1
    fi

    synced=0
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      base="$(basename "$f")"
      final="$dest/$base"
      [ -e "$final" ] && continue            # already synced — skip (no re-download)
      if ! run_bounded "$copy_timeout" cp "$f" "$final.partial"; then
        rm -f "$final.partial" 2>/dev/null || true   # drop the partial so a later run retries cleanly
        echo "craig-sync: ERROR — copy of $base timed out (>${copy_timeout}s, mount stalled); failing." >&2
        exit 1
      fi
      mv "$final.partial" "$final"           # atomic: sensor sees only complete .zip
      echo "craig-sync: synced $base"
      synced=$((synced + 1))
    done <"$listing"
    echo "craig-sync: $synced new, $(ls "$dest"/*.zip 2>/dev/null | wc -l) total in incoming"

# Install + start the systemd USER timer that runs `craig-sync` every 5 min. Idempotent;
# links the units from the deploy checkout (see _unit-link) and enables the timer. Needs
# lingering (`loginctl enable-linger $USER`) to run without an active login — already on.
craig-timer-install: (_unit-link "craig-sync.service" "craig-sync.timer")
    #!/usr/bin/env bash
    set -euo pipefail
    systemctl --user enable --now craig-sync.timer
    echo "installed. timer schedule:"; systemctl --user list-timers craig-sync.timer --no-pager

# Link systemd USER units from the deploy checkout into ~/.config/systemd/user (0037 OPS-3),
# then daemon-reload. Idempotent: a unit already linked to the same file is left alone; a
# regular-file copy from the old `cp` installs (which `systemctl link` refuses to overwrite)
# or a link to another tree is removed first. Enablement symlinks point at the
# ~/.config/systemd/user path, so they keep working. The files change whenever a deploy
# checks out a new commit: re-run the matching install recipe (or daemon-reload) after a
# deploy that edits a unit.
_unit-link +units:
    #!/usr/bin/env bash
    set -euo pipefail
    unit_dir="$HOME/.config/systemd/user"
    mkdir -p "$unit_dir"
    for name in {{units}}; do
      src="{{deploy_root}}/deploy/systemd/$name"
      dst="$unit_dir/$name"
      [ -f "$src" ] || { echo "unit-link: $src missing — deploy a commit that has it first (just deploy)" >&2; exit 1; }
      if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then continue; fi
      if [ -e "$dst" ] || [ -L "$dst" ]; then rm -f "$dst"; echo "unit-link: replaced old $dst"; fi
      systemctl --user link "$src"
    done
    systemctl --user daemon-reload

# Commit + push the pipeline's new output to the astra-data repo (0037 Phase 1 item 2), then
# redeploy the frontends that bake it: under the git-publish lock, (1) commit the linguist
# datasets, (2) `mouthpiece-publish` + commit the snapshot if it changed, (3) push the clone,
# (4) seed audio + `deploy.sh --skip-failed` akasha-frontend / mouthpiece-frontend for what
# changed. Runs git ONLY against the clone. A failed push still redeploys, then exits 1
# (OnFailure pages) and the next run retries. Steps in detail:
# libs/py/ops/src/astra_ops/publish.py. LIVE: asks first; linguist-commit.service passes --yes.
# Commit + push the pipeline's new output in astra-data, then redeploy what changed (LIVE).
linguist-commit *flags:
    @{{ops}} linguist-commit "$@"

# Publish the astra-data clone (config.kdl data.content-root): fetch; if origin/main moved,
# rebase the clone's local commits onto it (--autostash); push main if it is ahead. Runs git
# ONLY in the clone. Callers (linguist-commit, heartwood) hold the git-publish lock and call
# this in-process; never take that lock here. Exit 8 = fetch, rebase or push failed; the local
# commits stay and the next caller retries. LIVE: asks first; --yes skips the question.
# Push the astra-data clone's local commits (LIVE).
_astra-data-push *flags:
    @{{ops}} astra-data-push "$@"

# Install + start the systemd USER timer that runs `linguist-commit` every 15 min. Idempotent;
# links the units from the deploy checkout (see _unit-link; the service runs the recipe
# there, with the venv deploy.sh keeps in sync). Needs lingering for the user. The timer
# pushes the astra-data clone to its origin, so the user's git identity + a non-interactive
# SSH push key must be available to the systemd user session (same key the user pushes with).
linguist-commit-timer-install: (_unit-link "linguist-commit.service" "linguist-commit.timer" "linguist-commit.path")
    #!/usr/bin/env bash
    set -euo pipefail
    systemctl --user enable --now linguist-commit.timer
    # Event-driven publish: fires linguist-commit the moment session_episode writes the
    # .last-rendered sentinel; the timer above stays on as the fallback sweep.
    systemctl --user enable --now linguist-commit.path
    echo "installed. timer schedule:"; systemctl --user list-timers linguist-commit.timer --no-pager
    echo "path unit:"; systemctl --user is-active linguist-commit.path

# Install the stack-wide Discord alerting (idempotent; re-run after editing any unit).
# Three pieces: (1) the templated OnFailure handler astra-alert@.service — Class C, pages
# when a monitored unit FAILS; (2) the astra-watchdog.{service,timer} — Class B liveness
# (Drive FUSE mount + pipeline timers armed), every 15 min, debounced; (3) re-installs the
# craig-sync + linguist-commit services that carry `OnFailure=astra-alert@%n.service`.
# All of these units are LINKED from the deploy checkout (they ExecStart its scripts and
# recipes, so each deploy updates them). The webhook is decrypted from SOPS at runtime
# (Class A — SigNoz's own Discord channel/rules — lives in SigNoz, not here). Needs
# lingering for the user (already on).
alert-install: (_unit-link "astra-alert@.service" "astra-watchdog.service" "astra-watchdog.timer" "craig-sync.service" "linguist-commit.service")
    #!/usr/bin/env bash
    set -euo pipefail
    systemctl --user enable --now astra-watchdog.timer
    echo "installed. watchdog schedule:"; systemctl --user list-timers astra-watchdog.timer --no-pager
    echo "smoke-test a Discord page with: {{deploy_root}}/deploy/systemd/alert-notify.sh test"
    echo "one-time root step for vanished-mount auto-remediation: just alert-sudoers-install"

# One-time ROOT step: install the NOPASSWD sudoers drop-ins the watchdog's
# auto-remediations need — astra-gdrive (force-restart gdrive.service when the Drive
# mount VANISHES) and astra-ethtool (retrain/renegotiate a frame-corrupting NIC link).
# Validates each with visudo before installing so a bad file can never lock sudo.
# Prompts for your password (system-scope install). Verification is non-destructive
# (`sudo -n -l <cmd>` — never actually restarts the mount or blips the link).
alert-sudoers-install:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    for src in deploy/systemd/sudoers.d/astra-gdrive deploy/systemd/sudoers.d/astra-ethtool; do
      sudo visudo -cf "$src"                     # syntax-check BEFORE touching /etc
      sudo install -o root -g root -m 0440 "$src" "/etc/sudoers.d/$(basename "$src")"
      echo "installed /etc/sudoers.d/$(basename "$src")"
    done
    echo "verifying passwordless commands are allowed:"
    sudo -n -l /usr/bin/systemctl restart gdrive.service >/dev/null && echo "  OK — gdrive restart"
    sudo -n -l /usr/sbin/ethtool -r enp4s0 >/dev/null && echo "  OK — NIC retrain"
    sudo -n -l /usr/sbin/ethtool -s enp4s0 advertise 0x008 >/dev/null && echo "  OK — NIC 100FD fallback — watchdog can now self-heal the link"

# --- backups (0037 OPS-6) ---
# Nightly snapshot to the sda disk (/ruby/data/plex/data/astra-backups): pg_dump of the
# three astra databases, the irreplaceable state dirs (hardlinked against the previous
# snapshot), and the SigNoz alert rules. Keeps 14 daily + 8 weekly snapshots. Everything
# lives in deploy/systemd/astra-backup.sh (header = what, why, retention, manual restore).

# Idempotent; re-run after editing the units. The units are linked from the deploy checkout
# (the service ExecStarts its astra-backup.sh), and a failed run pages through astra-alert@
# (Class C).
# Install + enable the nightly backup timer (03:30) and the weekly restore test (Sun 05:30).
backup-install: (_unit-link "astra-backup.service" "astra-backup.timer" "astra-restore-test.service" "astra-restore-test.timer")
    #!/usr/bin/env bash
    set -euo pipefail
    systemctl --user enable --now astra-backup.timer astra-restore-test.timer
    systemctl --user list-timers astra-backup.timer astra-restore-test.timer --no-pager

# Take one snapshot now, in the foreground (waits if the nightly run holds the lock).
backup-now:
    "{{justfile_directory()}}/deploy/systemd/astra-backup.sh" run

# Each Postgres dump goes into a throwaway --network none container and its row counts are
# compared with dump time and live; state dirs get file counts + a sha256 sample vs the
# source; rule files must parse. Read-only against the live stack. A pass writes the stamp the
# watchdog checks; astra-restore-test.timer runs this weekly.
# Prove the newest snapshot (or the named one) restores.
backup-restore-test snapshot="":
    "{{justfile_directory()}}/deploy/systemd/astra-backup.sh" restore-test {{snapshot}}

# Rules only — never the notification channel, which holds the webhook. The nightly backup
# logs a warning when the live rules drift from the committed copy.
# Re-export the live SigNoz alert rules into deploy/signoz/rules/ for git.
signoz-rules-export:
    "{{justfile_directory()}}/deploy/systemd/astra-backup.sh" export-rules "{{justfile_directory()}}/deploy/signoz/rules"

# Regenerate the mouthpiece snapshot (config data.mouthpiece-snapshot/episodes-index.json, in
# the astra-data clone) from the live corpus — the frontend's single build input. Writes only;
# linguist-commit commits it. Deterministic, so a no-op when nothing new landed. Runs on the
# HOST (needs uv + ffprobe). The publisher refuses a missing episodes dir or a catalog that
# shrinks; `just mouthpiece-publish --allow-shrink` publishes a deliberate removal.
# Regenerate the mouthpiece episode catalog snapshot in the astra-data clone (writes only).
mouthpiece-publish *flags:
    @{{ops}} mouthpiece-publish "$@"

# Seed the mouthpiece-frontend audio dir (D2): flattens the pipeline's nested
# `<date>/<id>.episode.mp3` → `<id>.mp3`, served same-origin at /audio/<id>.mp3. The pre-astra
# back-catalog's mp3s are already in the dir from earlier seeds. Idempotent. LIVE: asks first;
# --yes skips the question.
# Copy the pipeline's episode mp3s into the audio dir mouthpiece-frontend serves (LIVE).
mouthpiece-seed *flags:
    @{{ops}} mouthpiece-seed "$@"

# Seed the akasha-frontend session-audio dir (the combined Craig recordings the transcript
# pages play, served same-origin at /audio/<date>.mp3). Flattens astra scribe's
# `<date>/audio.mp3` → `<date>.mp3`, overwriting. The pre-astra back-catalog's recordings are
# already in the dir from earlier seeds. Idempotent. LIVE: asks first; --yes skips the question.
# Copy scribe's session recordings into the audio dir akasha-frontend serves (LIVE).
akasha-seed *flags:
    @{{ops}} akasha-seed "$@"

# One-time: copy the orator music library out of the old named volume into the data
# root's bind dir (orator-audio is runtime-ingested, NOT re-seedable). Run with the
# orator-backend container stopped. chowns to 1000 so the now-1000 orator-backend writes
# there. Safe to drop the old volume once verified.
orator-audio-migrate:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p "{{data_root}}"/audio/orator
    docker run --rm \
      -v astra-orator-audio:/from:ro \
      -v "{{data_root}}"/audio/orator:/to \
      alpine sh -c 'cp -a /from/. /to/ && chown -R 1000:1000 /to && echo "migrated orator audio -> {{data_root}}/audio/orator"'

# One-time: copy a Postgres data dir out of its old named volume into the data root's
# bind dir, preserving uid-70/0700 so the postgres entrypoint accepts PGDATA. Run with the
# DB container STOPPED. Usage: `just pg-migrate dagster` (or weal / orator).
pg-migrate name:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p "{{data_root}}"/postgres
    docker run --rm \
      -v astra-{{name}}-pg:/from:ro \
      -v "{{data_root}}"/postgres:/parent \
      alpine sh -c '
        set -e
        rm -rf /parent/{{name}}; mkdir /parent/{{name}}
        cp -a /from/. /parent/{{name}}/
        chown -R 70:70 /parent/{{name}}; chmod 700 /parent/{{name}}
        echo "migrated astra-{{name}}-pg -> {{data_root}}/postgres/{{name}}"'

# --- portal (0023) ---

# Bundle the Foundry module (tsdown -> apps/portal/module/dist/main.js). dist/ is
# gitignored; S6 packages module.json + dist/ into portal.zip during the server's
# Docker build (D11 — install-by-Manifest-URL, no host file-drop in steady state).
portal-module-build:
    pnpm --filter @astra/portal-module build

# The live "Faerrin" Foundry stack's data dir (a SEPARATE Compose project/stack,
# apps-network, same host — verified via `docker inspect foundry_faerrin` --format
# '{{json .Mounts}}': the container's rw bind mount is Source
# /emerald/data/apps/apps/foundry_faerrin/data -> Destination /data, and Foundry
# stores installed modules under Data/modules/<module-id>/ inside that). Override
# with FOUNDRY_DATA_DIR if the host layout ever changes.
foundry_faerrin_data := env_var_or_default("FOUNDRY_DATA_DIR", "/emerald/data/apps/apps/foundry_faerrin/data")

# File-drop FALLBACK install (D11's primary path is Manifest URL —
# https://portal.iridi.cc/module/module.json, which Foundry fetches itself with no
# host step at all). Builds the module locally, then copies module.json + dist/
# straight into the live Foundry data dir's modules/portal/ — no restart needed,
# Foundry re-reads module.json on next world launch / module refresh. Idempotent
# (mkdir -p + overwrite-copy); does NOT touch the foundry_faerrin container itself,
# only its host-side bind-mount source directory.
portal-module-install: portal-module-build
    #!/usr/bin/env bash
    set -euo pipefail
    dest="{{foundry_faerrin_data}}/Data/modules/portal"
    mkdir -p "$dest/dist"
    cp apps/portal/module/module.json "$dest/module.json"
    cp apps/portal/module/dist/main.js "$dest/dist/main.js"
    echo "installed portal module -> $dest (restart/refresh Foundry to pick it up)"

# --- codex (0029) ---

# Refresh the codex corpus (D29-4): re-fetch both snapshots, re-transform, print
# the report summary. A deliberate, diffable event, never implicit in a build —
# refuses to run if the git index is dirty under apps/codex/web (the
# corpus-manifest.json diff must be reviewable alone, the linguist-commit-timer
# lesson applied here too). Re-downloads ~259 MB (AoN) + the Foundry sparse
# clone; not cheap, don't run casually.
codex-refresh:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    # codex.data-path (config.kdl, under data.root): the scripts below write there via
    # @astra/config; this recipe needs it for the report.
    codex_data="$({{uv_bin}} run --frozen --no-sync python -m astra_ontology_config codex.data-path)"
    if [ -n "$(git status --porcelain -- apps/codex/web)" ]; then
      echo "codex-refresh: apps/codex/web has uncommitted changes — commit or stash first" >&2
      echo "(the corpus-manifest.json diff from this refresh must be reviewable alone):" >&2
      git status --porcelain -- apps/codex/web >&2
      exit 1
    fi
    echo "codex-refresh: fetching Foundry snapshot..."
    pnpm --filter @astra/codex fetch:foundry
    echo "codex-refresh: fetching AoN snapshot..."
    pnpm --filter @astra/codex fetch:aon
    echo "codex-refresh: running the transform..."
    pnpm --filter @astra/codex transform
    echo ""
    echo "codex-refresh: building the search index..."
    just codex-search-index
    echo ""
    echo "codex-refresh: done. report.md summary:"
    head -n 40 "$codex_data/corpus/report.md"
    echo ""
    # D29-57: corpusFs.ts caches the corpus per category per-process, so a running
    # container keeps serving stale categories after a host-side refresh until it
    # restarts — a restart is the cheap, deterministic flush (the Pagefind
    # staticMount needs no restart, it's per-request fail-soft). Guarded so a fresh
    # host / no-docker / not-yet-deployed environment never fails this recipe. The restart
    # goes through `just deploy --restart` (takes the deploy lock, logs to history.jsonl) but
    # builds nothing: the corpus is a runtime mount, not image content.
    echo "codex-refresh: checking for a running astra-codex container (D29-57)..."
    if command -v docker >/dev/null 2>&1 && [ -n "$(docker ps -q -f name='^astra-codex$' 2>/dev/null || true)" ]; then
      echo "codex-refresh: astra-codex is running — restarting to flush corpus caches..."
      "{{just_executable()}}" deploy --restart codex
    else
      echo "codex-refresh: astra-codex not running (or docker unavailable) — skipping restart."
    fi

# Build the codex Pagefind search index (D29-34) from the current corpus at
# <codex.data-path>/corpus/ into <codex.data-path>/search/pagefind/, served at
# /pagefind/ via server.ts's staticMount. HOST-ONLY — the native Pagefind
# indexer peaks at ~3.8 GB RSS during writeFiles over the full 46k-entity
# corpus (measured) — this must NEVER run in CI, a Docker build, or `vite
# build`; it's a deliberate, standalone, host-run step, same posture as
# codex-refresh (which calls this after the transform). The server picks up
# a freshly-built index with no restart (StaticMount fails soft per-request).
codex-search-index:
    pnpm --filter @astra/codex search:build

# Opt-in, host-only (not in `ci`): check the real corpus at <codex.data-path>/corpus/ the
# way a production server does (this schema generation, not the fixture), spot-check
# it, and render an entity page from it through a fresh build. Every other codex test
# and guard reads the committed fixture.
codex-real-corpus:
    pnpm --filter @astra/codex build
    cd apps/codex/web && CODEX_REAL_CORPUS=1 pnpm exec vitest run src/realCorpus.test.ts

# --- weal engine (0032 D32-13) ---

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
    # The JSON contract's TS types (gen/weal_api.d.ts), generated from api.rs by ts-rs.
    WEAL_WRITE_TS_BINDINGS=1 cargo test --lib --quiet ts_bindings_are_current
    if strings -n 8 "$gen/weal_engine_bg.wasm" | grep -qF "$HOME"; then echo "FATAL: the wasm embeds $HOME (path remapping failed)" >&2; exit 1; fi
    tools/gen-stamp.sh write {{quote(weal_stamp)}}
    sha256sum "$gen"/weal_engine_bg.wasm "$gen"/weal_engine.js

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

# --- heartwood (0033) ---

# Warm the heartwood agent's sandbox (0033 D33-3): dspy's PythonInterpreter runs Deno +
# Pyodide, and its runner.js imports an UNPINNED `npm:pyodide` + deno.land/std, fetched into
# the Deno cache on first use (network). Run once per host, and again after a Deno-cache wipe
# or a new Pyodide release — then re-run gate C (the scripted real-Deno test). Prints the
# resolved Pyodide version for the build record. dspy calls bare `deno`, hence the PATH;
# `prepare_sandbox_env` also sets DENO_NO_PACKAGE_JSON (the repo's package.json otherwise
# hides npm:pyodide) and a real-path DENO_DIR ($HOME is a symlink; Deno's read grant must
# name the resolved cache path) — the same env every agent run uses.
heartwood-sandbox-warm:
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="$HOME/.deno/bin:$PATH"
    deno --version | head -1
    {{uv_bin}} run --frozen --no-sync python -c 'from astra_heartwood.agent.run import make_interpreter as mk, sandbox_version as v; i = mk(); print("sandbox:", i.execute("print(1)").strip()); print("pyodide:", v(i)); i.shutdown()'

# Run the heartwood agent over ONE session and publish its edits to akasha with no human
# review (0033 §5) — PAID (OpenRouter LLM calls) and LIVE (pushes + redeploys akasha). Every
# git step runs in the astra-data clone (config.kdl data.content-root), never the code repo:
#   just heartwood-agent 2025-8-28              run → publish → commit → push → redeploy
#   just heartwood-agent 2025-8-28 --dry-run    run + artifacts only (still PAID)
#   just heartwood-agent 2025-8-28 --no-push    commit locally, no push/redeploy (backfill)
#   just heartwood-agent 2025-8-28 --dry-run --model=<id> [--sub-model=<id>]
#                                               override heartwood.model / sub-model for this
#                                               run only (model comparisons; no config edit)
#   ... --yes                                   skip the question (unattended callers)
# Steps, lock order and exit codes: libs/py/ops/src/astra_ops/heartwood.py (exit 10 = a lock
# busy for 30 min, 64 = bad flag or no terminal and no --yes).
# Run + publish one session via the heartwood agent (PAID + LIVE; --dry-run / --no-push).
heartwood-agent date *flags:
    @{{ops}} heartwood-agent "$@"

# Shared tail of the heartwood recipes: push the astra-data clone (never the code repo), then
# rebuild + redeploy akasha-frontend via deploy.sh. A failed push still redeploys, then exits 8;
# 9 = redeploy failed. Rerunning retries both. LIVE: asks first; --yes skips the question.
# Push the astra-data clone and redeploy akasha-frontend (the heartwood tail; LIVE).
_heartwood-push-deploy *flags:
    @{{ops}} heartwood-push-deploy "$@"

# Undo ONE published heartwood session (0033 §5) — LIVE (pushes + redeploys akasha): reverts the
# session's commit in the astra-data clone, regenerates the ledger, snapshot and registry,
# validates, commits, pushes and redeploys. Steps, lock order and exit codes:
# libs/py/ops/src/astra_ops/heartwood.py. Asks first; --yes skips the question.
# Undo one published heartwood session: revert commit + ledger line + push + redeploy (LIVE).
heartwood-revert date *flags:
    @{{ops}} heartwood-revert "$@"

# Replay every pending faerrin session oldest-first (0033 §5) — PAID + LIVE, hours long.
# Always runs DETACHED as the transient user unit `heartwood-backfill` (survives the shell;
# output → <data root>/heartwood/backfill.log; follow with `tail -f`). `from` = first date
# (inclusive); dates the ledger shows as published are skipped, so re-running resumes.
# While it runs, linguist-commit.{timer,path} are stopped (they push the astra-data clone
# whenever it is ahead, and take the git-publish lock) and <data root>/heartwood/backfill.lock tells the watchdog not to page about it. The
# loop's EXIT trap re-arms both units and removes the lock; a HARD-killed backfill (SIGKILL,
# reboot) skips the trap — then run `just heartwood-backfill-reset`. Stop it cleanly with
# `systemctl --user stop heartwood-backfill` (the trap still runs). The loop always runs the
# deploy checkout's recipes (production code at a pushed sha), whichever checkout launched it.
# Replay all pending faerrin sessions, detached + budget-capped (PAID + LIVE).
heartwood-backfill from="":
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    log="{{heartwood_dir}}/backfill.log"
    mkdir -p "{{heartwood_dir}}"
    if systemctl --user is-active --quiet heartwood-backfill.service; then
      echo "heartwood-backfill: already running — tail -f $log" >&2; exit 1
    fi
    systemctl --user reset-failed heartwood-backfill.service 2>/dev/null || true
    # The user manager's PATH lacks nvm's node and ~/.deno/bin — hand the unit ours.
    env_args=(--setenv=PATH="$HOME/.deno/bin:$PATH" --setenv=HOME="$HOME")
    if [ -n "${SSH_AUTH_SOCK:-}" ]; then env_args+=(--setenv=SSH_AUTH_SOCK="$SSH_AUTH_SOCK"); fi
    systemd-run --user --unit=heartwood-backfill --collect \
      --working-directory="{{deploy_root}}" "${env_args[@]}" \
      -p StandardOutput=append:"$log" -p StandardError=append:"$log" \
      "{{just_executable()}}" -f "{{deploy_root}}/justfile" _heartwood-backfill-loop "{{from}}"
    echo "heartwood-backfill: launched detached — tail -f $log"
    echo "  stop: systemctl --user stop heartwood-backfill   (hard-killed? just heartwood-backfill-reset)"

# The backfill's body (run by `heartwood-backfill` inside its systemd unit — not directly).
# Before each date: `budget-check` (stop when the ledger's summed cost_usd >= the config's
# heartwood backfill-budget-usd, or any ledger cost is unknown — so the last run may
# overshoot by its own cost). Each date = `heartwood-agent <date> --no-push`; any non-zero
# exit stops the loop. Stopped or done, it pushes what is committed + redeploys akasha once.
_heartwood-backfill-loop from:
    #!/usr/bin/env bash
    # No -e: every failure below is handled explicitly so the push + re-arm still happen.
    set -uo pipefail
    cd "{{justfile_directory()}}" || exit 1
    export PATH="$HOME/.deno/bin:$PATH"
    from="{{from}}"
    lock="{{heartwood_dir}}/backfill.lock"
    hw() { "{{uv_bin}}" run --frozen --no-sync astra-heartwood-agent "$@"; }
    ts() { date -u +%FT%TZ; }
    rearm() {
      rm -f "$lock"
      if systemctl --user start linguist-commit.timer linguist-commit.path; then
        echo "heartwood-backfill: linguist-commit timer + path re-armed"
      else
        echo "heartwood-backfill: re-arm FAILED — run: just heartwood-backfill-reset" >&2
      fi
      # 0036: re-arm the request runner and drain anything Dagster filed meanwhile (no-block:
      # a drained request can run for an hour).
      systemctl --user start heartwood-request.timer heartwood-request.path 2>/dev/null \
        && systemctl --user start --no-block heartwood-request.service 2>/dev/null \
        || echo "heartwood-backfill: heartwood-request re-arm skipped (units not installed?)" >&2
      echo "=== heartwood backfill end $(ts)"
    }
    echo "=== heartwood backfill start $(ts) (from: ${from:-the first session})"
    mkdir -p "{{heartwood_dir}}"
    touch "$lock"            # before the stop, so the watchdog never sees a disarmed timer
    trap rearm EXIT
    trap 'exit 143' TERM INT HUP
    systemctl --user stop linguist-commit.timer linguist-commit.path \
      || { echo "heartwood-backfill: could not stop linguist-commit units" >&2; exit 1; }
    # The 0036 request runner too: stop its triggers, then wait out an in-flight run (it may
    # be publishing a date this loop would otherwise run again).
    systemctl --user stop heartwood-request.timer heartwood-request.path 2>/dev/null || true
    for svc in linguist-commit.service heartwood-request.service; do
      waited=0
      while :; do
        state="$(systemctl --user is-active "$svc")"
        case "$state" in active|activating|deactivating|reloading) ;; *) break ;; esac
        if [ "$waited" -ge 1800 ]; then
          echo "heartwood-backfill: $svc still $state after 30 min — aborting" >&2; exit 1
        fi
        echo "heartwood-backfill: waiting for $svc ($state)…"
        sleep 15; waited=$((waited + 15))
      done
    done
    sessions_args=(); if [ -n "$from" ]; then sessions_args=(--from "$from"); fi
    if ! pending="$(hw sessions "${sessions_args[@]}")"; then
      echo "heartwood-backfill: listing sessions FAILED" >&2; exit 1
    fi
    todo=(); while IFS= read -r d; do [ -n "$d" ] && todo+=("$d"); done <<<"$pending"
    echo "heartwood-backfill: ${#todo[@]} pending session(s): ${todo[*]}"
    published=0; stop=""; rerun=""
    for d in "${todo[@]}"; do
      if ! hw budget-check; then stop="budget"; rerun="$d"; break; fi
      echo "--- $(ts) $d"
      rc=0; "{{just_executable()}}" -f "{{justfile()}}" heartwood-agent "$d" --no-push --yes || rc=$?
      if [ "$rc" -ne 0 ]; then
        stop="heartwood-agent $d exited $rc (1 failed · 2 incomplete · 3 conflict · 4 refused · 6 dirty · 7 validate/snapshot/seed · 8 commit)"
        rerun="$d"; break
      fi
      published=$((published + 1))
    done
    echo "heartwood-backfill: published $published session(s) this run"
    # Push + redeploy once if the astra-data clone has unpushed commits (never the code repo).
    repo="$("{{uv_bin}}" run --frozen --no-sync python -m astra_ontology_config data.content-root)"
    if [ -n "$(git -C "$repo" rev-list origin/main..HEAD 2>/dev/null)" ]; then
      "{{just_executable()}}" -f "{{justfile()}}" _heartwood-push-deploy --yes \
        || echo "heartwood-backfill: push/redeploy FAILED — rerun: just _heartwood-push-deploy" >&2
    fi
    if [ -n "$stop" ]; then
      echo "heartwood-backfill: STOPPED — $stop"
      echo "heartwood-backfill: resume with: just heartwood-backfill $rerun"
      exit 1
    fi
    echo "heartwood-backfill: complete"

# Recover from a HARD-killed backfill (its EXIT trap never ran): re-arm linguist-commit's
# timer + path units and remove the watchdog lock. Refuses while the backfill still runs.
# Re-arm linguist-commit + drop the watchdog lock after a hard-killed backfill.
heartwood-backfill-reset:
    #!/usr/bin/env bash
    set -euo pipefail
    if systemctl --user is-active --quiet heartwood-backfill.service; then
      echo "heartwood-backfill-reset: the backfill is still running — stop it first:" >&2
      echo "  systemctl --user stop heartwood-backfill   (its EXIT trap re-arms + unlocks)" >&2
      exit 1
    fi
    systemctl --user reset-failed heartwood-backfill.service 2>/dev/null || true
    systemctl --user start linguist-commit.timer linguist-commit.path
    rm -f "{{heartwood_dir}}/backfill.lock"
    systemctl --user start heartwood-request.timer heartwood-request.path 2>/dev/null \
      && systemctl --user start --no-block heartwood-request.service 2>/dev/null \
      || echo "heartwood-backfill-reset: heartwood-request units not installed — skipped" >&2
    echo "heartwood-backfill-reset: linguist-commit.timer $(systemctl --user is-active linguist-commit.timer), .path $(systemctl --user is-active linguist-commit.path); lock removed"

# --- heartwood in Dagster (0036) ---
# The host side of Dagster's session_wiki asset: run `just heartwood-agent <date>` for every
# pending request under heartwood.requests-path, oldest first, and write each result —
# PAID + LIVE per request (the agent run + publish). Started by heartwood-request.path
# (fires when Dagster files a request) and heartwood-request.timer (hourly fallback); safe
# to run by hand (no-op with nothing pending). The systemd user PATH lacks uv/just/node, so
# the runner resolves each tool itself (preflight) — never call bare `uv` here.
heartwood-requests:
    cd "{{justfile_directory()}}" && JUST="{{just_executable()}}" UV="{{uv_bin}}" "{{uv_bin}}" run --frozen --no-sync astra-heartwood-agent drain-requests

# Links the units from the deploy checkout (see _unit-link; the service runs the recipe
# there, with the venv + node deps deploy.sh keeps in sync).
# Install + start the 0036 request runner units (idempotent; re-run after editing them).
heartwood-request-install: artifacts-init (_unit-link "heartwood-request.service" "heartwood-request.path" "heartwood-request.timer")
    #!/usr/bin/env bash
    set -euo pipefail
    systemctl --user enable --now heartwood-request.path heartwood-request.timer
    echo "path unit: $(systemctl --user is-active heartwood-request.path)"
    systemctl --user list-timers heartwood-request.timer --no-pager

# --- mouthpiece producer (0034) ---
# Warm the dspy sandbox (Deno + Pyodide) the producer runs in — idempotent; the first run
# fetches Pyodide into DENO_DIR (network), later runs are offline.
mouthpiece-sandbox-warm:
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="$HOME/.deno/bin:$PATH"
    deno --version | head -1
    {{uv_bin}} run --frozen --no-sync python -c 'from astra_llm.rlm import make_interpreter as mk, sandbox_version as v; i = mk(); print("sandbox:", i.execute("print(1)").strip()); print("pyodide:", v(i)); i.shutdown()'

# The 0034 comparison for ONE session — PAID (OpenRouter: the producer RLM + one two-pass
# script per experiment-models arm, ≈ $2–3), never live: writes only under
# <data root>/mouthpiece/experiments/<date>/<run>/ (no TTS, nothing under episodes/, no commit).
#   just mouthpiece-experiment 2026-10-5
#   just mouthpiece-experiment 2026-10-5 --arm glm-5.3
#   just mouthpiece-experiment 2026-10-5 --reuse-brief /ruby/data/astra-state/mouthpiece/experiments/2026-10-5/<run>
mouthpiece-experiment date *flags: mouthpiece-sandbox-warm
    cd "{{justfile_directory()}}" && {{uv_bin}} run --frozen --no-sync astra-mouthpiece-producer experiment {{date}} {{flags}}

# The prediction-roundtable special. dossier + script are PAID (OpenRouter) and write only
# under <data root>/mouthpiece/experiments/roundtable-<latest>/<run>/; render is PAID + LIVE.
#   just mouthpiece-roundtable dossier                  survey the main campaign → mystery file
#   just mouthpiece-roundtable script <run-dir>         ~45-min roundtable script from it
#   just mouthpiece-roundtable render <run-dir>         TTS + assemble into episodes/ + auto-publish
mouthpiece-roundtable *args: mouthpiece-sandbox-warm
    cd "{{justfile_directory()}}" && export PATH="$HOME/.deno/bin:$PATH" && {{uv_bin}} run --frozen --no-sync astra-mouthpiece-roundtable {{args}}

# --- Host edge (shared reverse proxy) ---

# The decrypted CF token, exported as {$CF_API_TOKEN} for the caddyfile adapter.
cf_token := "CF_API_TOKEN=\"$(SOPS_AGE_KEY_FILE=" + sops_age_key + " sops -d --extract '[\"cloudflare_key\"]' " + sops_file + ")\""

# Reload the shared reverse proxy with astra's sites (CF token from SOPS, substituted at adapt time — never on disk).
caddy-reload:
    {{cf_token}} {{reverse_proxy_dir}}/caddy reload --config {{reverse_proxy_dir}}/Caddyfile --adapter caddyfile

# Validate the merged edge (main Caddyfile imports astra's sites) — so parent
# snippets like local_only resolve. Adapt-only; no provisioning.
caddy-validate:
    {{cf_token}} {{reverse_proxy_dir}}/caddy validate --config {{reverse_proxy_dir}}/Caddyfile --adapter caddyfile

# Tail the edge logs (mirrors the reverse-proxy justfile's `logs`).
caddy-logs:
    journalctl -fu caddy.service
