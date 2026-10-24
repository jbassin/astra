#!/usr/bin/env bash
# astra deploy (0037 OPS-3) — the ONE way production gets built and started.
#
#   deploy.sh [--sha REV] [--dry-run] [--skip-failed] [SERVICE...]
#                                                    build + (re)start SERVICEs (none = all)
#   deploy.sh --restart SERVICE...                   restart running containers, no build (then 7b)
#   deploy.sh --init-artifacts                       create the data root's dirs only
#   deploy.sh --host-tooling                         sync the deploy checkout's host tooling only
#
# `just deploy …` calls this; `just up …` is an alias. Production builds ONLY from the deploy
# checkout $ASTRA_DEPLOY_ROOT (default /ruby/data/astra-deploy, a plain clone of origin), never
# from a developer working tree, so what runs is always a pushed commit and nobody's
# half-finished edits can ship. Steps of a deploy:
#   1. take the deploy lock ($DATA_ROOT/deploy/deploy.lock, waits up to DEPLOY_LOCK_TIMEOUT s)
#   2. git fetch origin
#   2a. copy origin/main's deploy/deploy.sh and deploy/wait-healthy.sh to $DATA_ROOT/deploy/bin/
#      and re-exec that copy (it inherits the deploy lock), so the deploy logic is always
#      origin/main's, whatever sha the deploy checkout (whose justfile the bots run) is at.
#      ASTRA_DEPLOY_STAGED=1 skips this and runs the invoked script as it is (the escape
#      hatch when main's deploy.sh itself is broken).
#   2b. target = --sha REV, else the rollback pin (below), else origin/main; with
#      --skip-failed, exit 11 without building when the last deploy of exactly these
#      services already failed to build or come up (exit 7 or 10) at this code sha and
#      astra-data HEAD (linguist-commit passes it, so a broken build is not retried and
#      re-paged every run; a new code or data commit retries)
#   3. refuse a target that is not on origin/main (unpushed) and a deploy checkout with any
#      tracked change or untracked non-ignored file; then take the host-tooling lock (3b)
#      when the checkout or the venv will change, and `git checkout --detach <sha>`
#   3b. bring the deploy checkout's host tooling up to date (sync_host_tooling): the bot
#      units (linguist-commit, heartwood-request, craig-sync) run their recipes from this
#      checkout, so it needs the Python venv (`uv sync --frozen`) and the node deps of
#      the vellum validator heartwood runs (`pnpm install --frozen-lockfile --filter
#      @astra/vellum-lang`). Both are no-ops when nothing changed. The checkout and the
#      sync run under an exclusive flock on $DATA_ROOT/locks/host-tooling.lock; the
#      heartwood recipes hold it shared while they run, so a deploy never changes the
#      source, venv or validator deps under a running agent (waits up to
#      HOST_TOOLING_LOCK_TIMEOUT s, default 600, then exits 9 with nothing changed). A
#      deploy at the checkout's current sha with an in-sync venv takes no lock.
#   4. decrypt SOPS on the host and export each secret UPPER_CASED (roadmap Decision E: the
#      compose `environment:` blocks pass the keys each service needs, and @astra/config's
#      env-override path resolves them in-container — no sops/age key/secrets in any image)
#   5. create the data root's dirs as uid 1000 (the compose binds refuse a missing source)
#   6. export the astra-data clone's HEAD ($ASTRA_CONTENT_ROOT, default
#      $DATA_ROOT/astra-data = config.kdl data.content-root) into a temp dir and
#      pass it as ASTRA_DATA_CONTEXT: akasha-frontend and mouthpiece-frontend bake the
#      published datasets from that `astra-data` build context (compose additional_contexts).
#      Committed content only — whatever the pipeline or a heartwood run has written but
#      not yet committed in the clone never ships. The clone's HEAD need not be pushed (the
#      bots push after they commit; a failed push must not hold the site back), but a HEAD
#      ahead of the clone's origin/main is logged as a WARNING and recorded (data_unpushed).
#   7. docker compose up -d --build [SERVICE...] with ASTRA_REVISION=<sha>, which every built
#      image carries as the org.opencontainers.image.revision label
#   7b. wait (up to DEPLOY_HEALTH_TIMEOUT s, default 180) for every container of the deployed
#      services to be healthy (wait-healthy.sh: healthcheck `healthy`; no healthcheck =
#      running 15 s without a restart; one-shots exited 0). On a timeout print the failing
#      containers with their last log lines and the rollback command, record `unhealthy`
#      and exit 10. Nothing is rolled back automatically.
#   8. record the outcome (below)
# --dry-run does 1–3's checks and prints the compose command; it never checks out, syncs
# tooling, runs sops or runs docker.
#
# Rollback = `deploy.sh --sha <older pushed sha> [SERVICE...]`. A --sha deploy whose target
# is not origin/main pins production there: every later deploy without --sha (the bots'
# scoped redeploys included) builds the pinned sha instead of origin/main and says so, so a
# data publish does not quietly undo the rollback. Unpin with `deploy.sh --sha origin/main`.
#
# What is live. The image label is the source of truth:
#   docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' astra-codex
# The files below are a convenience for humans and scripts:
#   $DATA_ROOT/deploy/live/<service>   the sha that service was last deployed at, one file per
#                                      compose service (a whole-stack deploy rewrites all of
#                                      them; a scoped one only its own). `--restart` leaves them.
#   $DATA_ROOT/deploy/history.jsonl    one JSON line per attempt that got past argument parsing:
#                                      {time, mode, sha, data_sha, data_unpushed, pinned,
#                                      services, result, exit}. mode is deploy / restart /
#                                      dry-run; services is "all" or a list; data_sha is the
#                                      astra-data commit baked in ("" when the deploy did not
#                                      export it); data_unpushed counts its commits not on the
#                                      clone's origin/main (null = not exported or unknown);
#                                      pinned is true while a rollback pins production;
#                                      result is ok / failed / unhealthy.
#
# Exit codes: 0 ok · 2 usage · 3 lock busy · 4 target unknown or not pushed · 5 deploy checkout
# dirty or missing · 6 secrets decrypt failed · 7 docker compose failed · 8 the astra-data
# clone is missing or its HEAD could not be exported (nothing built) · 9 the host tooling
# sync failed (nothing built; the checkout is already at the target — fix, then redeploy) ·
# 10 started, but a container did not become healthy (the new containers keep running) ·
# 11 --skip-failed: this build already failed at this code and data, nothing done ·
# 12 codex is in scope but <data root>/codex/data/releases/current is missing (nothing done).
#
# history.jsonl is read leniently: a line that is not a JSON object is skipped, never fatal.
#
# All runtime state lives under the one data root $DATA_ROOT (ASTRA_DATA_ROOT, default
# /ruby/data/astra-state = config.kdl data.root, whose comment lists the layout); the
# compose bind mounts point there, never into a code checkout.
set -Eeuo pipefail

