# deploy/ — astra runtime substrate

One compose file runs the whole substrate (roadmap Decision H): **Dagster** (pipeline control plane)
+ **SigNoz** (observability — the single pane) + the services. The edge is the shared host Caddy. SigNoz
is vendored under `signoz/` (pinned **v0.129.0** / otel-collector **v0.144.5**) and `include`d into the
top-level compose; its published ports are remapped into the astra **10350–10399** range.

## Deploy

```sh
just deploy                    # whole stack at origin/main
just deploy akasha-frontend    # one service
just deploy --sha <rev>        # a pushed older commit (rollback)
just deploy --dry-run          # checks only; prints the compose command
```

`just deploy` (`deploy.sh`; `just up` is an alias) builds only from the deploy checkout
`/ruby/data/astra-deploy` at a **pushed** commit, never from a developer tree, so push first. It takes a
deploy lock, decrypts the SOPS secrets on the host and passes them as env, and labels every built
image with the commit (`org.opencontainers.image.revision`). History and the per-service live sha are
under `/ruby/data/astra-state/deploy/`; the header of `deploy.sh` has the details. Do not run a bare
`docker compose up`: it starts every service with empty secrets.

Every host unit (craig-sync, linguist-commit, heartwood-request, the watchdog, alerting and
backup) runs from the deploy checkout too; the install recipes `systemctl --user link` the unit
files from it. After each checkout `deploy.sh` brings that checkout's host tooling up to date for
them (`uv sync --frozen`, and `pnpm install --frozen-lockfile --filter @astra/vellum-lang` for
heartwood's validator); both are no-ops when nothing changed. `deploy.sh --host-tooling` runs just
that step.

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
- `signoz/rules/` — the SigNoz alert rules (not the notification channel, which holds the webhook);
  the same files are committed in `signoz/rules/` (refresh with `just signoz-rules-export`);
- `state/<dir>/` — every top-level dir of the data root, the `astra-data` clone included (so
  unpushed bot commits are kept), minus live PGDATA, node-exporter output, the re-fetchable
  codex data, scribe's derived output and scratch, and lock files; hardlinked against the
  previous snapshot so unchanged files cost nothing.

Retention: the newest snapshot of each of the last 14 days plus the newest of each of the last 8
ISO weeks. `just backup-now` takes a snapshot; `just backup-restore-test` restores every dump into a
throwaway `--network none` Postgres and checks row counts, then checksums a sample of state files.
Manual restore steps are in the header of `systemd/astra-backup.sh`. The SOPS age key
(`sops/age.key`) is deliberately not in the backup; its second copy lives in the password manager.

## Tear down

```sh
docker compose down       # stop; keep volumes (clickhouse/pg/signoz data persist)
just down-volumes         # also drop the SigNoz volumes (asks first; fresh onboarding next time)
```

## Traps

- Every host unit's script runs from the deploy checkout, so a script edit goes live with the next
  `just deploy` after the push; a changed `.service`, `.timer` or `.path` file needs its install
  recipe (`just alert-install`, `just backup-install`, ...) re-run.
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
- A test container must not join `signoz-net`, or its deliberate ERROR logs page Discord.
- Docker creates a missing bind-mount source as root. `deploy.sh` (`just artifacts-init`) creates the
  data-root dirs as uid 1000 first; Postgres data dirs stay uid 70, mode 0700.
- `sudo` needs a password on this host. The user is in the `docker` group, so a throwaway root
  `alpine` container with a bind mount can fix ownership instead.
- The Claude Code sandbox has its own mount namespace: host FUSE mounts are invisible there. Check
  the Drive mount from a real shell.
- A fresh SigNoz shows few logs because astra logs are sparse; prove ingest with traces.
