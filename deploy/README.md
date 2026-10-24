# deploy/ — astra runtime substrate

One compose file runs the whole substrate (roadmap Decision H): **Dagster** (pipeline control plane)
+ **SigNoz** (observability — the single pane) + the services. The edge is the shared host Caddy. SigNoz
is vendored under `signoz/` (pinned **v0.129.0** / otel-collector **v0.144.5**) and `include`d into the
top-level compose; its published ports are remapped into the astra **10350–10399** range.

## Deploy

```sh
just deploy                    # whole stack at origin/main (or at the rollback pin, below)
just deploy akasha-frontend    # one service
just deploy --sha <rev>        # a pushed older commit (rollback; pins production there)
just deploy --sha origin/main  # back to main after a rollback (clears the pin)
just deploy --dry-run          # checks only; prints the compose command
```

`just deploy` (`deploy.sh`; `just up` is an alias) builds only from the deploy checkout
`/ruby/data/astra-deploy` at a **pushed** commit, never from a developer tree, so push first. It takes a
deploy lock, decrypts the SOPS secrets on the host and passes them as env, and labels every built
image with the commit (`org.opencontainers.image.revision`). History and the per-service live sha are
under `/ruby/data/astra-state/deploy/`; the header of `deploy.sh` has the details. Do not run a bare
`docker compose up`: it starts every service with empty secrets.

Every Node service builds from one file, `node.Dockerfile`; its compose `build.args` pick the app
(`APP`), the entry (`ENTRY`), the baked datasets (`CONTENT`) and the OS layer (`RUNTIME`: ffmpeg for
orator, Chromium for vellum-render and portal-headless), and portal adds `target: portal`. The
runtime images carry production dependencies only. Dagster and smart-exporter keep their own
Dockerfiles. The repo-root `.dockerignore` is a short deny-list; keep it free of `!` re-includes
(its header says why).

**Which deploy tooling runs.** Whatever `deploy.sh` you invoke (the deploy checkout's, which the
bots' recipes call, or a dev tree's), after `git fetch` it copies **origin/main's**
`deploy/deploy.sh` and `deploy/wait-healthy.sh` to `/ruby/data/astra-state/deploy/bin/` and
re-runs that copy under the same deploy lock. So the deploy logic is always main's, even while the
deploy checkout sits at an older rollback sha. Exceptions: `--restart`, `--init-artifacts` and
`--host-tooling` run the invoked script as it is (they fetch nothing), and `ASTRA_DEPLOY_STAGED=1`
skips the copy, the escape hatch when main's `deploy.sh` itself is broken. The rest of the
checkout (the justfile recipes, the unit scripts, the compose file) is at the deployed sha. A
deploy checkout rolled back to a sha from before this staging existed runs that sha's old
`deploy.sh`, which knows no pin, so its next bot redeploy moves back to origin/main.

After `up`, the deploy waits up to 180 s (`DEPLOY_HEALTH_TIMEOUT`) for every container of the deployed
services to come up: a healthcheck must report `healthy`, a container without one must run 15 s
without restarting, and a one-shot must exit 0 (`deploy/wait-healthy.sh`). If one does not, the
deploy prints each failing container with its last log lines and the rollback command
(`just deploy --sha <the newest earlier healthy sha> [services]`), records `result: "unhealthy"`
and exits 10. It never rolls back by itself; the new containers keep running. `--restart` waits
the same way. `just deploy-health-test` checks the wait against throwaway containers. Limits of
the wait:

- A scoped deploy checks only the named services. Dependencies that `up` recreated for them
  are not checked.
- A container without a healthcheck that crashes only after its first 15 s passes. Give a
  service a healthcheck if that matters.
- Orphans (containers of services no longer in the compose file) are skipped, so a dead one
  cannot fail every whole-stack deploy. Clear them with `docker rm` or `up --remove-orphans`.