# systemd user units have a minimal PATH; sops lives in /usr/local/bin.
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

DEPLOY_ROOT="${ASTRA_DEPLOY_ROOT:-/ruby/data/astra-deploy}"
# The data root (mirrors config.kdl data.root; the same variable overrides it there).
DATA_ROOT="${ASTRA_DATA_ROOT:-/ruby/data/astra-state}"
# The astra-data clone (mirrors config.kdl data.content-root; the same variable overrides it).
CONTENT_REPO="${ASTRA_CONTENT_ROOT:-$DATA_ROOT/astra-data}"
LOCK_TIMEOUT="${DEPLOY_LOCK_TIMEOUT:-1800}"
# sops's own default key location; the key never lives in a checkout that builds images.
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"

HEALTH_TIMEOUT="${DEPLOY_HEALTH_TIMEOUT:-180}"
TOOLING_LOCK_TIMEOUT="${HOST_TOOLING_LOCK_TIMEOUT:-600}"
# Next to this script: after step 2a that is the staged origin/main copy in
# $DATA_ROOT/deploy/bin/, never the deploy checkout's (possibly older) one.
WAIT_HEALTHY="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/wait-healthy.sh"

STATE_DIR="$DATA_ROOT/deploy"
HISTORY="$STATE_DIR/history.jsonl"
# Shared with the heartwood recipes (justfile host_tooling_lock).
HOST_TOOLING_LOCK="$DATA_ROOT/locks/host-tooling.lock"
COMPOSE_FILE="$DEPLOY_ROOT/deploy/docker-compose.yml"
SECRETS_FILE="$DEPLOY_ROOT/deploy/sops/secrets.enc.yaml"

