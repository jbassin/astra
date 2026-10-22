#!/usr/bin/env bash
# astra nightly backup (0037 OPS-6) — everything the stack needs that is NOT in git.
#
#   astra-backup.sh run                    take one snapshot, then prune (astra-backup.timer)
#   astra-backup.sh restore-test [SNAP]    prove the newest (or named) snapshot restores
#   astra-backup.sh export-rules DIR       write the SigNoz alert rules as JSON into DIR
#   astra-backup.sh prune [--dry-run]      apply the retention rule (run does this itself)
#
# Target: $BACKUP_ROOT on the sda data disk (a different device from the nvme that holds
# the repo, Docker and the live data). Same host and same trust boundary, so no encryption
# and no off-host copy (owner's decision). Root dir is uid 1000, mode 0700.
#
# One snapshot = one directory named <UTC date>T<HHMMSS>Z, holding:
#   postgres/<svc>.dump          pg_dump -Fc of each astra database (dagster, weal, orator)
#   postgres/<svc>.counts.tsv    exact per-table row counts, taken in the SAME MVCC snapshot
#                                as the dump (pg_export_snapshot), so restore-test can
#                                demand an exact match even while Dagster keeps writing
#   postgres/<svc>.globals.sql   pg_dumpall --globals-only --no-role-passwords
#   postgres/<svc>.meta.json     image, server version, db, user, table/row totals
#   signoz/rules/<slug>.json     SigNoz alert rules (rules ONLY — notification channels hold
#                                the Discord webhook secret and are deliberately skipped)
#   state/<repo-relative path>   rsync copies of the irreplaceable state dirs (STATE_DIRS),
#                                hardlinked (--link-dest) against the previous snapshot, so
#                                an unchanged 14 GB music library costs nothing per night
#   manifest.json                written last; a snapshot without it is never trusted
#
# Atomic: a run builds .incomplete-<name>/ and renames it to <name>/ only after every step
# succeeded and the data is synced to disk. A failed run removes its temp dir (a SIGKILLed
# run's leftover is swept by the next run). Nothing reads a dot-prefixed dir.
#
# Retention (applied only after a successful run): keep the newest snapshot of each of the
# 14 most recent UTC calendar days that have one, plus the newest snapshot of each of the
# 8 most recent ISO weeks that have one; delete every other snapshot. Two runs on one day
# keep only the later one.
#
# Restore by hand (newest snapshot = $BACKUP_ROOT/latest):
#   Postgres  stop the app container, then
#             docker exec -i astra-weal-postgres pg_restore -U weal -d weal --clean \
#               --if-exists --no-owner --single-transaction < latest/postgres/weal.dump
#   state     rsync -a latest/state/artifacts/audio/orator/ \
#               /ruby/data/experiments/astra/artifacts/audio/orator/   (any path likewise)
#   rules     re-create each latest/signoz/rules/*.json with the signoz_create_alert MCP
#             tool (or POST /api/v1/rules); the discord-ops channel is re-created from the
#             SOPS webhook (thoughts/shared/memory/astra-alerting-setup.md)
#
# Failure paging: astra-backup.service has OnFailure=astra-alert@%n.service (Class C,
# debounced per unit by alert-notify.sh). Unlike the alerter, this script uses `set -e`:
# a backup must stop at the first error and fail the unit, never finish half a snapshot.
set -Eeuo pipefail
shopt -s nullglob

REPO="${ASTRA_REPO:-/ruby/data/experiments/astra}"
BACKUP_ROOT="${ASTRA_BACKUP_ROOT:-/ruby/data/plex/data/astra-backups}"
# The mount the backup root must live on. If the sda disk is not mounted, its mountpoint
# is a plain directory on the nvme — writing there would put the "backup" on the same
# device as the data, so the run refuses instead.
BACKUP_MOUNT="${ASTRA_BACKUP_MOUNT:-/ruby/data/plex/data}"
KEEP_DAILY="${ASTRA_BACKUP_KEEP_DAILY:-14}"
KEEP_WEEKLY="${ASTRA_BACKUP_KEEP_WEEKLY:-8}"
MIN_FREE_GB="${ASTRA_BACKUP_MIN_FREE_GB:-100}"
SAMPLE_FILES="${ASTRA_BACKUP_SAMPLE_FILES:-20}"
# Small image with python's sqlite3 module, used --network none to read the SigNoz DB.
HELPER_IMAGE="${ASTRA_BACKUP_HELPER_IMAGE:-python:3.12-alpine}"
SIGNOZ_CONTAINER="${ASTRA_BACKUP_SIGNOZ_CONTAINER:-signoz}"