A `--sha` deploy to anything but origin/main pins production at that sha (`pinned` in
history.jsonl). Until someone deploys `--sha origin/main` (or another explicit sha), every deploy
without `--sha`, including the bots' scoped redeploys of akasha-frontend and mouthpiece-frontend,
builds the pinned sha and logs a warning, so a data publish no longer undoes a rollback. The
deploy checkout is one sha, so a scoped rollback (`--sha <rev> akasha-frontend`) pins the whole
stack: the next deploy of any service builds that sha too.

The astra-data build context is the clone's committed HEAD whether or not it is pushed (a failed
bot push must not hold the site back). When HEAD is ahead of the clone's `origin/main` the deploy
logs a warning and records the count as `data_unpushed`; push with `just _astra-data-push`.
history.jsonl is read leniently: a line that is not a JSON object is skipped.

Every host unit (craig-sync, linguist-commit, heartwood-request, the watchdog, alerting and
backup) runs from the deploy checkout too; the install recipes `systemctl --user link` the unit
files from it. After each checkout `deploy.sh` brings that checkout's host tooling up to date for
them (`uv sync --frozen`, and `pnpm install --frozen-lockfile --filter @astra/vellum-lang` for
heartwood's validator); both are no-ops when nothing changed. `deploy.sh --host-tooling` runs just
that step. The heartwood recipes hold `/ruby/data/astra-state/locks/host-tooling.lock` shared while
they run. A deploy that will move the checkout or sync the venv takes it exclusively **before**
`git checkout` (waiting up to 600 s, `HOST_TOOLING_LOCK_TIMEOUT`, then exit 9 with nothing
changed), so a running agent's source, venv and validator never change under it. Every host recipe
runs `uv run --frozen --no-sync`, so nothing rewrites `uv.lock` and nothing but that locked step
syncs the deploy checkout's venv (in a dev tree, run `uv sync` yourself).

`linguist-commit` redeploys akasha-frontend (and mouthpiece-frontend) when its own commits changed
their data, and also whenever the clone's HEAD differs in that data from the `data_sha` the frontend
was last deployed with. A hand wiki edit pushed to astra-data therefore goes live on the next run.
It deploys with `--skip-failed`: a redeploy that failed to build or come up (exit 7 or 10) at the
same code sha and astra-data HEAD is not rebuilt (exit 11). A real failure makes linguist-commit
exit non-zero, so its OnFailure alert pages once; the skips that follow do not page. A new code or
data commit, or a manual `just deploy <service>`, retries.

## Data root

All runtime data lives under one root, `/ruby/data/astra-state` (`config.kdl` `data.root`), never in
a code checkout. Each service has a flat dir directly under it (`scribe/`, `linguist/`,
`mouthpiece/`, `heartwood/`, `codex/`, `menhir/`, `audio/`, `postgres/`, `portal-oauth/`,
`node-exporter/`, `deploy/`, `locks/`), next to the `astra-data` clone. The full list is in the
comment on `config.kdl`'s `data` block; `deploy.sh` creates the dirs (`init_artifacts`, also
`just artifacts-init`). Config resolves every data path against the root, and the compose bind
mounts use the same absolute paths (identical on both sides where the code reads the path from
config). `ASTRA_DATA_ROOT` overrides the root for config, the justfile and the host scripts.
The developer tree's gitignored `artifacts/` holds only dev material (research notes, old logs).

The pipeline's published datasets (linguist transcripts, data and chronicle timeline, the mouthpiece
episode catalog, the akasha wiki and its snapshot, heartwood's run ledger, the entity registry) are
not in this repo. They live in the **astra-data** repo (`github.com/jbassin/astra-data`), whose live
clone is `/ruby/data/astra-state/astra-data` (`config.kdl` `data.content-root`). The Dagster services
write the linguist datasets into the clone through identical-path bind mounts; `linguist-commit` and
the heartwood recipes commit and push them there (seed files for a fresh clone: `deploy/astra-data/`).
akasha-frontend and mouthpiece-frontend bake the datasets at build time from the `astra-data` build
context: `deploy.sh` exports the clone's committed HEAD to a temp dir and passes it as
`ASTRA_DATA_CONTEXT`.