log() { printf 'deploy: %s\n' "$*" >&2; }
die() {
  local code="$1"
  shift
  log "ERROR: $*"
  exit "$code"
}

# The data root's dirs (the layout in config.kdl's `data` comment), created as the host
# user (uid 1000) before any container starts. Every compose bind mount sets
# create_host_path: false, so a source missing from this list fails the deploy instead of
# Docker creating it as root. On a fresh host the PGDATA dirs start empty here and the
# postgres entrypoint (root) chowns them to uid 70, mode 0700; on an existing host mkdir -p
# leaves them alone. The astra-data clone is not made here (it is a git clone; step 6
# refuses a missing one). `just artifacts-init` calls this too, so the list lives in one
# place. Add a dir here (and to the config.kdl comment) when the compose file or config
# gains a data path.
init_artifacts() {
  local r="$DATA_ROOT"
  mkdir -p "$r"/scribe/{incoming,data,tmp} "$r"/linguist/script \
    "$r"/mouthpiece/{episodes,experiments} \
    "$r"/heartwood/requests/logs \
    "$r"/codex/data/releases "$r"/menhir \
    "$r"/audio/{akasha,mouthpiece,orator} "$r"/postgres/{dagster,orator,weal} "$r"/portal-oauth \
    "$r"/node-exporter/textfile "$r"/deploy/live "$r"/locks
}

# Step 3b. The bot units run their recipes from the deploy checkout, so it needs the
# host-side tooling those recipes use: the uv workspace venv (every `uv run` — the
# config lookups, mouthpiece-publish, akasha-snapshot, the entity seed, the heartwood
# agent) and the node deps of the vellum validator (heartwood-agent's validate-corpus.ts
# and the agent's write_page check; nodeTsResolve.mjs needs only node builtins). Nothing
# else on the host runs node from this checkout, so pnpm installs that one package only.
# --frozen / --frozen-lockfile never touch the lockfiles (a changed lockfile would make the
# checkout dirty and refuse the next deploy); --ignore-scripts runs no package scripts.
# Both are no-ops (about a second each) when nothing changed. A systemd unit's PATH has
# neither uv nor nvm's node, so both are resolved the way the heartwood recipes do.
resolve_uv() {
  UV="${UV_BIN:-$(command -v uv || echo "$HOME/.local/bin/uv")}"
  [ -x "$UV" ] || { log "uv not found (UV_BIN, PATH, ~/.local/bin)"; return 1; }
}

# True when the deploy checkout's venv matches its uv.lock (nothing to sync).
venv_in_sync() { (cd "$DEPLOY_ROOT" && "$UV" sync --frozen --check --quiet) 2>/dev/null; }

# The host-tooling lock, exclusively: the heartwood recipes hold it shared while they run,
# so this waits for a running agent before anything changes under it (its editable-installed
# source, venv or validator deps). Held until release_tooling_lock or exit.
TOOLING_FD=""
take_tooling_lock() {
  mkdir -p "$(dirname "$HOST_TOOLING_LOCK")"
  exec {TOOLING_FD}>"$HOST_TOOLING_LOCK"
  flock -x -n "$TOOLING_FD" && return 0
  log "a heartwood run is using the deploy checkout — waiting up to ${TOOLING_LOCK_TIMEOUT}s for $HOST_TOOLING_LOCK"
  flock -x -w "$TOOLING_LOCK_TIMEOUT" "$TOOLING_FD" ||
    { log "host-tooling lock still busy after ${TOOLING_LOCK_TIMEOUT}s"; return 1; }
}
release_tooling_lock() {
  if [ -n "$TOOLING_FD" ]; then exec {TOOLING_FD}>&-; fi
  TOOLING_FD=""
}

