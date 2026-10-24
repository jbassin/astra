#!/usr/bin/env bash
# Wait until a compose project's containers are up and healthy (deploy.sh step 7b).
#
#   wait-healthy.sh [--timeout S] [--settle S] -- COMPOSE_ARGS... [-- SERVICE...]
#
# COMPOSE_ARGS select the project and must name its compose file (`-f deploy/docker-compose.yml`,
# plus `-p <name>` if needed); SERVICEs limit the check (none = every container of a service in
# the file; orphans are skipped). Only the named services are checked, not the dependencies
# `up` may have recreated for them. A container passes when:
#   - it has a healthcheck: it is running and its health status is `healthy`;
#   - it has none: it has been running for at least --settle seconds (default 15) without
#     restarting since the wait began, so a fast crash loop never passes on a lucky sample
#     (one that crashes only after the settle time does pass; give it a healthcheck);
#   - it is a one-shot (restart policy `no` or `on-failure`): it has exited with code 0.
# Polls every 3 s until every container passes (exit 0) or --timeout seconds pass (default
# 180). On timeout it prints each failing container's state and its last log lines to
# stderr and exits 1. Exit 2 = usage or no container found. Never touches a container.
set -Eeuo pipefail

timeout=180
settle=15
tail_lines="${WAIT_HEALTHY_LOG_LINES:-20}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --timeout) timeout="$2"; shift 2 ;;
    --settle) settle="$2"; shift 2 ;;
    --) shift; break ;;
    *) echo "wait-healthy: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
compose_args=()
while [ "$#" -gt 0 ] && [ "$1" != -- ]; do compose_args+=("$1"); shift; done
[ "$#" -eq 0 ] || shift
services=("$@")
[ "${#compose_args[@]}" -gt 0 ] || { echo "wait-healthy: no compose arguments" >&2; exit 2; }

log() { printf 'wait-healthy: %s\n' "$*" >&2; }

# --orphans=false: a leftover container of a service no longer in the compose file is not
# this deploy's and must not fail every whole-stack deploy (`docker compose up
# --remove-orphans` or `docker rm` clears it).
mapfile -t ids < <(docker compose "${compose_args[@]}" ps -a -q --orphans=false "${services[@]}")
[ "${#ids[@]}" -gt 0 ] || { log "no containers for ${services[*]:-the project}"; exit 2; }

# One line per container: name, status, health ("-" = no healthcheck), restart count,
# exit code, restart policy, started-at (unix seconds).
inspect() {
  docker inspect -f '{{.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}} {{.RestartCount}} {{.State.ExitCode}} {{.HostConfig.RestartPolicy.Name}} {{.State.StartedAt}}' "${ids[@]}" |
    while read -r name status health restarts code policy started; do
      printf '%s %s %s %s %s %s %s\n' "${name#/}" "$status" "$health" "$restarts" "$code" \
        "${policy:-no}" "$(date -d "$started" +%s 2>/dev/null || echo 0)"
    done
}

declare -A restarts0=()
while read -r name _ _ restarts _ _ _; do restarts0[$name]="$restarts"; done < <(inspect)

deadline=$(($(date +%s) + timeout))
while :; do
  now="$(date +%s)"
  bad=()
  while read -r name status health restarts code policy started; do
    reason=""
    case "$policy" in
      no | on-failure)
        if [ "$status" = exited ] && [ "$code" = 0 ]; then continue; fi
        ;;
    esac
    if [ "$status" != running ]; then
      reason="$status (exit $code)"
    elif [ "$health" != - ]; then
      [ "$health" = healthy ] || reason="health $health"
    elif [ "$restarts" != "${restarts0[$name]:-0}" ]; then
      reason="restarted $((restarts - ${restarts0[$name]:-0})) time(s) during the wait"
    elif [ $((now - started)) -lt "$settle" ]; then
      reason="running for only $((now - started)) s"
    fi
    if [ -n "$reason" ]; then bad+=("$name|$reason"); fi
  done < <(inspect)
  if [ "${#bad[@]}" -eq 0 ]; then
    log "all ${#ids[@]} container(s) up"
    exit 0
  fi
  if [ "$now" -ge "$deadline" ]; then break; fi
  sleep 3
done

log "${#bad[@]} of ${#ids[@]} container(s) not healthy after ${timeout}s:"
for b in "${bad[@]}"; do
  name="${b%%|*}"
  log "  $name: ${b#*|}"
done
for b in "${bad[@]}"; do
  name="${b%%|*}"
  printf '\n--- %s: last %s log lines\n' "$name" "$tail_lines" >&2
  docker logs --tail "$tail_lines" "$name" 2>&1 | sed 's/^/  /' >&2 || true
done
exit 1
