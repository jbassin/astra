#!/usr/bin/env bash
# astra deploy (0037 OPS-3) — the ONE way production gets built and started.
#
#   deploy.sh [--sha REV] [--dry-run] [SERVICE...]   build + (re)start SERVICEs (none = all)
#   deploy.sh --restart SERVICE...                   restart running containers, no build
#   deploy.sh --init-artifacts                       create the bind-mount source tree only
#
# `just deploy …` calls this; `just up …` is an alias. Production builds ONLY from the deploy
# checkout $ASTRA_DEPLOY_ROOT (default /ruby/data/astra-deploy, a plain clone of origin), never
# from a developer working tree, so what runs is always a pushed commit and nobody's
# half-finished edits can ship. Steps of a deploy:
#   1. take the deploy lock ($ARTIFACTS/deploy/deploy.lock, waits up to DEPLOY_LOCK_TIMEOUT s)
#   2. git fetch origin; target = --sha REV, else origin/main
#   3. refuse a target that is not on origin/main (unpushed) and a deploy checkout with any
#      tracked change or untracked non-ignored file; then `git checkout --detach <sha>`
#   4. decrypt SOPS on the host and export each secret UPPER_CASED (roadmap Decision E: the
#      compose `environment:` blocks pass the keys each service needs, and @astra/config's
#      env-override path resolves them in-container — no sops/age key/secrets in any image)
#   5. create the bind-mount source tree as uid 1000 (Docker would create a missing one as root)
#   6. export the astra-data clone's HEAD ($ASTRA_CONTENT_ROOT, default
#      /ruby/data/astra-state/astra-data = config.kdl data.content-root) into a temp dir and
#      pass it as ASTRA_DATA_CONTEXT: akasha-frontend and mouthpiece-frontend bake the
#      published datasets from that `astra-data` build context (compose additional_contexts).
#      Committed content only — whatever the pipeline or a heartwood run has written but
#      not yet committed in the clone never ships. The clone's HEAD need not be pushed (the
#      bots push after they commit; a failed push must not hold the site back).
#   7. docker compose up -d --build [SERVICE...] with ASTRA_REVISION=<sha>, which every built
#      image carries as the org.opencontainers.image.revision label
#   8. record the outcome (below)
# --dry-run does 1–3's checks and prints the compose command; it never checks out, runs sops
# or runs docker. Rollback = `deploy.sh --sha <older pushed sha>`.
#
# What is live. The image label is the source of truth:
#   docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' astra-codex
# The files below are a convenience for humans and scripts:
#   $ARTIFACTS/deploy/live/<service>   the sha that service was last deployed at, one file per
#                                      compose service (a whole-stack deploy rewrites all of
#                                      them; a scoped one only its own). `--restart` leaves them.
#   $ARTIFACTS/deploy/history.jsonl    one JSON line per attempt that got past argument parsing:
#                                      {time, mode, sha, data_sha, services, result, exit}.
#                                      mode is deploy / restart / dry-run; services is "all"
#                                      or a list; data_sha is the astra-data commit baked in
#                                      ("" when the deploy did not export it).
#
# Exit codes: 0 ok · 2 usage · 3 lock busy · 4 target unknown or not pushed · 5 deploy checkout
# dirty or missing · 6 secrets decrypt failed · 7 docker compose failed · 8 the astra-data
# clone is missing or its HEAD could not be exported (nothing built).
#
# The untracked state still lives in the developer tree (/ruby/data/experiments/astra, the
# compose bind mounts are host-absolute), so ARTIFACTS defaults there, as the justfile's
# `artifacts` does.
set -Eeuo pipefail

# systemd user units have a minimal PATH; sops lives in /usr/local/bin.
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

DEPLOY_ROOT="${ASTRA_DEPLOY_ROOT:-/ruby/data/astra-deploy}"
ARTIFACTS="${ARTIFACTS:-/ruby/data/experiments/astra/artifacts}"
# The astra-data clone (mirrors config.kdl data.content-root; the same variable overrides it).
CONTENT_REPO="${ASTRA_CONTENT_ROOT:-/ruby/data/astra-state/astra-data}"
LOCK_TIMEOUT="${DEPLOY_LOCK_TIMEOUT:-1800}"
# sops's own default key location; the key never lives in a checkout that builds images.
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"

STATE_DIR="$ARTIFACTS/deploy"
COMPOSE_FILE="$DEPLOY_ROOT/deploy/docker-compose.yml"
SECRETS_FILE="$DEPLOY_ROOT/deploy/sops/secrets.enc.yaml"

log() { printf 'deploy: %s\n' "$*" >&2; }
die() {
  local code="$1"
  shift
  log "ERROR: $*"
  exit "$code"
}

# The bind-mount source tree, created as the host user (uid 1000) before any container
# starts. The audio dirs are host-owned (the frontends read them ro, orator writes them as
# 1000). Only the postgres/ parent is made here: the one-time migration or the postgres
# entrypoint owns each PGDATA subdir as uid 70 (0700). `just artifacts-init` calls this too,
# so the list lives in one place. Add a dir here when the compose file gains a bind mount.
init_artifacts() {
  mkdir -p "$ARTIFACTS"/audio/{akasha,mouthpiece,orator} "$ARTIFACTS"/postgres \
    "$ARTIFACTS"/portal-oauth "$ARTIFACTS"/menhir \
    "$ARTIFACTS"/heartwood/requests/logs # = heartwood.requests-path (0036)
}

