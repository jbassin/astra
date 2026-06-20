---
name: deploy-apply-with-just
description: after a deploy-affecting change in astra (compose / Dockerfile / server.ts / baked config.kdl / sites.caddyfile), run `just up` + `just caddy-reload` — local edits aren't live until then
metadata:
  type: feedback
---

In astra, source/config edits do NOT reach the running stack on their own. After any
deploy-affecting change, apply it (and verify):

- **`just up`** = `docker compose up -d --build` (run from repo root): rebuilds the affected
  image (strider / dagster) and recreates the container. Needed for app code, `server.ts`,
  the Dockerfile, the compose file, AND **`config.kdl`** — it's baked into the strider image
  via the runtime `COPY ontology/ontology-config`, so a config change isn't live until a
  rebuild. When a compose service is deleted, also drop its orphaned container
  (`docker rm -f <name>` — `up` doesn't `--remove-orphans`).
- **`just caddy-reload`** applies the root `sites.caddyfile` to the shared host edge
  (`/ruby/data/reverse-proxy`) — the CF token comes from SOPS, validated first. A brand-new
  subdomain needs a moment for its ACME cert before it serves.

**Why:** plain `docker compose up -d` reused a stale image once and silently shipped old code
(that's why `up` carries `--build`); and the host edge only picks up `sites.caddyfile` on
reload. **How to apply:** treat "I changed deploy/edge" as "not done until `just up` /
`just caddy-reload` + a verify curl" (container `healthy`; curl via the edge with
`--resolve <host>.iridi.cc:2651:127.0.0.1`). config.kdl is the baked source — [[config-single-source]].