# The astra Postgres containers (deploy/docker-compose.yml: dagster-, weal-, orator-postgres).
# User and database come from each container's own POSTGRES_USER / POSTGRES_DB, and local
# socket auth inside the container is trust, so no credential is needed or stored here.
PG_CONTAINERS=(astra-dagster-postgres astra-weal-postgres astra-orator-postgres)

# Irreplaceable state, repo-relative. Default-include: everything under artifacts/ is copied
# unless excluded below with a reason, so a new state dir is backed up without an edit here.
STATE_DIRS=(
  artifacts                         # bind-mount state for the live stack (see excludes)
  apps/assay/review-ui/state        # scriptorium review decisions + comments (human work)
  apps/mouthpiece-backend/episodes  # paid LLM + TTS renders (scripts, briefs, clips, mp3s)
)
# rsync exclude patterns per state dir (anchored at the dir root with a leading /).
excludes_for() {
  case "$1" in
    artifacts)
      # /postgres/       live PGDATA (uid 70, mode 0700): a file copy of a running cluster
      #                  is not consistent and uid 1000 cannot read it; pg_dump covers it
      # /node-exporter/  smartmon.prom, rewritten every few minutes by smart-exporter
      # *.lock           git-publish.lock, heartwood backfill.lock: runtime locks, no data
      printf '%s\n' /postgres/ /node-exporter/ '*.lock'
      ;;
  esac
}

SNAP_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$'