# The sync itself; the caller holds the host-tooling lock whenever anything can change.
sync_host_tooling() {
  local node node_dir
  node="$(command -v node ||
    for n in "$HOME"/.nvm/versions/node/v*/bin/node; do if [ -x "$n" ]; then echo "$n"; fi; done |
    sort -V | tail -n 1)"
  [ -n "$node" ] || { log "node not found (PATH or ~/.nvm)"; return 1; }
  node_dir="$(dirname "$node")"
  log "host tooling: uv sync --frozen; pnpm install --filter @astra/vellum-lang (node $("$node" --version))"
  if ! venv_in_sync; then
    (cd "$DEPLOY_ROOT" && "$UV" sync --frozen --quiet) || { log "uv sync --frozen failed in $DEPLOY_ROOT"; return 1; }
  fi
  # pnpm comes from corepack next to node (root package.json pins the version).
  (cd "$DEPLOY_ROOT" && PATH="$node_dir:$PATH" COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    pnpm install --frozen-lockfile --ignore-scripts --reporter=silent --filter @astra/vellum-lang) ||
    { log "pnpm install --frozen-lockfile failed in $DEPLOY_ROOT"; return 1; }
}

usage() {
  log "usage: deploy.sh [--sha REV] [--dry-run] [--skip-failed] [SERVICE...] | --restart SERVICE... | --init-artifacts | --host-tooling"
  exit 2
}

# --- arguments --------------------------------------------------------------------------

orig_args=("$@")
mode=deploy
rev=""
skip_failed=0
services=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --sha)
      [ -n "${2:-}" ] || usage
      rev="$2"
      shift 2
      ;;
    --sha=?*)
      rev="${1#--sha=}"
      shift
      ;;
    --dry-run)
      mode=dry-run
      shift
      ;;
    --skip-failed)
      skip_failed=1
      shift
      ;;
    --restart)
      mode=restart
      shift
      ;;
    --init-artifacts)
      init_artifacts
      exit 0
      ;;
    --host-tooling)
      # The deploy checkout as it stands (no fetch, no checkout, no deploy lock): for a first
      # install of the bot units before their next deploy.
      resolve_uv || die 9 "host tooling sync failed"
      if ! venv_in_sync; then take_tooling_lock || die 9 "nothing synced"; fi
      sync_host_tooling || die 9 "host tooling sync failed in $DEPLOY_ROOT"
      exit 0
      ;;
    -h | --help) usage ;;
    -*)
      log "unknown flag '$1'"
      usage
      ;;
    *)
      services+=("$1")
      shift
      ;;
  esac
done
if [ "$mode" = restart ]; then
  [ "${#services[@]}" -gt 0 ] || die 2 "--restart needs at least one service"
  [ -z "$rev" ] || die 2 "--restart restarts what is running; it takes no --sha"
fi

# --- outcome record ---------------------------------------------------------------------

mkdir -p "$STATE_DIR"
sha=""
data_sha=""
data_unpushed=null
data_ctx=""
pinned=false
result=""

record() {
  local rc="$1" svc_json
  [ -z "$data_ctx" ] || rm -rf "$data_ctx"
  if [ -z "$result" ]; then
    result=ok
    [ "$rc" -eq 0 ] || result=failed
  fi
  svc_json="$(services_json)"
  jq -nc --arg time "$(date -u +%FT%TZ)" --arg mode "$mode" --arg sha "$sha" \
    --arg data_sha "$data_sha" --argjson data_unpushed "$data_unpushed" \
    --argjson pinned "$pinned" --argjson services "$svc_json" --arg result "$result" \
    --argjson exit "$rc" \
    '{time: $time, mode: $mode, sha: $sha, data_sha: $data_sha, data_unpushed: $data_unpushed,
      pinned: $pinned, services: $services, result: $result, exit: $exit}' \
    >>"$HISTORY" || log "could not append to $HISTORY"
}

# This run's services as history.jsonl records them: "all" or a JSON list.
services_json() {
  if [ "${#services[@]}" -eq 0 ]; then
    echo '"all"'
  else
    printf '%s\n' "${services[@]}" | jq -R . | jq -sc .
  fi
}

# Every history.jsonl line that is a JSON object; anything else is skipped, never fatal.
history_lines() {
  [ -r "$HISTORY" ] || return 0
  jq -cR 'fromjson? | objects' "$HISTORY" 2>/dev/null || true
}

# The last line of history matching the jq filter $1 (empty when none).
history_last() { history_lines | jq -c "${@:2}" "select($1)" | tail -n 1; }

# The last deploy that got its containers started (result ok or unhealthy), as one JSON line.
last_started_deploy() { history_last '.mode == "deploy" and (.result == "ok" or .result == "unhealthy")'; }
trap 'record "$?"' EXIT

