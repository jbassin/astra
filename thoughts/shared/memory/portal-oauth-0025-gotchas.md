---
name: portal-oauth-0025-gotchas
description: portal-oauth (0025) — OAuth 2.1 AS on portal for claude.ai custom connectors; COMPLETE — all acceptance A–H met incl. the real claude.ai connect (2026-07-08T01:03Z); the load-bearing gotchas
metadata:
  type: project
---

**portal-oauth (0025) — BUILT + DEPLOYED + LIVE-VERIFIED 2026-07-07** (S1 `b6de520` · S2 `fa988ff` ·
S3 deploy; spec `thoughts/astra/specs/0025-portal-oauth-spec.md`, scope
`…/research/2026-07-07-portal-oauth-0025-thoughts.md`). claude.ai custom connectors support ONLY
OAuth 2.1 (no static bearer — the `static_headers` beta wasn't on the account), so portal-server now
runs a **single-user OAuth 2.1 authorization server**: the SDK's own `mcpAuthRouter` toolkit (D-5)
+ a `PortalOAuthProvider` (DCR with a claude.ai+loopback redirect **allowlist**, consent page keyed
on the existing `portal_mcp_api_key`, **opaque sha256-hashed tokens** — zero new SOPS keys, 1h
access TTL, rotate-on-refresh) + a JSON state file on the new `artifacts/portal-oauth` bind mount
(connections **survive redeploys** — live-proven across `docker restart`). `/mcp` is dual-auth
(legacy key OR OAuth token; Claude Code config untouched); every 401 carries `WWW-Authenticate:
Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"` (the claude.ai discovery
path). Full curl flow verified through the public edge: 401-header → DCR → consent → PKCE token →
tool call → rotation → old-refresh `invalid_grant`. **Acceptance F CLOSED 2026-07-08T01:03Z: the
stakeholder connected claude.ai for real** (Add custom connector → `https://portal.iridi.cc/mcp`,
no client ID/secret → consent with the portal key) — claude.ai's own DCR client registered →
consent-ok → token-issued in the audit trail, tool calls work from chats. **0025 COMPLETE, all
A–H.**

**⭐ Load-bearing gotchas (found by building/running):**

- **The SDK's `registerClient` receives `client_id` ALREADY STAMPED** — `register.js` (default
  `clientIdGeneration: true`) generates `client_id`/`client_id_issued_at` BEFORE calling the store;
  the `Omit<…, "client_id">` param type is the SDK's own loose contract, not what arrives. Reuse
  what's there (regenerating would break the flow — the router returns ITS copy to the client).
- **The SDK auth toolkit is Express-only, but the transport isn't** — an Express app is a plain
  `(req,res)` function, so it mounts from a raw-node dispatch arm with zero framework migration.
  `express@^5.2.1` is the SDK's OWN runtime dep (just declare it; pnpm strict).
- **`provider.authorize()` may render HTML instead of redirecting** — the "must eventually
  redirect" contract is satisfied by the later astra-owned `POST /consent` 302. Two-request
  consent works fine with claude.ai's flow.
- **`getOAuthProtectedResourceMetadataUrl(new URL(origin + "/mcp"))` →
  `/.well-known/oauth-protected-resource/mcp`** (path-suffixed PRM) — always derive the 401
  header URL with the helper, never hand-build; it must match what `mcpAuthRouter` mounts.
  Issuer serializes with a trailing slash (`https://portal.iridi.cc/`) — harmless, but tests
  comparing `authorization_servers[0]` must expect it.
- **Accepted risk (recorded):** `POST /consent` sits OUTSIDE the SDK's rate-limited routes —
  consent-key brute force is impractical (high-entropy SOPS secret over TLS) but revisit if the
  key policy changes.
- Codes burn BEFORE ownership checks (never exchangeable twice); refresh rotation deletes the old
  hash before issuing; corrupt state file → renamed `.corrupt-<ts>` + ERROR + start empty
  (re-consent, not breakage).
- **`docker restart astra-portal` preserves the SOPS env** (it's baked into the container) — safe
  for a quick bounce; a RECREATE still needs `just up` ([[mouthpiece-two-host-gotchas]] trap).
- Hygiene hard rule held: no token/key/code material in any log body, span attribute, or error
  message (audit logs carry `client_id` + `portal.oauth.event` only).

**Tab-free operation assessed + DECLINED (2026-07-07, stakeholder):** the only viable shape for a
no-GM-tab portal is a supervised headless-Chromium GM session as a Compose unit (dedicated GM
account + `FOUNDRY_WORLD` auto-launch + login/rejoin supervisor + a module "bridge user" setting so
two GM sessions don't oscillate over replace-adopt; ~200–400 MB idle RAM). Server-side Foundry
integration is a dead end (no API, LevelDB process-locked while running, socket.io client
reimplementation version-fragile). Don't re-scope unprompted.

Builds on [[portal-0023-gotchas]] + [[deploy-artifacts-run-as-user]] + [[config-single-source]] +
[[telemetry-coverage-pass]] + [[flag-paid-live-actions]].
