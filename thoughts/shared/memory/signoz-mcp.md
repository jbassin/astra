---
name: signoz-mcp
description: working SigNoz MCP server (signoz_* tools) — prefer it for ALL astra observability queries (traces/metrics/logs/services/dashboards)
metadata:
  type: reference
---

A **SigNoz MCP server** is configured and **verified working** against the astra SigNoz (the Phase 0
deploy substrate from [[astra-migration-research]]). **Prefer its `signoz_*` tools over hand-rolled
`curl`/`clickhouse-client`** for any observability question.

- **Config:** `~/.claude.json` → `mcpServers.signoz` → `/usr/local/bin/signoz-mcp-server` (stdio), env
  `SIGNOZ_URL=http://saffron:10351` (`saffron` = this host; the published astra SigNoz), `SIGNOZ_API_KEY`,
  `LOG_LEVEL`. `claude mcp list` shows it `✔ Connected`.
- **Server:** `SigNozMCP v0.5.1`, **31 `signoz_*` tools** — e.g. `signoz_list_services`,
  `signoz_aggregate_traces`, `signoz_aggregate_logs`, `signoz_get_trace_details`,
  `signoz_execute_builder_query`, `signoz_get_field_keys`/`_values`, `signoz_list_metrics`,
  `signoz_list/get/create/delete_dashboard|alert|view|notification_channel`,
  `signoz_get_service_top_operations`.

**How to apply:** to check whether a service emits traces, count spans/errors/latency, search logs, or
read metrics for astra, call the `signoz_*` MCP tools (resource-attribute filters like `service.name`
are fastest). Verified end-to-end 2026-06-19: `signoz_list_services` returned the Phase 0 smoke services
`astra-smoke-py` (1 call) + `astra-smoke-ts` (2 calls) with the `phase0-smoke-span` op. The API key
authenticates against the org and survives `docker compose down`; a `down -v` wipes the org → re-register
+ re-issue a key (see astra `deploy/README.md`). If the `signoz_*` tools aren't in a given session's
toolset, they load in a fresh Claude Code session — the server itself is fine.
