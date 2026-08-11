#!/usr/bin/env bash
# astra stack alerting — posts to the Discord ops channel. Two callers:
#   - host systemd `OnFailure=` handlers (Class C: craig-sync / linguist-commit unit
#     failures, which emit ZERO telemetry — SigNoz never sees them);
#   - the astra-watchdog.timer (Class B: liveness — Drive FUSE mount responsive + the
#     pipeline timers active & armed; a wedged FUSE mount is auto-remediated, see
#     remediate_mount below).
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
# The uplink NIC (the 2026-08-10 incident: a marginal gigabit cable corrupted frames —
# 20% LAN loss, rx_crc_errors +75/s — presenting as bulk-transfer stalls while small
# requests squeaked through on TCP retransmits).
NIC_IFACE="${WATCHDOG_NIC_IFACE:-enp4s0}"
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

# Wedged-mount auto-remediation (the 2026-07-08 incident, automated): the ocamlfuse
# daemon wedged/died leaving the kernel FUSE connection holding 130 unanswered requests,
# so every toucher of the mount piled up in uninterruptible D state for hours. The manual
# fix that worked: abort the kernel connection (fails all pending requests, frees the
# D-state waiters), lazy-unmount the corpse, and let gdrive.service (system scope,
# Restart=always — the abort kills the daemon's /dev/fuse read, systemd respawns it)
# remount. Debounced so a systematically-broken mount doesn't get abort-thrashed every
# 15-min tick; WATCHDOG_REMEDIATE=0 disables the whole path (detect-and-page only).
REMEDIATE_DEBOUNCE_S="${WATCHDOG_REMEDIATE_DEBOUNCE_S:-3600}"
REMOUNT_WAIT_S="${WATCHDOG_REMOUNT_WAIT_S:-45}"

# The VANISHED-mount case (2026-07-20) is a DIFFERENT failure than the wedge above: the
# ocamlfuse daemon stays alive but its FUSE mount detaches, so it drops out of mountinfo
# entirely. Restart=always never fires (the process never died) and the abort/unmount path
# has nothing to target (no connection, no mountpoint) — it sat page-only for days. The fix
# is to force gdrive.service to re-establish the mount. `systemctl restart` on this
# system-scope unit needs root, so the primary path is a narrowly-scoped NOPASSWD sudoers
# drop-in (deploy/systemd/sudoers.d/astra-gdrive → `just alert-sudoers-install`, a one-time
# root step); the fallback signals the live daemon by MainPID (a same-uid kill the watchdog
# CAN send unprivileged → Restart=always respawns it), so the common alive-daemon case
# self-heals even before that rule is installed.
GDRIVE_UNIT="${WATCHDOG_GDRIVE_UNIT:-gdrive.service}"

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
  # A vanished mount is invisible to the responsiveness probe: `ls` on the bare (empty)
  # underlying directory succeeds instantly, so the 2026-07-13 incident — daemon alive but
  # mount gone — kept every signal green while ingest was blind and craig-sync nullglobbed
  # "0 new" forever. Require an actual fuse-fstype mount above DRIVE_MOUNT first (mountinfo
  # read — never stats the path, safe even when wedged).
  if [ -z "$(find_fuse_mount)" ]; then
    echo "no FUSE mount above '$DRIVE_MOUNT' — Drive is unmounted, pipeline ingest is blind (fix: sudo systemctl restart gdrive.service)"
    return 1
  fi
  if run_bounded 20 bash -c 'ls "$1" >/dev/null 2>&1' _ "$DRIVE_MOUNT"; then return 0; fi
  echo "Drive mount '$DRIVE_MOUNT' unresponsive (>20s) — FUSE front door may be wedged (pipeline ingest stalled)"
  return 1
}

# Locate the FUSE mount serving DRIVE_MOUNT WITHOUT ever stat()ing the path (that's what
# hangs on a wedged mount) — /proc/self/mountinfo is safe to read. Prints "maj:min mountpoint"
# for the longest fuse-fstype mountpoint that is a path-prefix of DRIVE_MOUNT; the device
# MINOR is the kernel connection id under /sys/fs/fuse/connections/.
find_fuse_mount() {
  awk -v target="$DRIVE_MOUNT/" '
    { fstype=""
      for (i = 7; i < NF; i++) if ($i == "-") { fstype = $(i + 1); break }
      if (fstype ~ /^fuse/ && index(target, $5 "/") == 1 && length($5) > length(best_mp)) {
        best_mp = $5; best_dev = $3
      }
    }
    END { if (best_mp != "") print best_dev, best_mp }' /proc/self/mountinfo
}

