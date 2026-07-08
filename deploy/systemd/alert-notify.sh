#!/usr/bin/env bash
# astra stack alerting — posts to the Discord ops channel. Two callers:
#   - host systemd `OnFailure=` handlers (Class C: craig-sync / linguist-commit unit
#     failures, which emit ZERO telemetry — SigNoz never sees them);
#   - the astra-watchdog.timer (Class B: liveness — Drive FUSE mount responsive + the
#     pipeline timers active & armed).
# Deliberately curls Discord DIRECTLY (not via SigNoz/the collector) so a paging path
# survives even when SigNoz itself is down. The webhook is decrypted from SOPS at runtime
# — never baked into a unit, an image, or the environment.
#
# NB: `set -u` + pipefail but deliberately NO `-e`. An alerter must never abort half-way
# and silently swallow the page; every step degrades gracefully and logs to stderr (the
# journal) instead of exiting.
set -uo pipefail

REPO="/ruby/data/experiments/astra"
SECRETS="$REPO/deploy/sops/secrets.enc.yaml"
AGE_KEY="$REPO/deploy/sops/age.key"
HOST="$(hostname 2>/dev/null || echo host)"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/astra-watchdog"

# The pipeline's front door (same default + override as `just craig-sync`).
DRIVE_MOUNT="${CRAIG_DROP_DIR:-/ruby/data/home/drive/Craig}"
# Timers whose health == the pipeline is armed. (The watchdog can't meaningfully check
# its OWN timer — if that died, this script wouldn't be running.)
WATCHED_TIMERS=(craig-sync.timer linguist-commit.timer)

# Confirmation window. The watchdog runs on *:0/15 — the SAME wall-clock ticks the watched
# timers fire on (craig-sync *:0/5, linguist-commit hourly). So a naive single sample
# routinely catches a timer mid-fire, when systemd legitimately reports no next-elapse
# ('Trigger: n/a') until the triggered run finishes, or momentarily re-arming. Those blips
# clear in ~1s; a genuine wedge/disarm persists for minutes. We re-probe a bad reading a
# few times over a short window and only page if it stays bad across ALL of them.
CONFIRM_TRIES="${WATCHDOG_CONFIRM_TRIES:-3}"
CONFIRM_GAP_S="${WATCHDOG_CONFIRM_GAP_S:-5}"

# Class C `failure` debounce window. A wedged host dependency (e.g. the Drive FUSE mount)
# makes a 5-min timer's unit fail every tick forever — 610 pages in the incident that
# prompted this. Unlike transition() below, a persistent hard failure never "changes
# state" (it's bad->bad every tick), so the edge-trigger debounce doesn't help here; instead
# we page once, then suppress repeats of the SAME unit for this many seconds, then re-page
# once (with the accumulated count) if it's still failing.
FAILURE_DEBOUNCE_S="${FAILURE_DEBOUNCE_S:-3600}"

log() { echo "alert-notify: $*" >&2; }

# Decrypt the Discord webhook URL. Never echoed — only piped into curl.
webhook() { SOPS_AGE_KEY_FILE="$AGE_KEY" sops -d --extract '["alert_discord_webhook_url"]' "$SECRETS" 2>/dev/null; }

# Bound a mount access WITHOUT ever `wait`-ing on it — a process blocked on a wedged FUSE
# mount sits in uninterruptible D state, so `timeout`/SIGKILL can't reap it and would hang
# us too. Poll with `kill -0` (never touches the mount); on timeout abandon the child and
# return non-zero. (Lifted verbatim from `just craig-sync`.)
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
  wait "$pid"
}

# POST a Discord message. $1 = content (truncated < the 2000-char hard cap, margin kept).
# ALERT_DRY_RUN=1 prints the message to stderr instead of decrypting + curling Discord —
# lets the watchdog/transition logic be exercised without paging or touching the secret.
post() {
  local content="$1" url payload
  content="${content:0:1900}"
  if [ "${ALERT_DRY_RUN:-}" = "1" ]; then log "[dry-run] would post: ${content%%$'\n'*}"; return 0; fi
  url="$(webhook)"
  if [ -z "$url" ]; then log "ERROR: could not decrypt webhook — cannot page"; return 1; fi
  payload="$(jq -nc --arg u "astra-alert ($HOST)" --arg c "$content" '{username:$u, content:$c}')"
  if curl -fsS -m 15 -X POST -H 'Content-Type: application/json' -d "$payload" "$url" >/dev/null; then
    log "posted to Discord"
  else
    log "ERROR: curl to Discord failed"   # never fatal — already failing if we got here
  fi
}

# Debounced state transition. Alerts only on ok->bad and bad->ok (a 15-min timer must not
# re-page every tick). First-ever run: prev defaults to ok, so a healthy first run is
# silent and a broken first run pages once.
transition() {
  local key="$1" status="$2" msg="$3" prev="ok"
  local f="$STATE_DIR/$key.state"
  mkdir -p "$STATE_DIR"
  [ -f "$f" ] && prev="$(cat "$f" 2>/dev/null || echo ok)"
  if [ "$status" != "$prev" ]; then
    if [ "$status" = "bad" ]; then post "🔴 **astra watchdog** — $msg"
    else post "🟢 **astra watchdog recovered** — $msg"; fi
  fi
  printf '%s' "$status" >"$f"
}

