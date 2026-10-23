---
date: 2026-07-07
subsystem: portal-oauth
number: "0025"
status: SCOPED — decisions resolved, ready to spec
---

# portal-oauth (0025) — OAuth 2.1 on portal so claude.ai custom connectors can connect

## 0. Purpose & verdict

**Goal:** connect the portal MCP (0023, COMPLETE + LIVE at `portal.iridi.cc`) to **claude.ai** as a
custom connector. Claude Code already works (static bearer via `--header`); claude.ai does **not**
support static bearer auth for custom connectors — the stakeholder's Add-connector dialog was
checked live 2026-07-07 and has **only URL + OAuth Client ID/Secret fields** (the beta
`static_headers` rollout has not reached his account; if it ever does, this whole subsystem becomes
optional — recorded as the zero-code alternative, §10).

**Verdict: GREEN, small subsystem.** The pinned MCP SDK (`@modelcontextprotocol/sdk@1.29.0`,
already portal-server's dependency) ships a complete Express-based OAuth 2.1 authorization-server
toolkit — endpoints, PKCE, DCR, refresh grant, discovery metadata, bearer middleware. The mandatory
custom pieces are ONLY: an `OAuthServerProvider` implementation, a clients store, a single-user
consent page, and a persistence file. No new subdomain, no Caddy change, no Python-lane code
(config schema mirror only).

## 1. What claude.ai requires (verified against Anthropic's connector docs, 2026-07-07)

From `https://claude.com/docs/connectors/building/authentication` +
`…/connectors/custom/remote-mcp` (fetched this session):

- **Auth types:** `oauth_dcr` (RFC 7591 DCR) and `oauth_cimd` are supported out of the box;
  `static_headers` is beta/gradual-rollout (NOT on the stakeholder's account); machine-to-machine
  `client_credentials` is NOT supported — every connection requires user consent.
- **Flow:** OAuth 2.1 authorization-code. Claude ALWAYS sends PKCE `code_challenge_method=S256`;
  the AS metadata MUST advertise `"code_challenge_methods_supported": ["S256"]`.
- **Discovery:** on a 401 from `/mcp`, Claude reads `WWW-Authenticate: Bearer
  resource_metadata="…"` (the reliable path; it also probes
  `/.well-known/oauth-protected-resource[/<mcp-path>]` as fallback). The protected-resource
  metadata's `resource` must equal the connector URL **exactly as entered**
  (`https://portal.iridi.cc/mcp`), and `authorization_servers[0]` names our issuer. The issuer must
  serve RFC 8414 metadata at its own `/.well-known/` path.
- **Registration:** claude.ai registers via DCR as a **public client** (it may register a fresh
  client per connection — a known client-accumulation property of DCR; fine at our scale).
- **Redirect URIs:** hosted surfaces use `https://claude.ai/api/mcp/auth_callback`; Claude Code
  (if ever pointed at OAuth) uses RFC 8252 loopback (`http://localhost/callback` +
  `http://127.0.0.1/callback`, **port-agnostic match required**). The SDK's `redirectUriMatches`
  handles the loopback port rule.
- **Tokens:** `/token` must accept `application/x-www-form-urlencoded` (SDK handler does);
  refresh is reactive-on-401 + proactive ≤5 min before expiry; **rotate refresh tokens** for
  public clients (OAuth 2.1/MCP-spec requirement) and return RFC 6749 `invalid_grant` when a
  refresh token is dead. Claude appends `offline_access` to its scope request when the AS
  metadata's `scopes_supported` lists it — advertise it to get refresh-token behavior.
- **Latency:** discovery/registration/token endpoints must answer well under **10s** (30s for
  refresh). All ours are local map/file lookups — non-issue.
- **Egress:** Anthropic calls from `160.79.104.0/21`; portal is on the public edge — no
  allowlisting needed.

## 2. What the SDK ships (verified in the installed 1.29.0 copy)

Real path: `node_modules/.pnpm/@modelcontextprotocol+sdk@1.29.0_zod@4.4.3/…`; deep imports work
via the package's `./*` exports wildcard (e.g. `@modelcontextprotocol/sdk/server/auth/router.js`).

- **`mcpAuthRouter(options)`** (`dist/esm/server/auth/router.js`) mounts: `/authorize`, `/token`,
  `/register` (only if the clients store implements `registerClient`), `/revoke` (only if the
  provider implements `revokeToken`), `/.well-known/oauth-authorization-server`, and
  `/.well-known/oauth-protected-resource[/<rsPath>]` (pass `resourceServerUrl` =
  `https://portal.iridi.cc/mcp`). Rate-limiting (express-rate-limit) on by default.
- **`OAuthServerProvider`** (`…/auth/provider.js`) — what we implement: `clientsStore` getter,
  `authorize(client, params, res)` (must end in a redirect carrying `code`/`error`),
  `challengeForAuthorizationCode`, `exchangeAuthorizationCode`, `exchangeRefreshToken`,
  `verifyAccessToken`, optional `revokeToken`. `AuthorizationParams` carries
  `{state?, scopes?, codeChallenge, redirectUri, resource?}`.
- **PKCE** verified locally by the token handler (`pkce-challenge`'s `verifyChallenge`) against
  our stored `codeChallenge` — we never implement the crypto.
- **`requireBearerAuth`** exists but is Express middleware; portal's `/mcp` stays on the existing
  raw-node handler — we call `verifyAccessToken` directly there (§4.3).
- **`OAuthRegisteredClientsStore`** (`…/auth/clients.js`): `getClient(clientId)` +
  optional `registerClient(client)`. **No production store is shipped** (the in-memory one is a
  DEMO-ONLY example: `dist/esm/examples/server/demoInMemoryOAuthProvider.js` — cribbable shape).
- ⚠ **Framework constraint:** every auth handler/router is Express (`express@^5.2.1` +
  `express-rate-limit` are the SDK's OWN runtime deps — already in the store; portal-server must
  simply declare `express` to import it under pnpm's strict layout). The MCP transport itself
  stays raw-node — unchanged.

## 3. Portal's current surface (verified file:line)

- **Raw `node:http`, no framework** — `apps/portal/server/src/server.ts:13`, hand-rolled
  `if`/pathname dispatch at `server.ts:63-84` (`/health`, `/mcp`, `/module/*`, 404 fallthrough);
  `/ws` is a separate upgrade hook (`bridge.ts:140-146`, claims only `pathname === "/ws"`).
- **The single bearer choke point:** `mcp.ts:313-321` — constant-compare against
  `cfg.portal.mcpApiKey`, 401 `{"error":"unauthorized"}` (no `WWW-Authenticate` today), counter
  `astra.portal.mcp.auth_rejections` + WARN log. Everything downstream is auth-agnostic.
- **Transport stateless:** fresh `McpServer` + `StreamableHTTPServerTransport({sessionIdGenerator:
  undefined})` per request (`mcp.ts:323-331`).
- **Config:** `portal {}` in `ontology/ontology-config/config.kdl:255-273`; Zod
  `libs/ts/config/src/config.ts:225-236` + Pydantic `libs/py/config/src/astra_config/models.py:203-215`
  (both `.strict()` — every new field lands in BOTH). Secrets resolve env-first
  (`secrets.ts:60-61`, `sops:x` → env `X` upper-cased), injected by `just up`
  (`justfile:55-58`) via the compose `environment:` list (`deploy/docker-compose.yml:532-534`).
- **`cfg.portal.publicOrigin`** (`https://portal.iridi.cc`) is already threaded into the server —
  the natural OAuth issuer + metadata base.
- **Caddy:** `sites.caddyfile:193-210` — the final catch-all `handle` proxies everything to
  :10372, so `/.well-known/*`, `/authorize`, `/token`, `/register` route with **zero Caddy
  change**; they must NOT join the `@sse` matcher (plain request/response).
- **Runtime:** no build step — `node --import …/nodeTsResolve.mjs src/index.ts` (strip-types: no
  parameter properties/enums in new code). Dockerfile copies `src/` wholesale
  (`apps/portal/Dockerfile:70`) → new source files need no Dockerfile edit; a new npm dep only
  needs the lockfile regenerated (`--frozen-lockfile` at `:39`).
- **Deploy:** compose service `docker-compose.yml:521-543`, `user: "1000:1000"`, **no volume
  today** — persistence (§4.5) adds the first one.
- **Tests:** `mcp.test.ts:89-106` pin the 401s; the harness injects config via `listen({port: 0,
  …})` with no SOPS — exactly the seam OAuth-flow tests reuse.
- **Telemetry idiom:** `initTelemetry` first (`index.ts:9,14`); `lazyCounter` ONLY (never
  module-scope `createCounter` — [[telemetry-coverage-pass]]); span + audit-log patterns at
  `mcp.ts:102-138` and `mcp.ts:53-59`.

## 4. Architecture (what gets built)

New module `apps/portal/server/src/oauth.ts` (+ `consent.ts` if the page warrants its own file),
wired into the existing dispatch.

### 4.1 Mount seam — Express sub-app delegated from the raw dispatch

An Express app is itself a `(req, res)` handler. Build `const authApp = express()` +
`authApp.use(mcpAuthRouter({provider, issuerUrl: publicOrigin, resourceServerUrl:
publicOrigin + "/mcp", scopesSupported: […, "offline_access"]}))`, and in `server.ts`'s dispatch
add ONE arm before the 404: pathnames starting with `/.well-known/`, `/authorize`, `/token`,
`/register`, `/revoke` → `authApp(req, res)`. `/mcp`, `/module/*`, `/health`, `/ws` stay exactly
as they are. Portal does NOT become an Express app.

### 4.2 Provider + stores (the custom code)

Single-user `PortalOAuthProvider`:

- **Clients store:** Map-backed, `registerClient` enabled (DCR). **Registration policy (D-4):
  redirect URIs allowlisted** to `https://claude.ai/api/mcp/auth_callback` + RFC 8252 loopback
  (`http://localhost/…`, `http://127.0.0.1/…`, port ignored — reuse the SDK's
  `redirectUriMatches` semantics); anything else → registration rejected.
- **`authorize`:** render the consent page (§4.4). On approved consent: mint a single-use
  authorization code (random 256-bit, 10-min TTL) recording `{clientId, codeChallenge,
  redirectUri, scopes}`, redirect back with `code` + `state`.
- **`exchangeAuthorizationCode`:** SDK has already PKCE-verified; issue tokens (§4.3), burn the
  code.
- **`exchangeRefreshToken`:** **rotate** — new access + new refresh in one response, old refresh
  invalidated (claude.ai requirement §1); a dead/unknown refresh → `invalid_grant`.
- **`verifyAccessToken`:** lookup by token hash → `AuthInfo {token, clientId, scopes, expiresAt}`.
- **Tokens are opaque random 256-bit strings, stored HASHED (sha256)** in the state file — no JWT,
  no signing keys, nothing new in SOPS. Access TTL ~1h; refresh long-lived-until-rotated.
  Revocation (`revokeToken`) is a cheap map-delete — implement it (the router then serves
  `/revoke` for free).

### 4.3 `/mcp` dual auth (D-3)

`mcp.ts` bearer check becomes: exact match against `mcpApiKey` (legacy — Claude Code config
untouched) **OR** `verifyAccessToken` success (hash lookup, unexpired). The 401 gains the
discovery header (required for claude.ai to find us at all):
`WWW-Authenticate: Bearer resource_metadata="https://portal.iridi.cc/.well-known/oauth-protected-resource/mcp"`
(match the exact PRM path `mcpAuthRouter` mounts for the given `resourceServerUrl`). The Foundry
module's WS hop (`bridge_api_key`) is untouched.

### 4.4 Consent page (D-1)

`authorize` (GET) renders a minimal self-contained HTML form: client name + requested scopes +
redirect host, one password field. POST back → constant-time compare against
**`portal_mcp_api_key`** (stakeholder decision — the credential that already grants `/mcp`; no
new SOPS key) → issue the code. Wrong key → re-render with error (+ counter). Per the MCP spec's
loopback-impersonation note, the page displays the redirect URI host prominently. CSRF: the form
round-trips the signed/opaque pending-authorization id; no cookies needed.

### 4.5 Persistence (D-2)

One JSON state file `{clients, tokens, refreshTokens, codes}` (tokens hashed), loaded at boot,
atomic-written on change (`.tmp` + rename — the scribe idiom). Location: a new bind mount
`./artifacts/portal-oauth:/data/oauth` (compose + `just artifacts-init` mkdir, the
[[deploy-artifacts-run-as-user]] pattern; container writes land 1000:1000). New config field
`portal.oauth-state-path` default `/data/oauth/state.json` — mirrored in BOTH schemas (kdl +
Zod + Pydantic; `.strict()` on both). No new SOPS keys anywhere in this subsystem.

### 4.6 Telemetry

`lazyCounter`s: `astra.portal.oauth.authorizations{outcome}`, `…oauth.tokens_issued{grant}`,
`…oauth.rejections{reason}`; spans `portal.oauth.{authorize,token,register}`; greppable
audit-style INFO logs mirroring `portal.audit.*` (attribute `portal.oauth.event`), NEVER logging
token/key material.

## 5. Decisions resolved (stakeholder, 2026-07-07 — AskUserQuestion)

| # | Decision | Resolution |
|---|---|---|
| D-1 | Consent credential | **Reuse `portal_mcp_api_key`** as the consent password; no new SOPS secret. |
| D-2 | Client/token persistence | **Persist** to a bind-mounted JSON state file (artifacts pattern) so claude.ai connections survive `just up` redeploys. |
| D-3 | `/mcp` auth posture | **Dual**: static bearer (legacy, Claude Code untouched) OR OAuth access token. |
| D-4 | DCR redirect policy | **Allowlist** `https://claude.ai/api/mcp/auth_callback` + RFC 8252 loopback (port-agnostic); reject others at registration. |

Scoping-level calls (mine, flag-at-spec): opaque hashed tokens over JWT (zero new secrets, trivial
revocation — the deploy is single-instance so shared-nothing verification isn't needed); Express
sub-app over hand-rolling the endpoints (the SDK's audited handlers; express is already the SDK's
own dep); implement `revokeToken` (near-free); access TTL 1h / rotate-on-refresh.

## 6. Slice sketch (for the spec)

- **S1** — `express` dep (lockfile), `oauth.ts` provider + stores + persistence, `mcpAuthRouter`
  mounted via the dispatch arm; config field + both schema mirrors; unit tests (register →
  authorize → PKCE token → verify; rotation; invalid_grant; allowlist reject). Foundry-free.
- **S2** — consent page + dual-auth `/mcp` + the 401 `WWW-Authenticate` header; extend
  `mcp.test.ts` 401 shape test; full-flow integration test through a real HTTP server.
- **S3** — deploy: compose volume + env (none new) + `just artifacts-init`; live acceptance =
  add the connector in claude.ai (URL `https://portal.iridi.cc/mcp`, no client ID/secret),
  consent with the portal key, tool call round-trip from a claude.ai chat (world launched);
  verify refresh survives a `just up`; memory + docs.

## 7. Risks

- **claude.ai discovery specifics drift** (beta-era surface; docs fetched 2026-07-07). Mitigation:
  the 401 `resource_metadata` header is the documented reliable path; acceptance is a real
  claude.ai connect, not a simulation.
- **SDK auth router assumptions** (Express 5 handler shapes under strip-types runtime). Mitigation:
  express is plain JS at runtime; S1's integration test exercises the real router end-to-end.
- **Consent page is a new public HTML surface on a write-capable server.** Mitigations: D-4
  allowlist, constant-time key compare, rate-limited by the router's defaults, single-use codes,
  10-min code TTL, no cookies/sessions.
- **State-file loss** = claude.ai must reconnect (annoyance, not breakage); the file is on the
  host bind mount, backed up with the rest of `/artifacts`.
- **`static_headers` beta reaching the account later** makes this subsystem optional-in-hindsight —
  acceptable; OAuth is still the "right" long-term posture per the docs (per-user consent).

## 8. Next steps

1. `octo:spec` → `thoughts/astra/specs/0025-portal-oauth-spec.md` (encode §4–§6 + acceptance).
2. Implement via `octo:embrace`, slice by slice (S1–S2 Foundry-free; S3's acceptance needs the
   world launched for the end-to-end tool call, same liveness constraint as 0023).

Sources verified this session: Anthropic connector auth docs (`claude.com/docs/connectors/building/authentication`,
`…/connectors/custom/remote-mcp`), the installed SDK 1.29.0 auth module inventory, and the portal
server/config/deploy source (file:line cites in §3). Builds on [[portal-0023-gotchas]] +
[[config-single-source]] + [[deploy-artifacts-run-as-user]] + [[telemetry-built-in]].
