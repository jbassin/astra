# deploy/ — astra runtime substrate

One `docker compose up` brings up the whole substrate (roadmap Decision H): **Dagster** (pipeline
control plane) + **SigNoz** (observability — the single pane) + **Caddy** (edge). SigNoz is vendored
under `signoz/` (pinned **v0.129.0** / otel-collector **v0.144.5**) and `include`d into the top-level
compose; its published ports are remapped into the astra **10350–10399** range.

## Bring up

```sh
cd deploy
docker compose up -d        # builds the Dagster + strider images; pulls SigNoz / Postgres
```

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

- **Image** (`apps/strider/Dockerfile`, build context = repo root): a Bun image that `bun install`s the
  workspace, `bun run build`s the TanStack Start app, and ships `dist/` + `content/` + `server.ts`. `bun
  run start` is the only command — one SSR process.
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

Encrypted values live in `sops/secrets.enc.yaml`; the private key is `sops/age.key` (gitignored). See
`sops/README.md`. Decrypt with:

```sh
SOPS_AGE_KEY_FILE=$PWD/sops/age.key sops -d sops/secrets.enc.yaml
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

## Tear down

```sh
docker compose down       # stop; keep volumes (clickhouse/pg/signoz data persist)
docker compose down -v    # also drop volumes (fresh SigNoz onboarding next time)
```