**First run only** — a fresh SigNoz needs a one-time org/admin before it ingests telemetry (until then
the collector logs `cannot create agent without orgId` and the OTLP receiver drops data):

```sh
curl -s -X POST http://localhost:10351/api/v1/register -H 'content-type: application/json' \
  -d '{"name":"admin","orgName":"astra","email":"admin@astra.local","password":"<12+ chars: upper/lower/number/symbol>"}'
docker compose restart otel-collector     # forces immediate OpAMP re-registration
```

## Ports and edge

Host ports live in the 10350 to 10399 band; the full host and port table is in
[`docs/architecture.md`](../docs/architecture.md). ClickHouse, zookeeper and the SigNoz
query-service are internal.

The substrate runs no Caddy of its own. The shared host proxy at `/ruby/data/reverse-proxy/` (a
custom caddy build with the Cloudflare DNS plugin) imports the deploy checkout's root
`sites.caddyfile`. That file carries no secret: the Cloudflare token is the `{$CF_API_TOKEN}`
placeholder, which the edge's systemd drop-in supplies at start and `just caddy-reload` supplies on a
reload (`just caddy-validate` dry-runs the merged config). Editor and admin routes are limited to
the local network with `import local_only`.

### Networks

The containers sit on least-privilege networks, so a compromised frontend cannot reach a
database, ClickHouse or the Dagster gRPC server. The `networks:` block at the end of
`docker-compose.yml` says who joins each one and why:

| Network | Members |
|---|---|
| `telemetry` | every Node app and the SigNoz collector (OTLP to `signoz-otel-collector:4318`) |
| `pipeline` | the Dagster code server, webserver and daemon, and the collector |
| `dagster-db` (internal) | dagster-postgres and the three Dagster services |
| `weal-db`, `orator-db` | each Postgres and its one app |
| `weal-feed` | weal-bot and weal-overlay (the roll feed) |
| `signoz-net` | SigNoz only: ClickHouse, zookeeper, the UI and the collector |

A new service gets `telemetry` from `*astra-app`. If it talks to another service or a store, it
lists every network it needs, because a YAML merge does not merge lists. Every subnet is
pinned: `signoz-net` to its live `172.27.0.0/16` (the collector scrapes node-exporter at
`172.27.0.1:9100`) and the astra networks to `10.27.N.0/24`.

Limits that remain:

- Any container with a gateway (every network except `dagster-db`) still reaches every
  host-published port through that gateway, until the ports are bound to `127.0.0.1`
  ([ADR 0040](../docs/adr/0040-accepted-risk-network-exposure.md)). That includes the Dagster
  UI and GraphQL API on 10350, which can launch and delete runs with no auth; the SigNoz UI on
  10351; the collector's OTLP ports 10352 and 10353; and the weal and orator Postgres ports
  10362 and 10364.
- A bridge network does not filter by port. The apps on `telemetry` reach each other's ports,
  which are published anyway, and the collector's unpublished pprof `:1777` and health
  `:13133`, as do the Dagster services on `pipeline`.
- A rollback to a commit from before the split leaves the `astra_*` networks behind, empty;
  remove them with `docker network rm`.
- The vendored SigNoz compose (`signoz/docker/docker-compose.yaml`) carries local edits: the
  remapped ports, the external URL, the collector's networks and the pinned subnets. Carry them
  forward when upgrading SigNoz.

## Secrets (SOPS + age)

Encrypted values live in `sops/secrets.enc.yaml`. The deploy and the timers read the private key from
sops's default location, `~/.config/sops/age/keys.txt`; the developer tree also keeps a copy at
`sops/age.key` (gitignored) for the other recipes. See `sops/README.md`. Decrypt with:

```sh
SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt sops -d sops/secrets.enc.yaml
```