# Force gdrive.service to re-establish a VANISHED mount (see the GDRIVE_UNIT note above).
# Echoes the method it used and returns 0 if it kicked a restart, 1 if it couldn't do
# anything. Does NOT wait for the mount — the caller polls mountinfo. Prefers a clean
# `systemctl restart` (also revives a fully-dead/inactive unit, which an unprivileged kill
# can't) via the NOPASSWD drop-in; falls back to signalling the live daemon's MainPID so
# the alive-but-mountless case self-heals without that rule.
restart_gdrive() {
  if run_bounded 30 sudo -n /usr/bin/systemctl restart "$GDRIVE_UNIT" >/dev/null 2>&1; then
    echo "sudo systemctl restart $GDRIVE_UNIT"; return 0
  fi
  local pid; pid="$(systemctl show "$GDRIVE_UNIT" -p MainPID --value 2>/dev/null)"
  if [ -n "$pid" ] && [ "$pid" != "0" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    echo "signalled $GDRIVE_UNIT MainPID $pid (Restart=always respawns it)"; return 0
  fi
  return 1
}

# Attempt to heal a wedged Drive FUSE mount. Echoes a human summary either way; returns 0
# only when the mount came back AND answers a bounded probe. Ordering matters: the abort
# is what frees existing D-state waiters and makes the daemon exit so Restart= respawns it;
# the lazy unmount just detaches the corpse so the fresh mount can take the mountpoint.
remediate_mount() {
  local f="$STATE_DIR/remediate-mount.ts" now last dev mp minor
  mkdir -p "$STATE_DIR"
  now="$(date +%s)"
  last="$(cat "$f" 2>/dev/null || echo 0)"
  if [ "${WATCHDOG_REMEDIATE:-1}" = "0" ]; then
    echo "disabled (WATCHDOG_REMEDIATE=0)"; return 1
  fi
  if [ $((now - last)) -lt "$REMEDIATE_DEBOUNCE_S" ]; then
    echo "already attempted $((now - last))s ago (debounce ${REMEDIATE_DEBOUNCE_S}s) — not retrying"
    return 1
  fi
  read -r dev mp <<<"$(find_fuse_mount)" || true
  if [ -z "${mp:-}" ]; then
    # VANISHED mount (daemon alive, mount gone from mountinfo): no connection to abort and
    # no mountpoint to unmount — force gdrive.service to remount instead.
    if [ "${ALERT_DRY_RUN:-}" = "1" ]; then
      echo "[dry-run] would force-restart $GDRIVE_UNIT (mount vanished from mountinfo)"; return 1
    fi
    printf '%s' "$now" >"$f"
    log "mount vanished from mountinfo — forcing $GDRIVE_UNIT restart"
    local how waited=0
    if ! how="$(restart_gdrive)"; then
      echo "mount vanished but could not restart $GDRIVE_UNIT (no passwordless sudo + no live daemon to signal) — run: sudo systemctl restart $GDRIVE_UNIT"
      return 1
    fi
    while [ "$waited" -lt "$REMOUNT_WAIT_S" ]; do
      [ -n "$(find_fuse_mount)" ] && break
      sleep 3; waited=$((waited + 3))
    done
    if [ -z "$(find_fuse_mount)" ]; then
      echo "$how, but no FUSE mount reappeared above '$DRIVE_MOUNT' in ${REMOUNT_WAIT_S}s — check $GDRIVE_UNIT"
      return 1
    fi
    if run_bounded 20 bash -c 'ls "$1" >/dev/null 2>&1' _ "$DRIVE_MOUNT"; then
      echo "Drive mount had vanished (daemon alive, Restart= never fired); $how; remounted and '$DRIVE_MOUNT' answers again"
      return 0
    fi
    echo "$how; a mount reappeared but '$DRIVE_MOUNT' is still unresponsive"
    return 1
  fi
  minor="${dev#*:}"
  if [ "${ALERT_DRY_RUN:-}" = "1" ]; then
    echo "[dry-run] would abort FUSE conn $minor + lazy-unmount '$mp'"; return 1
  fi
  printf '%s' "$now" >"$f"
  log "remediating wedged FUSE mount '$mp' (conn $minor)"
  if [ -e "/sys/fs/fuse/connections/$minor/abort" ]; then
    echo 1 >"/sys/fs/fuse/connections/$minor/abort" 2>/dev/null \
      || log "WARN: could not write conn $minor abort (continuing)"
  fi
  run_bounded 15 fusermount -uz "$mp" >/dev/null 2>&1 \
    || log "WARN: fusermount -uz '$mp' failed (continuing)"
  # Wait for the respawned daemon's FRESH mount (a new device id at the same mountpoint).
  local waited=0 newdev=""
  while [ "$waited" -lt "$REMOUNT_WAIT_S" ]; do
    newdev="$(awk -v mp="$mp" '$5 == mp { dev = $3 } END { print dev }' /proc/self/mountinfo)"
    if [ -n "$newdev" ] && [ "$newdev" != "$dev" ]; then break; fi
    sleep 3; waited=$((waited + 3))
  done
  if [ -z "$newdev" ] || [ "$newdev" = "$dev" ]; then
    echo "aborted stale FUSE conn $minor + lazy-unmounted '$mp', but no fresh mount appeared in ${REMOUNT_WAIT_S}s — check gdrive.service (sudo systemctl restart gdrive.service)"
    return 1
  fi
  if run_bounded 20 bash -c 'ls "$1" >/dev/null 2>&1' _ "$DRIVE_MOUNT"; then
    echo "aborted stale FUSE conn $minor (freed D-state waiters), lazy-unmounted '$mp'; gdrive.service remounted (conn ${newdev#*:}) and '$DRIVE_MOUNT' answers again"
    return 0
  fi
  echo "remounted (conn ${newdev#*:}) but '$DRIVE_MOUNT' is still unresponsive"
  return 1
}

# NIC link integrity: page when the interface's rx CRC counter GREW since the previous
# tick — a healthy wired link stays at literally +0 for days, so any growth is physical
# corruption (cable/port/NIC). Reads /sys (no root, unlike `ethtool -S`). Counter-delta
# semantics: each call consumes the window by rewriting the baseline, so this must NOT
# be wrapped in confirm() (an immediate re-probe would always read +0 and mask a fault);
# run_watchdog calls it exactly once per tick. First-ever run seeds the baseline
# silently (the incident left ~1.5M historical errors on the counter).
check_nic() {
  local stats="/sys/class/net/$NIC_IFACE/statistics/rx_crc_errors"
  [ -r "$stats" ] || return 0   # interface gone/renamed — not this check's concern
  local f="$STATE_DIR/nic-crc.last" now prev delta speed
  now="$(cat "$stats" 2>/dev/null || echo 0)"
  mkdir -p "$STATE_DIR"
  prev="$(cat "$f" 2>/dev/null || true)"
  printf '%s' "$now" >"$f"
  [ -n "$prev" ] || return 0
  delta=$((now - prev))
  [ "$delta" -le 0 ] && return 0
  speed="$(cat "/sys/class/net/$NIC_IFACE/speed" 2>/dev/null || echo '?')"
  echo "NIC $NIC_IFACE is corrupting frames: +$delta rx CRC errors since the last tick (total $now, link ${speed}Mb/s) — bad cable/port/NIC (stopgap: sudo ethtool -s $NIC_IFACE advertise 0x008 forces clean 100FD; fix: swap the cable/port)"
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
  local reason fix
  if reason="$(confirm check_mount)"; then transition mount ok "Drive mount '$DRIVE_MOUNT' responsive again"
  elif fix="$(remediate_mount)"; then
    # Healed within one tick. Post the orange remediation notice and record state ok
    # directly (skipping transition() so a wedge-then-fix inside one tick doesn't also
    # emit a confusing red/green pair).
    post "🟠 **astra watchdog auto-remediated** — Drive mount was down: $fix"
    mkdir -p "$STATE_DIR"; printf 'ok' >"$STATE_DIR/mount.state"
  else
    transition mount bad "$reason — auto-remediation: $fix"
  fi
  if reason="$(check_nic)"; then transition nic ok  "NIC $NIC_IFACE link clean again (no new rx CRC errors this tick)"
  else                           transition nic bad "$reason"; fi
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
