#!/usr/bin/env bash
# Exercise deploy/wait-healthy.sh against a throwaway compose project (`just deploy-health-test`).
# Starts five alpine containers with no network (never the astra project, never signoz-net):
# a healthchecked one, a plain long-running one and a one-shot that should pass; a crash loop
# and a failing healthcheck that should not. Removes the project on exit. Needs Docker and a
# local alpine:3.22 image. About 40 s.
set -Eeuo pipefail

here="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
wait_healthy="$here/../wait-healthy.sh"
project="astra-wait-healthy-test-$$"
dir="$(mktemp -d)"
cleanup() {
  docker compose -p "$project" -f "$dir/compose.yml" down -t 0 --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$dir"
}
trap cleanup EXIT

cat >"$dir/compose.yml" <<'EOF'
x-base: &base
  image: alpine:3.22
  pull_policy: never
  network_mode: none
  init: true
services:
  good-hc:
    <<: *base
    command: sleep 600
    restart: unless-stopped
    healthcheck: { test: ["CMD", "true"], interval: 1s, start_period: 0s, retries: 1 }
  good-plain:
    <<: *base
    command: sleep 600
    restart: unless-stopped
  oneshot:
    <<: *base
    command: "true"
    restart: "no"
  bad-loop:
    <<: *base
    command: ["sh", "-c", "echo crashing; sleep 2; exit 1"]
    restart: unless-stopped
  bad-hc:
    <<: *base
    command: ["sh", "-c", "echo up but sick; sleep 600"]
    restart: unless-stopped
    healthcheck: { test: ["CMD", "false"], interval: 1s, start_period: 0s, retries: 1 }
EOF

docker compose -p "$project" -f "$dir/compose.yml" up -d --quiet-pull >/dev/null 2>&1
fails=0
expect() {
  local want="$1" label="$2" out rc=0
  shift 2
  out="$("$wait_healthy" "$@" 2>&1)" || rc=$?
  if [ "$rc" = "$want" ]; then
    echo "ok   $label (exit $rc)"
  else
    echo "FAIL $label: exit $rc, want $want"
    printf '%s\n' "$out" | sed 's/^/     /'
    fails=$((fails + 1))
  fi
  LAST_OUT="$out"
}

expect 0 "healthy services pass" --timeout 30 --settle 3 -- -p "$project" -f "$dir/compose.yml" -- good-hc good-plain oneshot
expect 1 "the whole project fails" --timeout 15 --settle 3 -- -p "$project" -f "$dir/compose.yml"
[ -z "${VERBOSE:-}" ] || printf '%s\n' "$LAST_OUT" | sed 's/^/     /'
for want in "bad-loop-1:" "bad-hc-1: health unhealthy" "--- $project-bad-loop-1: last" "crashing" "up but sick"; do
  if ! grep -qF -- "$want" <<<"$LAST_OUT"; then
    echo "FAIL the failure report lacks '$want'"
    printf '%s\n' "$LAST_OUT" | sed 's/^/     /'
    fails=$((fails + 1))
  fi
done
if grep -qE "good-(hc|plain)-1:|oneshot-1:" <<<"$LAST_OUT"; then
  echo "FAIL the failure report names a healthy container"
  fails=$((fails + 1))
fi
# The same project after the two bad services left the compose file: their containers are
# orphans now, and a whole-project wait must not count them.
cat >"$dir/compose-good.yml" <<'EOF'
x-base: &base
  image: alpine:3.22
  pull_policy: never
  network_mode: none
  init: true
services:
  good-hc:
    <<: *base
    command: sleep 600
    restart: unless-stopped
    healthcheck: { test: ["CMD", "true"], interval: 1s, start_period: 0s, retries: 1 }
  good-plain:
    <<: *base
    command: sleep 600
    restart: unless-stopped
  oneshot:
    <<: *base
    command: "true"
    restart: "no"
EOF
expect 0 "dead orphans are ignored" --timeout 15 --settle 3 -- -p "$project" -f "$dir/compose-good.yml"
expect 2 "no containers" --timeout 5 -- -p "$project-missing" -f "$dir/compose.yml"

if [ "$fails" -ne 0 ]; then
  echo "wait-healthy: $fails check(s) failed"
  exit 1
fi
echo "wait-healthy: all checks passed"
