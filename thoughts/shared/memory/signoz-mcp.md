---
name: signoz-mcp
description: use the signoz_* MCP tools for all astra observability queries (traces, metrics, logs, alerts), not curl or clickhouse-client
metadata:
  type: reference
---

A SigNoz MCP server (`~/.claude.json` → `mcpServers.signoz`, `SIGNOZ_URL=http://saffron:10351`)
exposes `signoz_*` tools against the live astra SigNoz. Prefer them over hand-rolled `curl` or
`clickhouse-client`.

**How to apply:** filter by a resource attribute such as `service.name` (fastest). Custom span
attributes are found by filtering on them; a raw trace search omits them. Metrics lag 1 to 3
minutes, and the metric catalog lags the data, so query the metric directly before calling it
broken. If the tools are missing from a session, they load in a fresh one. A SigNoz `down -v`
wipes the org: re-register and re-issue the API key (`deploy/README.md`).