# Debounced page decision for a Class C `failure` event (per unit). State is 3 lines —
# first_ts / last_page_ts / count — in `$STATE_DIR/failure-<unit>.state` (same dotted-key
# idiom as transition()'s `$key.state`). First-ever failure: no file, pages immediately.
# Repeat failures within FAILURE_DEBOUNCE_S of the last page: suppressed (journal-only).
# Once the window elapses with the unit still failing: pages again, count included.
# Echoes the running count on stdout when it decides to page; returns 1 (nothing echoed,
# already logged) when suppressed — caller gates the actual post() on the return code.
failure_gate() {
  local unit="$1" f now first_ts last_ts count elapsed page=1
  f="$STATE_DIR/failure-$unit.state"
  mkdir -p "$STATE_DIR"
  now="$(date +%s)"
  first_ts="$now" last_ts="$now" count=1
  if [ -f "$f" ]; then
    { read -r first_ts; read -r last_ts; read -r count; } <"$f" 2>/dev/null
    first_ts="${first_ts:-$now}"; last_ts="${last_ts:-$now}"; count="${count:-0}"
    count=$((count + 1))
    elapsed=$((now - last_ts))
    if [ "$elapsed" -lt "$FAILURE_DEBOUNCE_S" ]; then
      page=0
    else
      last_ts="$now"
    fi
  fi
  printf '%s\n%s\n%s\n' "$first_ts" "$last_ts" "$count" >"$f"
  if [ "$page" -eq 0 ]; then
    log "suppressed repeat failure page for $unit ($count failures since first page)"
    return 1
  fi
  printf '%s' "$count"
}

# Class C recovery cleanup, run every watchdog tick (15 min): a failure-debounce state file
# whose unit is no longer failed means the incident resolved — drop the state so a FUTURE,
# unrelated failure of the same unit pages immediately instead of inheriting the old
# window. Silent on purpose: Class B's transition() already announces recoveries for the
# checks it owns; this is just clearing stale debounce bookkeeping, not a health signal.
clear_recovered_failures() {
  local f unit
  for f in "$STATE_DIR"/failure-*.state; do
    [ -e "$f" ] || continue
    unit="$(basename "$f")"; unit="${unit#failure-}"; unit="${unit%.state}"
    if [ "$(systemctl --user is-failed "$unit" 2>/dev/null)" != "failed" ]; then
      rm -f "$f"
    fi
  done
}

# --- liveness checks (each echoes a reason on failure, returns non-zero) ---

check_mount() {
  if run_bounded 20 bash -c 'ls "$1" >/dev/null 2>&1' _ "$DRIVE_MOUNT"; then return 0; fi
  echo "Drive mount '$DRIVE_MOUNT' unresponsive (>20s) — FUSE front door may be wedged (pipeline ingest stalled)"
  return 1
}

check_timer() {
  local t="$1"
  if [ "$(systemctl --user is-active "$t" 2>/dev/null)" != "active" ]; then
    echo "timer $t is not active"; return 1
  fi
  # An armed OnCalendar timer reports a real next-elapse; a wedged/disarmed one is empty
  # or 'n/a' (the 'Trigger: n/a' symptom from the craig-sync FUSE-wedge incident).
  local next; next="$(systemctl --user show "$t" -p NextElapseUSecRealtime --value 2>/dev/null)"
  if [ -z "$next" ] || [ "$next" = "n/a" ]; then
    # But a timer whose OWN service is mid-run legitimately shows no next-elapse until that
    # run finishes — that's normal, not a wedge. Only flag it when the service is idle.
    local svc svcstate
    svc="$(systemctl --user show "$t" -p Unit --value 2>/dev/null)"
    svcstate="$(systemctl --user is-active "$svc" 2>/dev/null)"
    if [ "$svcstate" = "active" ] || [ "$svcstate" = "activating" ]; then return 0; fi
    echo "timer $t is active but not armed (no scheduled next run — 'Trigger: n/a')"; return 1
  fi
  return 0
}

# Re-probe a check until it passes or the confirmation window is exhausted. Returns 0 as
# soon as ANY probe is healthy (a transient blip); returns 1 echoing the last reason only
# if EVERY probe stayed bad (a persistent fault worth paging). $@ = check fn + its args.
confirm() {
  local reason i=0
  while :; do
    if reason="$("$@")"; then return 0; fi
    i=$((i + 1))
    if [ "$i" -ge "$CONFIRM_TRIES" ]; then printf '%s' "$reason"; return 1; fi
    sleep "$CONFIRM_GAP_S"
  done
}

run_watchdog() {
  local reason
  if reason="$(confirm check_mount)"; then transition mount ok   "Drive mount '$DRIVE_MOUNT' responsive again"
  else                                     transition mount bad  "$reason"; fi
  local t
  for t in "${WATCHED_TIMERS[@]}"; do
    if reason="$(confirm check_timer "$t")"; then transition "timer-$t" ok  "timer $t healthy again"
    else                                          transition "timer-$t" bad "$reason"; fi
  done
  clear_recovered_failures
}

cmd="${1:-}"; [ "$#" -gt 0 ] && shift
case "$cmd" in
  failure)
    unit="${1:-unknown.unit}"
    if count="$(failure_gate "$unit")"; then
      # Compact tail of the failed unit's journal (user-scope units). Trimmed for Discord.
      logs="$(journalctl --user -u "$unit" -n 25 --no-pager -o cat 2>/dev/null | tail -c 1200)"
      recur=""
      [ "$count" -gt 1 ] && recur=" — still failing ($count failures since first page)"
      post "🔴 **astra unit FAILED**$recur — \`$unit\` on $HOST
\`\`\`
${logs:-<no journal output captured>}
\`\`\`
Inspect: systemctl --user status $unit"
    fi
    ;;
  watchdog) run_watchdog ;;
  test)     post "✅ astra alerting test from $HOST — $(date -u '+%Y-%m-%dT%H:%M:%SZ')" ;;
  *) log "usage: alert-notify.sh {failure <unit>|watchdog|test}"; exit 2 ;;
esac