# Exact per-table row counts. psql \gexec runs one count(*) per user table; each output line
# is "<schema>.<table><TAB><rows>", sorted by table name. Shared by run and restore-test.
read -r -d '' COUNT_SQL <<'SQL' || true
SELECT format('SELECT %L || E''\t'' || count(*) FROM %I.%I;', n.nspname || '.' || c.relname,
              n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\_%'
ORDER BY 1 \gexec
SQL

# Reads the SigNoz sqlite store read-only and writes one JSON file per live alert rule (the
# rule body exactly as the rules API accepts it). Refuses if a rule carries a webhook URL.
read -r -d '' RULES_PY <<'PY' || true
import json, re, sqlite3, sys
con = sqlite3.connect("file:/db/signoz.db?mode=ro", uri=True)
rows = con.execute("SELECT id, data FROM rule WHERE deleted = 0 ORDER BY id").fetchall()
secret = re.compile(r"/api/webhooks/|hooks\.slack\.com|discord(app)?\.com/api", re.I)
seen = set()
for rid, data in rows:
    if secret.search(data):
        sys.exit(f"rule {rid} contains a webhook URL; refusing to export it")
    rule = json.loads(data)
    slug = re.sub(r"[^a-z0-9]+", "-", str(rule.get("alert") or rid).lower()).strip("-") or rid
    if slug in seen:
        slug = f"{slug}-{rid[-8:]}"
    seen.add(slug)
    with open(f"/out/{slug}.json", "w", encoding="utf-8") as f:
        json.dump(rule, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")
print(len(rows))
PY

log() { printf 'astra-backup: %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }
trap 'log "failed at line $LINENO: $BASH_COMMAND"' ERR

human() { numfmt --to=iec --suffix=B "$1"; }

# Complete snapshots, oldest first (names sort chronologically).
list_snapshots() {
  local d n
  for d in "$BACKUP_ROOT"/*/; do
    n="$(basename "$d")"
    if [[ $n =~ $SNAP_RE ]] && [ -f "$d/manifest.json" ] && [ ! -L "${d%/}" ]; then
      printf '%s\n' "$n"
    fi
  done
}

# Refuse to write anywhere but the backup disk; create the root (uid 1000, 0700).
check_target() {
  local parent mp free_kb
  parent="$(dirname "$BACKUP_ROOT")"
  [ -d "$parent" ] || die "backup parent $parent does not exist"
  mp="$(findmnt -n -o TARGET -T "$parent" 2>/dev/null || true)"
  [ "$mp" = "$BACKUP_MOUNT" ] ||
    die "$parent is on mount '${mp:-unknown}', not $BACKUP_MOUNT — is the backup disk mounted? Refusing to write the backup anywhere else"
  mkdir -p "$BACKUP_ROOT"
  chmod 0700 "$BACKUP_ROOT"
  [ "$(stat -c %u "$BACKUP_ROOT")" = "$(id -u)" ] || die "$BACKUP_ROOT is not owned by uid $(id -u)"
  free_kb="$(df -P -k "$BACKUP_ROOT" | awk 'NR == 2 { print $4 }')"
  [ "$((free_kb / 1024 / 1024))" -ge "$MIN_FREE_GB" ] ||
    die "only $((free_kb / 1024 / 1024)) GB free on $BACKUP_MOUNT (need $MIN_FREE_GB)"
}

# One backup/restore-test/prune at a time. Waits (up to 2 h) instead of failing, so a
# manual `just backup-now` never makes the nightly run page.
take_lock() {
  exec {LOCK_FD}>"$BACKUP_ROOT/.lock"
  flock -w 7200 "$LOCK_FD" || die "another astra-backup run has held $BACKUP_ROOT/.lock for 2 h"
}

pg_service() { local s="${1#astra-}"; printf '%s' "${s%-postgres}"; }

# --- Postgres ---------------------------------------------------------------------------

# Dump one database and count its rows inside one exported MVCC snapshot. A coprocess psql
# session holds a REPEATABLE READ transaction open; pg_dump --snapshot reads exactly that
# snapshot, then the same session counts every table. All reads; the session is read-only.
dump_database() {
  local ctr="$1" dest="$2" svc image db user tables rows snap="" line="" version=""
  svc="$(pg_service "$ctr")"
  [ "$(docker inspect -f '{{.State.Running}}' "$ctr" 2>/dev/null)" = true ] || die "$ctr is not running"
  image="$(docker inspect -f '{{.Config.Image}}' "$ctr")"
  db="$(docker exec "$ctr" printenv POSTGRES_DB)"
  user="$(docker exec "$ctr" printenv POSTGRES_USER)"

  coproc PSQL {
    docker exec -i "$ctr" sh -c \
      'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -XqAt -v ON_ERROR_STOP=1 2>&1'
  }
  # shellcheck disable=SC2153 # PSQL_PID is set by `coproc PSQL`
  local to_psql="${PSQL[1]}" from_psql="${PSQL[0]}" psql_pid="$PSQL_PID"
  printf '%s\n' "SET default_transaction_read_only = on;" \
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" "SELECT pg_export_snapshot();" >&"$to_psql"
  IFS= read -r -t 60 snap <&"$from_psql" || die "$ctr: psql gave no snapshot id"
  [[ $snap =~ ^[0-9A-F]+-[0-9A-F]+-[0-9]+$ ]] || die "$ctr: unexpected psql output: $snap"

  docker exec "$ctr" sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --snapshot="$1"' \
    _ "$snap" >"$dest/$svc.dump"

  printf '%s\n' "SELECT 'server_version' || E'\t' || current_setting('server_version');" \
    "$COUNT_SQL" "SELECT '__END__';" >&"$to_psql"
  : >"$dest/$svc.counts.tsv"
  while IFS= read -r -t 600 line <&"$from_psql"; do
    [ "$line" = "__END__" ] && break
    case "$line" in
      server_version$'\t'*) version="${line#*$'\t'}" ;;
      *$'\t'*) printf '%s\n' "$line" >>"$dest/$svc.counts.tsv" ;;
      *) die "$ctr: unexpected psql output while counting rows: $line" ;;
    esac
  done
  [ "$line" = "__END__" ] || die "$ctr: row count query did not finish"
  printf '%s\n' "COMMIT;" '\q' >&"$to_psql"
  wait "$psql_pid" || die "$ctr: psql session exited non-zero"
  [ -n "$version" ] || die "$ctr: no server_version"

  docker exec "$ctr" sh -c 'exec pg_dumpall -U "$POSTGRES_USER" --globals-only --no-role-passwords' \
    >"$dest/$svc.globals.sql"
  # The archive's table of contents must read back (pg_restore --list does not connect).
  docker exec -i "$ctr" pg_restore --list <"$dest/$svc.dump" >/dev/null ||
    die "$ctr: pg_restore cannot read back $svc.dump"

  tables="$(wc -l <"$dest/$svc.counts.tsv")"
  rows="$(awk -F'\t' '{ s += $2 } END { print s + 0 }' "$dest/$svc.counts.tsv")"
  jq -n --arg service "$svc" --arg container "$ctr" --arg image "$image" \
    --arg server_version "$version" --arg database "$db" --arg user "$user" \
    --argjson tables "$tables" --argjson rows "$rows" \
    --argjson dump_bytes "$(stat -c %s "$dest/$svc.dump")" \
    '{service: $service, container: $container, image: $image, server_version: $server_version,
      database: $database, user: $user, tables: $tables, rows: $rows, dump_bytes: $dump_bytes}' \
    >"$dest/$svc.meta.json"
  log "postgres $svc: $tables tables, $rows rows, dump $(human "$(stat -c %s "$dest/$svc.dump")")"
}

# --- SigNoz alert rules -----------------------------------------------------------------

signoz_volume() {
  docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/signoz"}}{{.Name}}{{end}}{{end}}' \
    "$SIGNOZ_CONTAINER" 2>/dev/null
}

# Export rules into DIR (replacing any *.json there). Echoes the rule count.
export_rules() {
  local dest="$1" vol f
  vol="$(signoz_volume)"
  [ -n "$vol" ] || die "cannot find the sqlite volume of container $SIGNOZ_CONTAINER"
  mkdir -p "$dest"
  for f in "$dest"/*.json; do rm -f -- "$f"; done
  docker run --rm --network none --read-only --tmpfs /tmp --user "$(id -u):$(id -g)" \
    -v "$vol:/db:ro" -v "$(cd "$dest" && pwd -P):/out" "$HELPER_IMAGE" python -I -B -c "$RULES_PY"
}

# --- state directories ------------------------------------------------------------------

exclude_args() {
  local ex
  while IFS= read -r ex; do printf '%s\n' "--exclude=$ex"; done < <(excludes_for "$1")
}

backup_state() {
  local dest="$1" prev="$2" rel src out rc files bytes
  local -a args excl
  : >"$dest/.state.jsonl"
  for rel in "${STATE_DIRS[@]}"; do
    src="$REPO/$rel"
    out="$dest/state/$rel"
    [ -d "$src" ] || die "state dir $src is missing"
    mkdir -p "$out"
    mapfile -t excl < <(excludes_for "$rel")
    mapfile -t args < <(exclude_args "$rel")
    if [ -n "$prev" ] && [ -d "$BACKUP_ROOT/$prev/state/$rel" ]; then
      args+=("--link-dest=$BACKUP_ROOT/$prev/state/$rel")
    fi
    rc=0
    rsync -a "${args[@]}" "$src/" "$out/" || rc=$?
    case "$rc" in
      0) ;;
      24) log "warning: some files under $rel vanished while copying (they changed mid-run)" ;;
      *) die "rsync of $rel failed (exit $rc)" ;;
    esac
    files="$(find "$out" -type f | wc -l)"
    bytes="$(du -sb --apparent-size "$out" | cut -f1)"
    jq -nc --arg path "$rel" --argjson files "$files" --argjson bytes "$bytes" \
      --args '{path: $path, files: $files, bytes: $bytes, excludes: $ARGS.positional}' \
      "${excl[@]}" >>"$dest/.state.jsonl"
    log "state $rel: $files files, $(human "$bytes")"
  done
}

# --- retention --------------------------------------------------------------------------

prune() {
  local dry="${1:-}" i s day week keep days=0 weeks=0 deleted=0
  local -a snaps
  local -A seen_day=() seen_week=()
  [ "$KEEP_DAILY" -ge 1 ] || die "KEEP_DAILY must be >= 1 (it protects the newest snapshot)"
  mapfile -t snaps < <(list_snapshots)
  for ((i = ${#snaps[@]} - 1; i >= 0; i--)); do
    s="${snaps[i]}"
    day="${s%%T*}"
    week="$(date -u -d "$day" +%G-W%V)"
    keep=0
    if [ -z "${seen_day[$day]+x}" ]; then
      seen_day[$day]=1
      if [ "$days" -lt "$KEEP_DAILY" ]; then keep=1; days=$((days + 1)); fi
    fi
    if [ -z "${seen_week[$week]+x}" ]; then
      seen_week[$week]=1
      if [ "$weeks" -lt "$KEEP_WEEKLY" ]; then keep=1; weeks=$((weeks + 1)); fi
    fi
    if [ "$keep" -eq 0 ]; then
      deleted=$((deleted + 1))
      if [ "$dry" = "--dry-run" ]; then
        log "prune (dry run): would delete $s"
      else
        log "prune: deleting $s"
        rm -rf -- "${BACKUP_ROOT:?}/$s"
      fi
    fi
  done
  log "retention: ${#snaps[@]} snapshot(s) before, $deleted deleted (keep $KEEP_DAILY daily + $KEEP_WEEKLY weekly)"
}

# --- run --------------------------------------------------------------------------------

RUN_TMP=""
RUN_DONE=0
on_run_exit() {
  local rc=$?
  if [ "$RUN_DONE" -ne 1 ] && [ -n "$RUN_TMP" ] && [ -d "$RUN_TMP" ]; then
    log "run failed (exit $rc) — removing the incomplete snapshot $RUN_TMP"
    rm -rf -- "$RUN_TMP"
  fi
}

cmd_run() {
  local name prev started d ctr rules apparent new_bytes repo_rules
  check_target
  take_lock
  for d in "$BACKUP_ROOT"/.incomplete-*; do
    log "removing leftover $d from an earlier killed run"
    rm -rf -- "$d"
  done
  name="$(date -u +%Y-%m-%dT%H%M%SZ)"
  [ ! -e "$BACKUP_ROOT/$name" ] || die "snapshot $name already exists"
  prev="$(list_snapshots | tail -n 1)"
  RUN_TMP="$BACKUP_ROOT/.incomplete-$name"
  trap on_run_exit EXIT
  mkdir -m 0700 "$RUN_TMP" "$RUN_TMP/postgres"
  started="$(date -u +%FT%TZ)"
  log "snapshot $name starting (hardlinking against ${prev:-nothing — first snapshot})"

  for ctr in "${PG_CONTAINERS[@]}"; do dump_database "$ctr" "$RUN_TMP/postgres"; done

  rules="$(export_rules "$RUN_TMP/signoz/rules")"
  log "signoz: $rules alert rule(s) exported"
  repo_rules="$REPO/deploy/signoz/rules"
  if [ -d "$repo_rules" ] && ! diff -rq "$repo_rules" "$RUN_TMP/signoz/rules" >/dev/null 2>&1; then
    log "warning: live SigNoz alert rules differ from deploy/signoz/rules in git — refresh with: just signoz-rules-export"
  fi

  backup_state "$RUN_TMP" "$prev"

  apparent="$(du -sb --apparent-size "$RUN_TMP" | cut -f1)"
  if [ -n "$prev" ]; then
    new_bytes="$(du -sB1 "$BACKUP_ROOT/$prev" "$RUN_TMP" | tail -n 1 | cut -f1)"
  else
    new_bytes="$(du -sB1 "$RUN_TMP" | cut -f1)"
  fi
  jq -n --arg snapshot "$name" --arg host "${HOSTNAME:-$(hostname)}" --arg started "$started" \
    --arg finished "$(date -u +%FT%TZ)" --arg link_dest "$prev" \
    --argjson rules "$rules" --arg volume "$(signoz_volume)" \
    --argjson apparent "$apparent" --argjson new_bytes "$new_bytes" \
    --argjson daily "$KEEP_DAILY" --argjson weekly "$KEEP_WEEKLY" \
    --slurpfile postgres <(cat "$RUN_TMP"/postgres/*.meta.json) \
    --slurpfile state "$RUN_TMP/.state.jsonl" \
    '{format: 1, snapshot: $snapshot, host: $host, started: $started, finished: $finished,
      link_dest: (if $link_dest == "" then null else $link_dest end),
      retention: {daily: $daily, weekly: $weekly},
      postgres: $postgres, signoz_rules: {count: $rules, volume: $volume}, state: $state,
      apparent_bytes: $apparent, new_bytes: $new_bytes}' >"$RUN_TMP/manifest.json"
  rm -f "$RUN_TMP/.state.jsonl"

  sync -f "$RUN_TMP/manifest.json"
  mv -T "$RUN_TMP" "$BACKUP_ROOT/$name"
  RUN_DONE=1
  ln -sfn "$name" "$BACKUP_ROOT/.latest.new"
  mv -T "$BACKUP_ROOT/.latest.new" "$BACKUP_ROOT/latest"
  log "snapshot $name complete: $(human "$apparent") of data, $(human "$new_bytes") new on disk"

  prune
}

# --- restore-test -----------------------------------------------------------------------

RT_CONTAINERS=()
RT_TMP=""
RT_FAILS=0
rt_fail() { log "FAIL: $*"; RT_FAILS=$((RT_FAILS + 1)); }
rt_ok() { log "ok: $*"; }
on_rt_exit() {
  local c
  for c in "${RT_CONTAINERS[@]}"; do docker rm -f "$c" >/dev/null 2>&1 || true; done
  if [ -n "$RT_TMP" ]; then rm -rf -- "$RT_TMP"; fi
}

# Row counts of a container's database, as "<table><TAB><rows>" lines. Read-only session.
count_rows() {
  docker exec -i "$1" sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -XqAt -v ON_ERROR_STOP=1' \
    <<<"SET default_transaction_read_only = on;
$COUNT_SQL"
}

# Restore one dump into a throwaway container (same image as live, --network none so it can
# never reach signoz-net or a compose network, PGDATA on tmpfs so nothing persists), then
# demand the restored per-table counts equal the counts taken at dump time.
rt_postgres() {
  local snapdir="$1" svc="$2" meta image version db user live name i want got
  meta="$snapdir/postgres/$svc.meta.json"
  image="$(jq -r .image "$meta")"
  version="$(jq -r .server_version "$meta")"
  db="$(jq -r .database "$meta")"
  user="$(jq -r .user "$meta")"
  live="$(jq -r .container "$meta")"
  name="astra-restoretest-$svc-$$"
  if ! docker run -d --rm --network none --name "$name" --label astra.restore-test=1 \
    --tmpfs /var/lib/postgresql/data:rw,size=4g \
    -e POSTGRES_USER="$user" -e POSTGRES_DB="$db" -e POSTGRES_HOST_AUTH_METHOD=trust \
    "$image" >/dev/null; then
    rt_fail "postgres $svc: could not start a throwaway $image container"
    return 0
  fi
  RT_CONTAINERS+=("$name")
  # The image's entrypoint runs a temporary init server first; wait for the real one.
  for ((i = 0; i < 120; i++)); do
    if docker logs "$name" 2>&1 | grep 'PostgreSQL init process complete' >/dev/null &&
      docker exec "$name" pg_isready -q -U "$user" -d "$db" 2>/dev/null; then break; fi
    sleep 1
  done
  if [ "$i" -ge 120 ]; then
    rt_fail "postgres $svc: throwaway server never became ready"
    return 0
  fi
  got="$(docker exec "$name" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -XAtc "show server_version"')" ||
    got="unknown"
  if [ "${got%%.*}" != "${version%%.*}" ]; then
    rt_fail "postgres $svc: throwaway server is $got, dump came from $version (major differs)"
    return 0
  fi
  if ! docker exec -i "$name" sh -c \
    'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error --single-transaction' \
    <"$snapdir/postgres/$svc.dump"; then
    rt_fail "postgres $svc: pg_restore failed"
    return 0
  fi
  if ! count_rows "$name" | LC_ALL=C sort >"$RT_TMP/$svc.restored.tsv"; then
    rt_fail "postgres $svc: could not count rows in the restored database"
    return 0
  fi
  if ! count_rows "$live" | LC_ALL=C sort >"$RT_TMP/$svc.live.tsv"; then
    rt_fail "postgres $svc: could not count rows in the live database $live"
    return 0
  fi
  want="$RT_TMP/$svc.dump.tsv"
  LC_ALL=C sort "$snapdir/postgres/$svc.counts.tsv" >"$want"
  printf '\n  %-44s %12s %12s %12s\n' "postgres $svc ($version)" "at dump" "restored" "live now" >&2
  LC_ALL=C join -t $'\t' -a 1 -a 2 -e '-' -o 0,1.2,1.3,2.2 \
    <(LC_ALL=C join -t $'\t' -a 1 -a 2 -e '-' -o 0,1.2,2.2 "$want" "$RT_TMP/$svc.restored.tsv") \
    "$RT_TMP/$svc.live.tsv" |
    awk -F'\t' '{ flag = ($2 == $3) ? "" : "   <-- MISMATCH";
                  printf "  %-44s %12s %12s %12s%s\n", $1, $2, $3, $4, flag }' >&2
  if [ -s "$want" ] && cmp -s "$want" "$RT_TMP/$svc.restored.tsv"; then
    rt_ok "postgres $svc: $(wc -l <"$want") tables restored with exactly the dump-time row counts"
  else
    rt_fail "postgres $svc: restored row counts differ from the dump-time counts"
  fi
  if ! cmp -s "$RT_TMP/$svc.restored.tsv" "$RT_TMP/$svc.live.tsv"; then
    log "note: postgres $svc: live has changed since the dump (expected for a busy database)"
  fi
  docker rm -f "$name" >/dev/null 2>&1 || true
}

# A copied state dir must still hold the files the manifest recorded, and a random sample
# of files unchanged at the source (same size + mtime) must have identical sha256 sums.
rt_state() {
  local snapdir="$1" rel="$2" want src snap files src_files changed p a b sumsrc sumsnap
  local checked=0 skipped=0 bad=0
  local -a ex
  want="$(jq -r --arg p "$rel" '.state[] | select(.path == $p) | .files' "$snapdir/manifest.json")"
  mapfile -t ex < <(jq -r --arg p "$rel" '.state[] | select(.path == $p) | .excludes[] | "--exclude=" + .' \
    "$snapdir/manifest.json")
  src="$REPO/$rel"
  snap="$snapdir/state/$rel"
  if [ ! -d "$snap" ] || [ ! -d "$src" ]; then
    rt_fail "state $rel: snapshot copy or source directory is missing"
    return 0
  fi
  files="$(find "$snap" -type f | wc -l)"
  if [ "$files" != "$want" ]; then
    rt_fail "state $rel: snapshot holds $files files, manifest recorded $want"
  fi
  src_files="$(rsync -r --list-only "${ex[@]}" "$src/" | grep -c '^-' || true)"
  changed="$(rsync -a --dry-run --delete --out-format='%i %n' "${ex[@]}" "$src/" "$snap/" |
    grep -cv '^\.d' || true)"
  while IFS= read -r p; do
    a="$(stat -c '%s %Y' "$src/$p" 2>/dev/null || true)"
    b="$(stat -c '%s %Y' "$snap/$p")"
    if [ "$a" != "$b" ]; then skipped=$((skipped + 1)); continue; fi
    sumsrc="$(sha256sum <"$src/$p" | cut -d' ' -f1)"
    sumsnap="$(sha256sum <"$snap/$p" | cut -d' ' -f1)"
    checked=$((checked + 1))
    if [ "$sumsrc" != "$sumsnap" ]; then
      bad=$((bad + 1))
      log "checksum mismatch: $rel/$p"
    fi
  done < <(find "$snap" -type f -printf '%P\n' | shuf -n "$SAMPLE_FILES")
  if [ "$bad" -gt 0 ]; then
    rt_fail "state $rel: $bad of $checked sampled files differ from the source"
  elif [ "$checked" -eq 0 ] && [ "$files" -gt 0 ]; then
    rt_fail "state $rel: no sampled file was unchanged at the source, so nothing could be verified"
  else
    rt_ok "state $rel: $files files (source now $src_files; $changed path(s) changed since), sha256 sample $checked matched, $skipped skipped as changed"
  fi
}

rt_rules() {
  local snapdir="$1" want n f
  want="$(jq -r .signoz_rules.count "$snapdir/manifest.json")"
  n=0
  for f in "$snapdir"/signoz/rules/*.json; do
    if jq -e '.alert and .condition' "$f" >/dev/null; then n=$((n + 1)); else rt_fail "rule file $f is not a valid rule"; fi
  done
  if [ "$n" != "$want" ]; then
    rt_fail "signoz: $n valid rule files, manifest recorded $want"
    return 0
  fi
  mkdir -p "$RT_TMP/rules"
  # Subshell: export_rules may die(), which must not end the whole restore-test.
  if (export_rules "$RT_TMP/rules") >/dev/null && diff -rq "$snapdir/signoz/rules" "$RT_TMP/rules" >/dev/null; then
    rt_ok "signoz: $n alert rules, identical to the live rules"
  else
    rt_ok "signoz: $n alert rules parse (live rules have changed since this snapshot)"
  fi
}

cmd_restore_test() {
  local snap snapdir svc rel
  check_target
  take_lock
  snap="${1:-$(list_snapshots | tail -n 1)}"
  [ -n "$snap" ] || die "no complete snapshot in $BACKUP_ROOT"
  snapdir="$BACKUP_ROOT/$snap"
  [ -f "$snapdir/manifest.json" ] || die "$snapdir is not a complete snapshot"
  trap on_rt_exit EXIT
  RT_TMP="$BACKUP_ROOT/.restoretest-$$"
  mkdir -m 0700 "$RT_TMP"
  log "restore-test of snapshot $snap"
  while IFS= read -r svc; do rt_postgres "$snapdir" "$svc"; done < <(jq -r '.postgres[].service' "$snapdir/manifest.json")
  while IFS= read -r rel; do rt_state "$snapdir" "$rel"; done < <(jq -r '.state[].path' "$snapdir/manifest.json")
  rt_rules "$snapdir"
  if [ "$RT_FAILS" -gt 0 ]; then
    die "restore-test of $snap: $RT_FAILS check(s) FAILED"
  fi
  log "restore-test of $snap: PASS"
}

# --- dispatch ---------------------------------------------------------------------------

cmd="${1:-}"
[ "$#" -gt 0 ] && shift
case "$cmd" in
  run) cmd_run ;;
  restore-test) cmd_restore_test "${1:-}" ;;
  export-rules)
    [ -n "${1:-}" ] || die "usage: astra-backup.sh export-rules DIR"
    log "exported $(export_rules "$1") SigNoz alert rule(s) to $1"
    ;;
  prune)
    check_target
    take_lock
    prune "${1:-}"
    ;;
  *)
    log "usage: astra-backup.sh {run | restore-test [SNAPSHOT] | export-rules DIR | prune [--dry-run]}"
    exit 2
    ;;
esac
