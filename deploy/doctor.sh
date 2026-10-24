#!/usr/bin/env bash
# astra host doctor (0037 ops-2, OPS-17/OPS-26) — a read-only health check of this host.
#
#   doctor.sh            run every check; exit 1 if any check FAILs (warnings do not fail)
#
# `just doctor` calls this. It never changes anything: it only runs version commands,
# `docker compose config`, `systemctl --user is-enabled`, `loginctl show-user`, file tests and
# TLS handshakes. It never reads a secret (the age key is only tested for existence). Checks:
#   tools   each mise.toml pin (plus .node-version / .python-version) against the binary
#           found on PATH, which is what the recipes and scripts run
#   binds   every bind-mount source in the resolved compose config exists (a missing source
#           under the data root would be created as root by Docker)
#   units   every unit an install recipe links (each `_unit-link` in the justfile) is a symlink
#           into the deploy checkout, and every such timer and path unit is enabled
#   host    user lingering is on; the SOPS age key file exists
#   certs   each host in sites.caddyfile serves a certificate valid for DOCTOR_CERT_MIN_DAYS
#           (a warning under 28 days: Caddy renews at 30, so a cert below that is overdue)
#   expiry  `astra-expires: YYYY-MM-DD` markers on temporary surfaces (sites.caddyfile and the
#           compose file) are not past, nor within DOCTOR_CERT_MIN_DAYS days
#
# Environment: ASTRA_DATA_ROOT, ASTRA_DEPLOY_ROOT (as in deploy.sh), DOCTOR_SKIP (comma list
# of check names to skip), DOCTOR_CERT_MIN_DAYS (default 14), DOCTOR_EDGE_ADDR (host:port to
# connect to instead of each name:443). Test hooks: DOCTOR_UNIT_DIR, DOCTOR_SYSTEMCTL,
# DOCTOR_COMPOSE_JSON (a file with `docker compose config --format json` output),
# DOCTOR_EXPIRY_FILES (space-separated files to scan for markers), DOCTOR_TODAY.
#
# No `-e`: a doctor reports every problem, it does not stop at the first.
set -uo pipefail
shopt -s nullglob

CODE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
DATA_ROOT="${ASTRA_DATA_ROOT:-/ruby/data/astra-state}"
DEPLOY_ROOT="${ASTRA_DEPLOY_ROOT:-/ruby/data/astra-deploy}"
UNIT_DIR="${DOCTOR_UNIT_DIR:-$HOME/.config/systemd/user}"
SYSTEMCTL="${DOCTOR_SYSTEMCTL:-systemctl}"
MIN_DAYS="${DOCTOR_CERT_MIN_DAYS:-14}"
WARN_DAYS=28
SKIP=",${DOCTOR_SKIP:-},"
TODAY="${DOCTOR_TODAY:-$(date -u +%F)}"

FAILS=0
WARNS=0
ok() { printf '[ok]   %s\n' "$*"; }
warn() { printf '[warn] %s\n' "$*"; WARNS=$((WARNS + 1)); }
fail() { printf '[FAIL] %s\n' "$*"; FAILS=$((FAILS + 1)); }
skipped() { [[ $SKIP == *",$1,"* ]] && printf '[skip] %s\n' "$1"; }

# The first dotted number in a tool's `--version` output (uv 0.11.19 → 0.11.19, jq-1.6 → 1.6,
# "wasm-opt version 124 (version_124)" → 124).
tool_version() { "$1" --version 2>/dev/null | head -n 1 | grep -oE '[0-9]+(\.[0-9]+)*' | head -n 1; }

# mise.toml tool key → the binary it provides.
tool_bin() {
  case "$1" in
    github:WebAssembly/binaryen) echo wasm-opt ;;
    *) echo "${1##*/}" ;;
  esac
}