# --- 1. lock ----------------------------------------------------------------------------

# One deploy at a time: `just deploy`, the linguist-commit and heartwood redeploys and
# codex-refresh's restart all come through here. The fd closes (and the lock drops) on exit.
# The staged copy (step 2a) inherits the lock its caller holds, as fd ASTRA_DEPLOY_LOCK_FD.
if [ -n "${ASTRA_DEPLOY_LOCK_FD:-}" ] && [ -e "/proc/self/fd/$ASTRA_DEPLOY_LOCK_FD" ]; then
  LOCK_FD="$ASTRA_DEPLOY_LOCK_FD"
else
  exec {LOCK_FD}>"$STATE_DIR/deploy.lock"
  if ! flock -n "$LOCK_FD"; then
    log "another deploy holds $STATE_DIR/deploy.lock — waiting up to ${LOCK_TIMEOUT}s"
    flock -w "$LOCK_TIMEOUT" "$LOCK_FD" ||
      die 3 "deploy lock still busy after ${LOCK_TIMEOUT}s — nothing deployed; re-run when the other deploy finishes"
  fi
fi
unset ASTRA_DEPLOY_LOCK_FD

[ -d "$DEPLOY_ROOT/.git" ] ||
  die 5 "$DEPLOY_ROOT is not a git checkout (create it: git clone git@github.com:jbassin/astra.git $DEPLOY_ROOT)"
dgit() { git -C "$DEPLOY_ROOT" "$@"; }

# --- codex needs a corpus release -------------------------------------------------------
# codex serves releases/current under its data dir (config.kdl codex.data-path) and exits at
# startup without one, so compose would restart it in a loop. Refuse before touching
# anything when codex is in scope (the whole stack, or named).
codex_current="$DATA_ROOT/codex/data/releases/current"
codex_in_scope=0
if [ "${#services[@]}" -eq 0 ]; then
  codex_in_scope=1
else
  for s in "${services[@]}"; do [ "$s" = codex ] && codex_in_scope=1; done
fi
if [ "$codex_in_scope" = 1 ] && ! { [ -L "$codex_current" ] && [ -d "$codex_current/corpus" ]; }; then
  die 12 "no codex release at $codex_current — run \`just codex-migrate-releases\` (a flat corpus) or \`just codex-build\` first, then redeploy"
fi

# --- restart mode: no fetch, no build -----------------------------------------------------

if [ "$mode" = restart ]; then
  sha="$(dgit rev-parse HEAD)"
  log "restarting ${services[*]} (deploy checkout at ${sha:0:12})"
  docker compose -f "$COMPOSE_FILE" restart "${services[@]}" || die 7 "docker compose restart failed"
  if ! "$WAIT_HEALTHY" --timeout "$HEALTH_TIMEOUT" -- -f "$COMPOSE_FILE" -- "${services[@]}"; then
    result=unhealthy
    die 10 "restarted ${services[*]} but it is not healthy"
  fi
  log "restarted ${services[*]}"
  exit 0
fi

# --- 2–3. resolve and check the target ----------------------------------------------------

dgit fetch -q origin || die 4 "git fetch origin failed in $DEPLOY_ROOT"

# 2a. Run origin/main's deploy tooling (header). The copy records the outcome, not this one.
if [ -z "${ASTRA_DEPLOY_STAGED:-}" ]; then
  bin="$STATE_DIR/bin"
  mkdir -p "$bin"
  for f in deploy.sh wait-healthy.sh; do
    dgit show "origin/main:deploy/$f" >"$bin/$f.tmp" || die 4 "origin/main has no deploy/$f"
    chmod +x "$bin/$f.tmp"
    mv -f "$bin/$f.tmp" "$bin/$f"
  done
  trap - EXIT
  exec env ASTRA_DEPLOY_STAGED=1 ASTRA_DEPLOY_LOCK_FD="$LOCK_FD" "$bin/deploy.sh" "${orig_args[@]}"
fi

# 2b. The target.
main_sha="$(dgit rev-parse -q --verify 'origin/main^{commit}')" || die 4 "no origin/main in $DEPLOY_ROOT"
if [ -n "$rev" ]; then
  sha="$(dgit rev-parse -q --verify "$rev^{commit}")" ||
    die 4 "'$rev' is not a commit in $DEPLOY_ROOT (after fetch)"
  # An explicit sha other than origin/main is a rollback: it pins production (header).
  [ "$sha" = "$main_sha" ] || pinned=true
