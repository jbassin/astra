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

## Ports (astra range 10350–10399)

| Host | Service | Container |
|------|---------|-----------|
| 10350 | Dagster UI | dagster-webserver:3000 |
| 10351 | SigNoz UI | signoz:8080 |
| 10352 | OTLP gRPC | otel-collector:4317 |
| 10353 | OTLP HTTP | otel-collector:4318 |
| 10360 | strider SSR | strider:10360 |

ClickHouse, zookeeper, Dagster Postgres, and the query-service are **internal** (unpublished).

## strider — the SSR frontend template (Decision I)

`strider` is the first frontend and the **canonical SSR-Compose-behind-Caddy template** that
`0011`–`0013` (akasha-fe / mouthpiece-fe / vellum-fe) copy. It is **not** prerendered static `dist/`
served by `file_server` (the old Decision D model); it is a long-running SSR service:

- **Image** (`apps/strider/Dockerfile`, build context = repo root): the build stage `pnpm install`s the
  workspace and `pnpm run build`s the TanStack Start app on Node 24 + pnpm (0022 S11 — was a Bun build
  stage through S10); the runtime stage ships `dist/` + `content/` + `server.ts` on Node 24 and invokes
  `node --import .../nodeTsResolve.mjs server.ts` directly — one SSR process, no package-manager story
  at runtime (D13).
- **`server.ts`**: `dist/server/server.js` is a bare Web-`fetch` handler, so this entry serves the hashed
  client bundle from `dist/client/`, handles the editor save API (`POST /write-layer` → `content/layers`),
  and falls through to SSR for everything else — a self-contained unit.
- **Edge**: the substrate runs **no Caddy of its own** — the production edge is the shared host reverse
  proxy at `/ruby/data/reverse-proxy/` (custom caddy binary w/ the cloudflare-dns plugin), which `import`s
  this repo's root **`sites.caddyfile`** (`strider.iridi.cc` → `reverse_proxy localhost:10360`, NOT static
  `file_server` — Decision I). That file carries no secret: the Cloudflare ACME-DNS token is the
  `{$CF_API_TOKEN}` adapt-time placeholder, supplied from SOPS by **`just caddy-reload`** (`just
  caddy-validate` to dry-run). The editor (`/editor` + `POST /write-layer`) is gated to the local network
  there (`import local_only`). For local dev, hit services on their published ports
  directly (no edge needed).

The new frontend chunks build per-route; pixi stays in a client-only chunk (`<ClientOnly>` + `lazy`), so
SSR never touches WebGL.

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