# $1 tool label, $2 binary, $3 pin, $4 "exact" or "prefix" (a pin like node 24 matches 24.x).
check_tool() {
  local label="$1" bin="$2" pin="$3" mode="$4" path have
  path="$(command -v "$bin" 2>/dev/null)" || { fail "tools: $label not found on PATH (pin $pin; run: mise install)"; return; }
  have="$(tool_version "$path")"
  if [ "$have" = "$pin" ] || { [ "$mode" = prefix ] && [[ $have == "$pin".* ]]; }; then
    ok "tools: $label $have ($path)"
  else
    fail "tools: $label is ${have:-unknown} at $path, mise.toml pins $pin (run: mise install, and put mise's shims first on PATH)"
  fi
}

check_tools() {
  local line key pin
  # [tools] entries: `name = "1.2.3"` or `"github:o/r" = { version = "124", ... }`.
  while IFS= read -r line; do
    key="$(sed -nE 's/^"?([^"= ]+)"? *=.*/\1/p' <<<"$line")"
    pin="$(sed -nE 's/^[^=]+= *"([^"]+)".*/\1/p; s/^[^=]+= *\{.*version *= *"([^"]+)".*/\1/p' <<<"$line")"
    [ -n "$key" ] && [ -n "$pin" ] && check_tool "$key" "$(tool_bin "$key")" "$pin" exact
  done < <(awk '/^\[/{ t = ($0 == "[tools]") ; next } t && /=/ && !/^ *#/' "$CODE_ROOT/mise.toml")
  [ -f "$CODE_ROOT/.node-version" ] && check_tool node node "$(tr -d '[:space:]' <"$CODE_ROOT/.node-version")" prefix
  if [ -f "$CODE_ROOT/.python-version" ]; then
    pin="$(tr -d '[:space:]' <"$CODE_ROOT/.python-version")"
    if command -v uv >/dev/null && line="$(uv python find --no-project "$pin" 2>/dev/null)"; then
      ok "tools: python $pin ($line)"
    else
      fail "tools: no python $pin for uv (run: uv python install $pin)"
    fi
  fi
  if command -v docker >/dev/null; then ok "tools: docker $(tool_version docker)"; else fail "tools: docker not found on PATH"; fi
}

check_binds() {
  local json src missing=0 n=0
  if [ -n "${DOCTOR_COMPOSE_JSON:-}" ]; then
    json="$(cat "$DOCTOR_COMPOSE_JSON")"
  elif ! json="$(docker compose -f "$CODE_ROOT/deploy/docker-compose.yml" config --format json 2>/dev/null)"; then
    fail "binds: docker compose config failed for deploy/docker-compose.yml"
    return
  fi
  while IFS= read -r src; do
    n=$((n + 1))
    if [ ! -e "$src" ]; then
      missing=$((missing + 1))
      if [[ $src == "$DATA_ROOT"/* ]]; then
        fail "binds: $src is missing (the deploy will fail on it; run: just artifacts-init)"
      else
        fail "binds: $src is missing"
      fi
    fi
  done < <(jq -r '[.services[]?.volumes[]? | select(.type == "bind") | .source] | unique[]' <<<"$json")
  [ "$missing" -eq 0 ] && ok "binds: all $n bind-mount sources exist"
}

# "<recipe> <unit>" for every unit an install recipe links, from the justfile (first recipe wins).
linked_units() {
  sed -nE 's/^([a-z0-9-]+):.*\(_unit-link ([^)]*)\).*/\1 \2/p' "$CODE_ROOT/justfile" |
    while read -r recipe units; do
      for u in $units; do printf '%s %s\n' "$recipe" "${u//\"/}"; done
    done | awk '!seen[$2]++'   # a unit two recipes link is checked once
}

check_units() {
  local recipe unit want dst have state bad=0 n=0
  while read -r recipe unit; do
    n=$((n + 1))
    want="$DEPLOY_ROOT/deploy/systemd/$unit"
    dst="$UNIT_DIR/$unit"
    if [ -L "$dst" ]; then
      have="$(readlink "$dst")"
      if [ "$have" != "$want" ]; then
        fail "units: $unit links to $have, not the deploy checkout (run: just $recipe)"; bad=1; continue
      fi
      [ -f "$want" ] || { fail "units: $unit links to $want, which does not exist (deploy a commit that has it)"; bad=1; continue; }
    elif [ -e "$dst" ]; then
      fail "units: $unit is a copy, not a link into the deploy checkout (run: just $recipe)"; bad=1; continue
    else
      fail "units: $unit is not installed (run: just $recipe)"; bad=1; continue
    fi
    case "$unit" in
      *.timer | *.path)
        state="$("$SYSTEMCTL" --user is-enabled "$unit" 2>/dev/null)"
        [ "$state" = enabled ] || { fail "units: $unit is ${state:-not enabled} (run: just $recipe)"; bad=1; } ;;
    esac
  done < <(linked_units)
  [ "$bad" -eq 0 ] && ok "units: all $n linked from $DEPLOY_ROOT, timers and path units enabled"
}

check_host() {
  local linger key="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
  linger="$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)"
  if [ "$linger" = yes ]; then ok "host: lingering is on (user timers run without a login)"
  else fail "host: lingering is ${linger:-unknown} (run: loginctl enable-linger $(id -un))"; fi
  if [ -f "$key" ]; then ok "host: SOPS age key present at $key"
  else fail "host: no SOPS age key at $key (restore it from the password manager)"; fi
}

days_until() { echo $((($(date -u -d "$1" +%s) - $(date -u -d "$TODAY" +%s)) / 86400)); }

check_certs() {
  local host addr end days
  while read -r host; do
    addr="${DOCTOR_EDGE_ADDR:-$host:443}"
    end="$(echo | timeout 15 openssl s_client -connect "$addr" -servername "$host" 2>/dev/null |
      openssl x509 -noout -enddate 2>/dev/null | sed 's/^notAfter=//')"
    if [ -z "$end" ]; then fail "certs: $host served no certificate via $addr"; continue; fi
    days="$(days_until "$end")"
    if [ "$days" -lt "$MIN_DAYS" ]; then fail "certs: $host expires in $days days ($end); see docs/runbook.md, certificates"
    elif [ "$days" -lt "$WARN_DAYS" ]; then warn "certs: $host expires in $days days; renewal is overdue (journalctl -u caddy | grep -i renew)"
    else ok "certs: $host valid for $days days"; fi
  done < <(sed -nE 's/^([a-z0-9.-]+\.[a-z]+) \{.*/\1/p' "$CODE_ROOT/sites.caddyfile")
}

check_expiry() {
  local file line date days n=0
  local -a files=("$CODE_ROOT/sites.caddyfile" "$CODE_ROOT/deploy/docker-compose.yml")
  [ -n "${DOCTOR_EXPIRY_FILES:-}" ] && read -ra files <<<"$DOCTOR_EXPIRY_FILES"
  for file in "${files[@]}"; do
    while IFS= read -r line; do
      n=$((n + 1))
      date="$(grep -oE 'astra-expires: [0-9]{4}-[0-9]{2}-[0-9]{2}' <<<"$line" | cut -d' ' -f2)"
      days="$(days_until "$date")"
      if [ "$days" -lt 0 ]; then fail "expiry: ${file#"$CODE_ROOT"/}: expired $date — remove it: ${line#*:}"
      elif [ "$days" -lt "$MIN_DAYS" ]; then warn "expiry: ${file#"$CODE_ROOT"/}: expires $date (in $days days): ${line#*:}"
      else ok "expiry: ${file#"$CODE_ROOT"/}: expires $date"; fi
    done < <(grep -nE 'astra-expires: [0-9]{4}-[0-9]{2}-[0-9]{2}' "$file")
  done
  [ "$n" -eq 0 ] && ok "expiry: no temporary surface is marked with astra-expires"
}

for check in tools binds units host certs expiry; do
  skipped "$check" || "check_$check"
done
printf 'doctor: %d failed, %d warning(s)\n' "$FAILS" "$WARNS"
[ "$FAILS" -eq 0 ]