## Telemetry smoke (prove the OTLP loop)

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:10353 \
  uv run --with opentelemetry-sdk --with opentelemetry-exporter-otlp-proto-http \
  python telemetry-smoke/py_span.py            # ts span: see telemetry-smoke/ts_span.ts header

docker exec signoz-clickhouse clickhouse-client -q \
  "SELECT serviceName, count() FROM signoz_traces.distributed_signoz_index_v3 \
   WHERE serviceName LIKE 'astra-smoke-%' GROUP BY serviceName"
```

## Backups

A nightly user timer (`astra-backup.timer`, 03:30, `just backup-install`) writes one snapshot to
the sda data disk at `/ruby/data/plex/data/astra-backups/<UTC timestamp>/` (`latest` points at the
newest). A failed run pages Discord through `astra-alert@` (Class C). Each snapshot holds:

- `postgres/` — `pg_dump -Fc` of the dagster, weal and orator databases, with per-table row counts
  taken in the same transaction snapshot as the dump;
- `signoz/rules/` — the live SigNoz alert rules (not the notification channel, which holds the
  webhook), a fallback copy of the committed `signoz/rules/`;
- `state/<dir>/` — every top-level dir of the data root, the `astra-data` clone included (so
  unpushed bot commits are kept), minus live PGDATA, node-exporter output, the re-fetchable
  codex data, scribe's derived output and scratch, and lock files; hardlinked against the
  previous snapshot so unchanged files cost nothing.

Retention: the newest snapshot of each of the last 14 days plus the newest of each of the last 8
ISO weeks. `just backup-now` takes a snapshot; `just backup-restore-test` restores every dump into a
throwaway `--network none` Postgres and checks row counts, then checksums a sample of the state
files still unchanged at the source. A dir where every file changed fails, except the volatile
`deploy` dir (`ASTRA_BACKUP_VOLATILE_STATE`), which every deploy rewrites: there every snapshot
file must read back in full, and the test logs a warning.
`astra-restore-test.timer` (Sunday 05:30, also installed by `just backup-install`) runs that test
weekly and pages through `astra-alert@` when it fails. A pass writes
`<backup root>/.restore-test-pass.json`. The watchdog pages when the newest snapshot is 36 h old or
more, when that stamp is 9 days old or missing, and when `astra-ontology-entity-seed --check`
finds the astra-data clone's `entity/entity.kdl` out of date with a fresh seed.
Manual restore steps are in the header of `systemd/astra-backup.sh`. The SOPS age key
(`sops/age.key`) is deliberately not in the backup; its second copy lives in the password manager.

## Alert rules

`signoz/rules/*.json` is the source of truth for the SigNoz alert rules, all routed to the
`discord-ops` channel. Change a rule here, merge, then `just signoz-rules-apply` (prints the
plan) and `just signoz-rules-apply --yes`; `just signoz-rules-check` compares read-only and the
watchdog pages on drift (details: `libs/py/ops/README.md`). The rules for certificate expiry,
container health, the Dagster daemon heartbeat and data freshness read the host metrics that
`astra-metrics.timer` writes into node-exporter's textfile dir every 2 minutes
(`just host-metrics`); "astra host metrics stale" fires when that file stops changing. The
paging rules read nothing from the browser RUM services (`*-rum`), whose telemetry arrives
through the public OTLP ingest ([ADR 0042](../docs/adr/0042-accepted-risk-open-otlp-ingest.md)).

## Host check

`just doctor` (`deploy/doctor.sh`) checks this host read-only and exits 1 on any failure: each
`mise.toml` pin against the binary on `PATH`, every compose bind-mount source, every unit an install
recipe links (a symlink into `/ruby/data/astra-deploy`, timers and path units enabled), lingering
and the SOPS age key, each edge certificate (fails under 14 days, warns under 28) and
`astra-expires: YYYY-MM-DD` markers in `sites.caddyfile` and the compose file. Mark any temporary
surface (a review host, a demo route) with such a comment so the doctor flags it once it is due.
`DOCTOR_SKIP=certs,binds` skips checks.

## Tear down

```sh
docker compose down       # stop; keep volumes (clickhouse/pg/signoz data persist)
just down-volumes         # also drop the SigNoz volumes (asks first; fresh onboarding next time)
```

## Traps

- Every host unit's script runs from the deploy checkout, so a script edit goes live with the next
  `just deploy` after the push; a changed `.service`, `.timer` or `.path` file needs its install
  recipe (`just alert-install`, `just backup-install`, ...) re-run.
- A command that holds the host-tooling lock must release it (`Lock.release()` in astra-ops,
  `exec 8>&-` in bash) before it calls `deploy.sh`, or the deploy waits on its own caller. Lock
  order: git-publish first, then host-tooling. Never wait for git-publish while holding
  host-tooling (linguist-commit holds git-publish while its deploy wants host-tooling); the
  heartwood commands drop host-tooling, take git-publish, then take host-tooling again. astra-ops
  takes the same flock(2) locks as `flock(1)`, so it and the bash scripts exclude each other.
- The data-publishing recipes (linguist-commit, `_astra-data-push`, mouthpiece-publish and -seed,
  akasha-seed, heartwood-agent, `_heartwood-push-deploy`, heartwood-revert) are thin wrappers over
  the astra-ops CLI (`libs/py/ops`). Each paid or live one asks first; `--yes` skips the question,
  and with no terminal and no `--yes` it exits 64. A unit that runs one must pass `--yes`
  (`linguist-commit.service` does; a test checks every unit), and after a deploy that changes such
  a unit line, re-run its install recipe, or systemd keeps running the old line and it exits 64.
  astra-ops holds the host-tooling lock shared only while it imports, so a deploy's `uv sync`
  never swaps packages under its imports; `uv run` itself and the console script still start
  before that lock (a tiny window, as with every other `uv run` from a unit).
- `OnFailure=` belongs in `[Unit]`. In `[Service]` systemd ignores it with only a log warning.
  Check with `systemctl --user show <unit> -p OnFailure`.
- `craig-sync` cannot be failed by pointing `CRAIG_DROP_DIR` at a missing directory: its nullglob
  turns that into "0 new" and exit 0. Test the alert chain with
  `systemd-run --user -p OnFailure=astra-alert@craig-sync.service.service /bin/false`.
- Test alerting without paging: `ALERT_DRY_RUN=1 deploy/systemd/alert-notify.sh watchdog`, with
  `XDG_STATE_HOME` pointed at a scratch dir so the live watchdog state is not disturbed.
- Never page on one sample of a racy state: the watchdog re-probes a bad reading
  (`WATCHDOG_CONFIRM_TRIES`) because timers report "not armed" while their service runs. Counter
  deltas (NIC CRC errors) are the exception and are read once per tick.
- In bash under `set -u`, `local a="$1" b="$DIR/$a"` fails: `local` expands every argument before
  assigning. Put the dependent assignment on its own line.
- A test container must not join `signoz-net`, `astra_telemetry` or `astra_pipeline` (every
  network the collector is on), or its deliberate ERROR logs page Discord.
- The first deploy after a network change must be the whole stack: a scoped `just deploy <svc>`
  recreates only that service, so the collector would not yet be on a new network.
- Docker creates a missing bind-mount source as root. `deploy.sh` (`just artifacts-init`) creates the
  data-root dirs as uid 1000 first; Postgres data dirs stay uid 70, mode 0700.
- `sudo` needs a password on this host. The user is in the `docker` group, so a throwaway root
  `alpine` container with a bind mount can fix ownership instead.
- The Claude Code sandbox has its own mount namespace: host FUSE mounts are invisible there. Check
  the Drive mount from a real shell.
- A fresh SigNoz shows few logs because astra logs are sparse; prove ingest with traces.