else
  sha="$main_sha"
  last="$(last_started_deploy)"
  if [ -n "$last" ] && [ "$(jq -r '.pinned // false' <<<"$last")" = true ]; then
    sha="$(jq -r .sha <<<"$last")"
    pinned=true
    log "WARNING: production is pinned at ${sha:0:12} by a --sha rollback ($(jq -r .time <<<"$last")); building that, not origin/main ${main_sha:0:12}"
    log "  to move back to main: just deploy --sha origin/main"
  fi
fi
dgit merge-base --is-ancestor "$sha" origin/main ||
  die 4 "${sha:0:12} is not on origin/main — push it first (production only runs pushed commits)"
dirty="$(dgit status --porcelain)"
if [ -n "$dirty" ]; then
  log "the deploy checkout $DEPLOY_ROOT has local changes:"
  printf '%s\n' "$dirty" >&2
  die 5 "refusing to deploy from a modified checkout — nothing should edit $DEPLOY_ROOT by hand; inspect, then git -C $DEPLOY_ROOT checkout -- . / clean"
fi

# Whether this deploy bakes the astra-data clone (step 6).
needs_data=0
if [ "${#services[@]}" -eq 0 ]; then
  needs_data=1
else
  for s in "${services[@]}"; do
    case "$s" in akasha-frontend | mouthpiece-frontend) needs_data=1 ;; esac
  done
fi

if [ "$skip_failed" = 1 ]; then
  data_head=""
  if [ "$needs_data" = 1 ]; then
    data_head="$(git -C "$CONTENT_REPO" rev-parse -q --verify 'HEAD^{commit}' 2>/dev/null || true)"
  fi
  last="$(history_last '.mode == "deploy" and .services == $svcs and .result != "skipped"' \
    --argjson svcs "$(services_json)")"
  if [ -n "$last" ] && jq -e --arg sha "$sha" --arg data "$data_head" \
    '(.exit == 7 or .exit == 10) and .sha == $sha and .data_sha == $data' <<<"$last" >/dev/null; then
    result=skipped
    log "skipping: the last deploy of ${services[*]:-the whole stack} at ${sha:0:12}${data_head:+ with astra-data ${data_head:0:12}} already failed ($(jq -r '"\(.result), exit \(.exit), \(.time)"' <<<"$last"))"
    log "  a new code or data commit retries; to retry now: just deploy ${services[*]}"
    exit 11
  fi
fi

ASTRA_REVISION="$sha"
ASTRA_REVISION_DATE="$(dgit show -s --format=%cI "$sha")" # commit date: same sha, same label
export ASTRA_REVISION ASTRA_REVISION_DATE
compose=(docker compose -f "$COMPOSE_FILE" up -d --build "${services[@]}")

if [ "$mode" = dry-run ]; then
  log "dry run — target ${sha} ($(dgit log -1 --format=%s "$sha"))"
  log "would: git -C $DEPLOY_ROOT checkout -q --detach $sha"
  log "would: decrypt $SECRETS_FILE with $SOPS_AGE_KEY_FILE and export each key UPPER_CASED"
  log "would: sync the host tooling in $DEPLOY_ROOT (uv sync --frozen; pnpm install --frozen-lockfile --filter @astra/vellum-lang)"
  log "would: create the data root dirs under $DATA_ROOT"
  log "would: export $CONTENT_REPO HEAD as the astra-data build context (if building a frontend that bakes it)"
  log "would: ASTRA_REVISION=$sha ASTRA_REVISION_DATE=$ASTRA_REVISION_DATE ${compose[*]}"
  log "would: wait up to ${HEALTH_TIMEOUT}s for the containers to be healthy (wait-healthy.sh)"
  exit 0
fi

# 3b. Nothing under a running heartwood agent changes until it finishes.
resolve_uv || die 9 "nothing changed"
if [ "$(dgit rev-parse HEAD)" != "$sha" ] || ! venv_in_sync; then
  take_tooling_lock || die 9 "nothing changed — re-run the deploy when the heartwood run finishes"