usage() {
  log "usage: deploy.sh [--sha REV] [--dry-run] [SERVICE...] | --restart SERVICE... | --init-artifacts"
  exit 2
}

# --- arguments --------------------------------------------------------------------------

mode=deploy
rev=""
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
    --restart)
      mode=restart
      shift
      ;;
    --init-artifacts)
      init_artifacts
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
data_ctx=""

record() {
  local rc="$1" result=ok svc_json
  [ -z "$data_ctx" ] || rm -rf "$data_ctx"
  [ "$rc" -eq 0 ] || result=failed
  if [ "${#services[@]}" -eq 0 ]; then
    svc_json='"all"'
  else
    svc_json="$(printf '%s\n' "${services[@]}" | jq -R . | jq -sc .)"
  fi
  jq -nc --arg time "$(date -u +%FT%TZ)" --arg mode "$mode" --arg sha "$sha" \
    --arg data_sha "$data_sha" --argjson services "$svc_json" --arg result "$result" \
    --argjson exit "$rc" \
    '{time: $time, mode: $mode, sha: $sha, data_sha: $data_sha, services: $services, result: $result, exit: $exit}' \
    >>"$STATE_DIR/history.jsonl" || log "could not append to $STATE_DIR/history.jsonl"
}
trap 'record "$?"' EXIT

# --- 1. lock ----------------------------------------------------------------------------

# One deploy at a time: `just deploy`, the linguist-commit and heartwood redeploys and
# codex-refresh's restart all come through here. The fd closes (and the lock drops) on exit.
exec {LOCK_FD}>"$STATE_DIR/deploy.lock"
if ! flock -n "$LOCK_FD"; then
  log "another deploy holds $STATE_DIR/deploy.lock — waiting up to ${LOCK_TIMEOUT}s"
  flock -w "$LOCK_TIMEOUT" "$LOCK_FD" ||
    die 3 "deploy lock still busy after ${LOCK_TIMEOUT}s — nothing deployed; re-run when the other deploy finishes"
fi

[ -d "$DEPLOY_ROOT/.git" ] ||
  die 5 "$DEPLOY_ROOT is not a git checkout (create it: git clone git@github.com:jbassin/astra.git $DEPLOY_ROOT)"
dgit() { git -C "$DEPLOY_ROOT" "$@"; }

# --- restart mode: no fetch, no build -----------------------------------------------------

if [ "$mode" = restart ]; then
  sha="$(dgit rev-parse HEAD)"
  log "restarting ${services[*]} (deploy checkout at ${sha:0:12})"
  docker compose -f "$COMPOSE_FILE" restart "${services[@]}" || die 7 "docker compose restart failed"
  log "restarted ${services[*]}"
  exit 0
fi

# --- 2–3. resolve and check the target ----------------------------------------------------

dgit fetch -q origin || die 4 "git fetch origin failed in $DEPLOY_ROOT"
sha="$(dgit rev-parse -q --verify "${rev:-origin/main}^{commit}")" ||
  die 4 "'${rev:-origin/main}' is not a commit in $DEPLOY_ROOT (after fetch)"
dgit merge-base --is-ancestor "$sha" origin/main ||
  die 4 "${sha:0:12} is not on origin/main — push it first (production only runs pushed commits)"
dirty="$(dgit status --porcelain)"
if [ -n "$dirty" ]; then
  log "the deploy checkout $DEPLOY_ROOT has local changes:"
  printf '%s\n' "$dirty" >&2
  die 5 "refusing to deploy from a modified checkout — nothing should edit $DEPLOY_ROOT by hand; inspect, then git -C $DEPLOY_ROOT checkout -- . / clean"
fi

ASTRA_REVISION="$sha"
ASTRA_REVISION_DATE="$(dgit show -s --format=%cI "$sha")" # commit date: same sha, same label
export ASTRA_REVISION ASTRA_REVISION_DATE
compose=(docker compose -f "$COMPOSE_FILE" up -d --build "${services[@]}")

if [ "$mode" = dry-run ]; then
  log "dry run — target ${sha} ($(dgit log -1 --format=%s "$sha"))"
  log "would: git -C $DEPLOY_ROOT checkout -q --detach $sha"
  log "would: decrypt $SECRETS_FILE with $SOPS_AGE_KEY_FILE and export each key UPPER_CASED"
  log "would: create the bind-mount tree under $ARTIFACTS"
  log "would: export $CONTENT_REPO HEAD as the astra-data build context (if building a frontend that bakes it)"
  log "would: ASTRA_REVISION=$sha ASTRA_REVISION_DATE=$ASTRA_REVISION_DATE ${compose[*]}"
  exit 0
fi

dgit checkout -q --detach "$sha"
log "deploy checkout at ${sha:0:12} ($(dgit log -1 --format=%s "$sha"))"

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
needs_data=0
if [ "${#services[@]}" -eq 0 ]; then
  needs_data=1
else
  for s in "${services[@]}"; do
    case "$s" in akasha-frontend | mouthpiece-frontend) needs_data=1 ;; esac
  done
fi
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
log "deployed ${sha:0:12} — ${services[*]:-whole stack}"