fi
dgit checkout -q --detach "$sha"
log "deploy checkout at ${sha:0:12} ($(dgit log -1 --format=%s "$sha"))"
sync_host_tooling || die 9 "host tooling sync failed in $DEPLOY_ROOT — nothing built; the bot units need it"
release_tooling_lock

# --- 4. secrets ---------------------------------------------------------------------------

[ -r "$SOPS_AGE_KEY_FILE" ] || die 6 "age key $SOPS_AGE_KEY_FILE is missing or unreadable"
# Decrypt once; the secrets live only in this process's environment. compose scopes each
# container to the keys its `environment:` block references.
secrets="$(sops -d --output-type dotenv "$SECRETS_FILE")" || die 6 "sops could not decrypt $SECRETS_FILE"
while IFS='=' read -r k v; do
  [ -n "$k" ] || continue
  export "${k^^}=$v"
done <<<"$secrets"
unset secrets

# --- 5–7. build and start -------------------------------------------------------------------

init_artifacts

# 6. The astra-data build context, for the services that bake the published datasets.
if [ "$needs_data" = 1 ]; then
  [ -d "$CONTENT_REPO/.git" ] ||
    die 8 "the astra-data clone $CONTENT_REPO is missing (git clone git@github.com:jbassin/astra-data.git $CONTENT_REPO)"
  data_sha="$(git -C "$CONTENT_REPO" rev-parse -q --verify 'HEAD^{commit}')" ||
    die 8 "$CONTENT_REPO has no commit to build from"
  data_ctx="$(mktemp -d "$STATE_DIR/astra-data-context.XXXXXX")"
  git -C "$CONTENT_REPO" archive --format=tar "$data_sha" | tar -x -C "$data_ctx" ||
    die 8 "could not export $CONTENT_REPO at ${data_sha:0:12}"
  export ASTRA_DATA_CONTEXT="$data_ctx"
  log "astra-data context: $CONTENT_REPO at ${data_sha:0:12} ($(git -C "$CONTENT_REPO" log -1 --format=%s "$data_sha"))"
  # Ship it anyway (a failed push must not hold the site back), but say so loudly: the site
  # then shows content that exists nowhere but this clone and its backup. Against the
  # clone's last-fetched origin/main; no fetch here.
  if data_unpushed="$(git -C "$CONTENT_REPO" rev-list --count "origin/main..$data_sha" 2>/dev/null)"; then
    if [ "$data_unpushed" -gt 0 ]; then
      log "WARNING: shipping $data_unpushed astra-data commit(s) that are not on its origin/main — the bots' push failed or has not run; push with: just _astra-data-push"
    fi
  else
    data_unpushed=null
    log "WARNING: could not compare $CONTENT_REPO with its origin/main (no remote-tracking branch?)"
  fi
fi

log "ASTRA_REVISION=${sha:0:12} ${compose[*]}"
"${compose[@]}" || die 7 "docker compose up failed — containers whose build failed keep running the previous image"

# --- 7. what is live ----------------------------------------------------------------------

mkdir -p "$STATE_DIR/live"
if [ "${#services[@]}" -eq 0 ]; then
  mapfile -t live_services < <(docker compose -f "$COMPOSE_FILE" config --services)
else
  live_services=("${services[@]}")
fi
for s in "${live_services[@]}"; do printf '%s\n' "$sha" >"$STATE_DIR/live/$s"; done

# --- 7b. wait for the containers to come up healthy ------------------------------------------

log "waiting up to ${HEALTH_TIMEOUT}s for ${services[*]:-every service} to be healthy"
if ! "$WAIT_HEALTHY" --timeout "$HEALTH_TIMEOUT" -- -f "$COMPOSE_FILE" -- "${services[@]}"; then
  result=unhealthy
  # The rollback target: the newest earlier deploy at another sha that came up healthy.
  prev="$(history_last '.mode == "deploy" and .result == "ok" and .sha != $sha' --arg sha "$sha" |
    jq -r '.sha // empty' || true)"
  if [ -n "$prev" ]; then
    log "roll back with: just deploy --sha $prev${services[*]:+ ${services[*]}}"
  else
    log "no earlier healthy deploy at another sha in $HISTORY to roll back to"
  fi
  die 10 "deployed ${sha:0:12} but it is not healthy — the new containers keep running; nothing was rolled back"
fi
log "deployed ${sha:0:12} — ${services[*]:-whole stack}"
