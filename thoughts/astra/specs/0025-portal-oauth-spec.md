# NLSpec 0025 — portal-oauth: OAuth 2.1 on portal for claude.ai custom connectors

**Status:** SPEC — ready to implement (3 slices S1–S3).
**Scope doc:** `thoughts/shared/research/2026-07-07-portal-oauth-0025-thoughts.md` (all claims
  verified 2026-07-07: Anthropic connector docs fetched live; the installed SDK 1.29.0 auth module
  inventoried file-by-file; portal server/config/deploy mapped file:line; the stakeholder's
  claude.ai UI checked — no `static_headers` beta, OAuth is required).
**Date:** 2026-07-07 · **Subsystem slug:** `portal-oauth` · **Phase:** follow-on to 0023 (COMPLETE).
**Process:** octo:spec → octo:embrace, per astra `CLAUDE.md`.
**Honors memory:** [[verify-before-acting]], [[no-silent-scope-cuts]],
  [[resolve-open-questions-before-next-stage]], [[no-ci-monitoring]], [[deploy-apply-with-just]],
  [[deploy-artifacts-run-as-user]], [[config-single-source]], [[telemetry-built-in]],
  [[telemetry-coverage-pass]], [[portal-0023-gotchas]], [[flag-paid-live-actions]].

## Goal

The portal MCP (0023) is live and Claude-Code-connected via a static bearer key. claude.ai custom
connectors support **only OAuth 2.1** (authorization-code + PKCE S256, DCR, discovery metadata).
Add a **single-user OAuth 2.1 authorization-server layer to portal-server itself** so the
stakeholder can add `https://portal.iridi.cc/mcp` as a claude.ai custom connector, consent once
with the portal key, and use the 10 portal tools from claude.ai chats — with the connection
**surviving `just up` redeploys**, and the existing static-bearer path (Claude Code, already
configured) untouched.

## Decisions in force

D-1…D-4 are stakeholder-resolved (scope doc §5, AskUserQuestion 2026-07-07); D-5…D-10 are
spec-level technical decisions.

| # | Decision | Resolution |
|---|---|---|
| D-1 | Consent credential | **Reuse `portal_mcp_api_key`** as the consent-page password (constant-time compare). No new SOPS secrets anywhere in 0025. |
| D-2 | Persistence | **One JSON state file on a new bind mount** `./artifacts/portal-oauth:/data/oauth` ([[deploy-artifacts-run-as-user]] pattern) — registered clients + hashed tokens survive restarts/redeploys. Auth codes are in-memory only (10-min TTL). |
| D-3 | `/mcp` auth posture | **Dual**: exact match against `mcpApiKey` (legacy, Claude Code untouched) OR a valid unexpired OAuth access token. The Foundry module's WS hop (`bridge_api_key`) is untouched. |
| D-4 | DCR redirect policy | **Allowlist**: `https://claude.ai/api/mcp/auth_callback` + RFC 8252 loopback (`http://localhost/…`, `http://127.0.0.1/…`, **port-agnostic**). Registration with any other redirect URI → rejected. |
| D-5 | Implementation base | **The SDK's own auth toolkit** (`mcpAuthRouter` + handlers from `@modelcontextprotocol/sdk@1.29.0` — already portal-server's pinned dep), NOT hand-rolled endpoints. We implement only the `OAuthServerProvider`, the clients store, the consent page, and persistence. |
| D-6 | Mount seam | **Express 5 sub-app delegated from the raw-node dispatch** (an Express app is a `(req,res)` function). Portal does NOT become an Express server; `/mcp`, `/ws`, `/health`, `/module/*` stay on the existing raw handlers. New deps: `express` (the SDK's own runtime dep — same `^5.2.1` range) + `@types/express` (dev). |
| D-7 | Token format | **Opaque random 256-bit strings, stored sha256-hashed** in the state file. No JWT, no signing keys (single-instance deploy — shared-nothing verification isn't needed). Access TTL **1h**; refresh tokens **rotate on every use** (OAuth 2.1 public-client requirement; claude.ai docs require rotation + RFC 6749 `invalid_grant` on a dead refresh). `revokeToken` implemented (cheap map-delete; the router then serves `/revoke` for free). |
| D-8 | Scopes | Advertise `scopes_supported: ["portal", "offline_access"]` (PRM + AS metadata). `offline_access` is what makes Claude request a refresh token. `/mcp` does NOT enforce scopes (single-user). |
| D-9 | Discovery | The 401 from `/mcp` carries `WWW-Authenticate: Bearer resource_metadata="<url>"` where `<url>` comes from the SDK's `getOAuthProtectedResourceMetadataUrl(new URL(publicOrigin + "/mcp"))` — never hand-built (the docs call the 401 header the reliable path; the well-known probe is fallback). PRM `resource` must equal `https://portal.iridi.cc/mcp` exactly. |
| D-10 | Consent flow shape | SDK's `authorizationHandler` validates the request and calls `provider.authorize(client, params, res)`; we render a self-contained HTML form (client name, scopes, **redirect host displayed prominently** — the MCP spec's loopback-impersonation mitigation) with a hidden single-use `pendingId` (random, 10-min TTL, in-memory). `POST /consent` (our own route on the sub-app, form-urlencoded) checks the key → mints the code → 302 to the redirect URI with `code`+`state`. Wrong key → re-render with error + counter bump. No cookies, no sessions. |

## Verified footprint (trust these over prose)

- **SDK toolkit (installed 1.29.0, real path in the scope doc §2):** `mcpAuthRouter` mounts
  `/authorize`, `/token`, `/register` (iff `clientsStore.registerClient` exists), `/revoke` (iff
  `provider.revokeToken` exists), `/.well-known/oauth-authorization-server`,
  `/.well-known/oauth-protected-resource[/<rsPath>]`. PKCE S256 is verified by the token handler
  itself (`pkce-challenge`'s `verifyChallenge` vs our stored `codeChallenge`);
  `code_challenge_methods_supported: ["S256"]` is emitted in metadata. `/token` accepts
  form-urlencoded (claude.ai requirement). Registration + endpoints are rate-limited by default
  (`express-rate-limit`, an SDK dep). `redirectUriMatches` implements the RFC 8252 port-agnostic
  loopback rule — reuse it for the D-4 allowlist. Error classes (`InvalidGrantError` →
  `invalid_grant`) in `server/auth/errors.js`. Deep imports work via the package's `./*` exports
  wildcard.
- **Provider surface we implement** (`server/auth/provider.js`): `clientsStore` getter;
  `authorize(client, params, res)` (params = `{state?, scopes?, codeChallenge, redirectUri,
  resource?}`); `challengeForAuthorizationCode`; `exchangeAuthorizationCode`;
  `exchangeRefreshToken`; `verifyAccessToken` → `AuthInfo {token, clientId, scopes, expiresAt}`;
  `revokeToken`. No production clients store ships — ours is Map-backed + persisted.
- **Portal seams (file:line in the scope doc §3):** dispatch chain `server.ts:63-84` (new arm
  before the 404 fallthrough); the bearer choke point `mcp.ts:313-321`; config schemas
  `config.ts:225-236` + `models.py:203-215` (both `.strict()` — new fields land in BOTH or parsing
  fails); kdl block `config.kdl:255-273`; compose `docker-compose.yml:521-543` (`user:
  "1000:1000"`, **no volume today**); Caddy catch-all `sites.caddyfile:207-209` covers all new
  paths (they must NOT join the `@sse` matcher); Dockerfile copies `src/` wholesale (`:70`) — new
  source files need no Dockerfile edit, the new npm dep only needs the lockfile regenerated
  (`--frozen-lockfile` at `:39`).
- **claude.ai contract (docs fetched 2026-07-07):** redirect `https://claude.ai/api/mcp/
  auth_callback`; DCR as a **public client**, possibly one fresh client per connection (client
  accumulation is fine at our scale; prune nothing in v1); refresh reactive-on-401 + proactive
  ≤5 min before expiry; **10s** endpoint-latency budget (**30s** refresh) — ours are map/file
  lookups; Anthropic egress `160.79.104.0/21` (public edge — no allowlisting).
- **Strip-types runtime** (`node --import …/nodeTsResolve.mjs`, no build step): no parameter
  properties, no enums in new code. Express is plain JS at runtime — unaffected.

## Scope (in)

1. **`apps/portal/server/src/oauth.ts`** — `PortalOAuthProvider` (D-7 token model, D-4 allowlisted
   Map-backed clients store, code minting/burning), the persistence layer (D-2: load at boot,
   atomic `.tmp`+rename writes, expired-token pruning; a corrupt state file is renamed aside
   `state.json.corrupt-<ts>` + ERROR-logged + started empty — availability over fail-stop, the
   only cost is a re-consent), and the Express sub-app factory (`mcpAuthRouter` + `POST /consent`).
2. **`server.ts`** — one new dispatch arm: `/authorize`, `/token`, `/register`, `/revoke`,
   `/consent`, `/.well-known/*` → the sub-app. Everything else untouched.
3. **`mcp.ts`** — D-3 dual auth + the D-9 `WWW-Authenticate` header on every 401.
4. **Config:** new `oauth-state-path "/data/oauth/state.json"` in the kdl portal block + both
   schema mirrors (`oauthStatePath` / `oauth_state_path`). `publicOrigin` is the issuer — already
   present. **No new SOPS keys** (D-1/D-7); compose `environment:` list unchanged.
5. **Deploy:** compose volume `../artifacts/portal-oauth:/data/oauth` + `just artifacts-init`
   mkdir; the server `mkdir -p`s the state dirname at boot and **fails fast** if unwritable.
6. **Telemetry:** `lazyCounter`s `astra.portal.oauth.authorizations{outcome}`,
   `…oauth.tokens_issued{grant}`, `…oauth.rejections{reason}`; spans
   `portal.oauth.{authorize,consent,token,register}`; audit-style INFO logs (attribute
   `portal.oauth.event`) mirroring `portal.audit.*`. **Token/key material never appears in any
   log, span attribute, or error message.**
7. **Tests (hermetic, no SOPS/network):** the full flow against a real ephemeral-port server —
   see slice acceptance.

## Scope (out) / deferred (recorded, not silently cut — [[no-silent-scope-cuts]])

- **CIMD** (`client_id_metadata_document_supported`) — DCR suffices for claude.ai; CIMD is a
  fast-follow if Claude Code is ever moved off the static key (D-3 keeps it on the key).
- **Multi-user consent / per-user identity** — single-user by design; `AuthInfo.clientId` is the
  only principal.
- **Scope enforcement on `/mcp`** (D-8), **token introspection endpoint**, **client pruning/GC**
  (accumulated DCR clients are rows in a JSON file), **`static_headers`** (not on the account;
  if the beta lands, it becomes a zero-code alternative — connector can simply be re-added).
- **Retiring the static bearer** — explicitly kept (D-3).

## Slices

### Slice S1 — the authorization server (Foundry-free)
- `express` + `@types/express` deps (lockfile regenerated); `oauth.ts` per Scope-1 (provider,
  stores, persistence, consent page, sub-app factory); the `server.ts` dispatch arm; config field
  in kdl + both schemas; `listen()`/`createPortalServer` options extended with `oauthStatePath`
  (+ a test-only `accessTokenTtlS` override, default 3600).
- **Acceptance:** hermetic tests green covering — `/.well-known/oauth-authorization-server` +
  PRM served with `S256` + `offline_access` + `registration_endpoint`; DCR registers a
  claude.ai-shaped client and **rejects** a disallowed redirect URI (D-4) while accepting
  loopback-with-any-port; GET `/authorize` (valid client, S256 challenge) renders the consent
  form; `POST /consent` with the right key 302s back with `code`+`state`, with the wrong key
  re-renders + never issues; `POST /token` (form-urlencoded, correct `code_verifier`) returns
  access+refresh, wrong verifier → `invalid_grant`; refresh **rotates** (old refresh dies,
  `invalid_grant` on reuse); `/revoke` kills a token; **persistence round-trip** — a second
  `listen()` on the same state file still verifies the token and knows the client; a corrupt
  state file starts empty with the `.corrupt-*` rename. Both CI lanes reproduce locally (the py
  lane guards the schema mirror — `extra="forbid"`).

### Slice S2 — the resource-server integration (`/mcp` dual auth + discovery header)
- `mcp.ts`: dual auth (D-3) + `WWW-Authenticate` on 401 (D-9, URL via the SDK helper).
- **Acceptance:** existing 401 tests extended — the 401 carries the exact
  `resource_metadata` URL and that URL, fetched, returns PRM whose `resource` ==
  `<origin>/mcp` and `authorization_servers[0]` == the issuer; an OAuth-issued access token
  calls a real tool through `StreamableHTTPClientTransport` (bridge offline → typed offline
  result proves auth passed); the legacy static bearer still works; an expired access token
  (short `accessTokenTtlS`) → 401.

### Slice S3 — deploy + live end-to-end + memory
- Compose volume + `artifacts-init`; `just up`; `just caddy-reload` NOT needed (no Caddy edit —
  verify the catch-all serves the new paths anyway).
- Live verification (agent-drivable): discovery docs 200 through the public edge; a full
  curl-driven flow through the edge (register → authorize → consent with the real key → PKCE
  token) issues a token that calls `/mcp` live; a `just up` restart later, the same refresh
  token still rotates (persistence live-proven).
- **Human half ([[flag-paid-live-actions]] — flag at execution):** the stakeholder adds the
  custom connector in claude.ai (URL `https://portal.iridi.cc/mcp`, **no** client ID/secret),
  consents with the portal key, runs a tool call from a claude.ai chat (world launched — the
  0023 liveness constraint applies to tools, not to the OAuth flow itself), and confirms the
  connection survives a redeploy without re-consent.
- Memory: `portal-0023-gotchas` gains the 0025 section (or a sibling memory) + `MEMORY.md`
  pointer; RESUME updated.
- **Acceptance:** the full loop above; SigNoz shows the `astra.portal.oauth.*` counters + spans
  with 0 unexpected errors.

## Acceptance criteria (exit gate)

- **A.** All 3 slices CI-green + pushed; both lanes reproduce locally.
- **B.** Config: `oauth-state-path` mirrored in kdl + Zod + Pydantic; **zero new SOPS keys**;
  state file lands host-owned (1000:1000) on the bind mount.
- **C.** Discovery correct: AS metadata + PRM served; PRM `resource` exact-matches
  `https://portal.iridi.cc/mcp`; metadata advertises S256, `offline_access`,
  `registration_endpoint`; `/mcp` 401s carry the `resource_metadata` header.
- **D.** Flow correct (hermetic + live-curl): D-4 allowlist enforced; consent key-gated
  (constant-time); PKCE enforced; refresh rotates + dead refresh → `invalid_grant`; revoke works;
  legacy bearer still accepted; expired tokens rejected.
- **E.** Persistence: connections survive a server restart AND a live `just up` redeploy.
- **F.** claude.ai live half: connector added, consent once, tool call from a chat works
  (human-verified).
- **G.** Telemetry: oauth counters/spans/audit logs in SigNoz, no token material anywhere.
- **H.** Memory + RESUME updated.

## Risks

- **claude.ai discovery drift** (docs are beta-era). Mitigated: D-9 uses the documented reliable
  path; F is a real connect, not a simulation. If Claude's probe order changes, the PRM is also
  served at both well-known shapes by the SDK router.
- **Express-under-strip-types** — express is plain JS; only our TS touches the runtime. S1's
  integration tests run the real router.
- **New public HTML surface on a write-capable server.** Mitigations: D-4 allowlist, key-gated
  consent (constant-time), SDK rate limits, single-use 10-min codes, hashed-at-rest tokens, no
  cookies, redirect-host display. The consent key IS the existing `/mcp` key — no new privilege
  is minted.
- **State-file corruption/loss** → re-consent, not breakage (rename-aside + ERROR log).
- **The linguist-commit timer** sweeps staged files mid-session — keep a clean index during
  commits ([[pipeline-reorder-0021]]).

## Adversarial completeness pass

- *"Open redirect?"* — codes only ever redirect to the **registered** URI (SDK-validated) and
  registration itself is D-4-allowlisted. ✓
- *"CSRF on /consent?"* — no cookies/sessions exist; the form requires the secret key + a
  single-use pendingId, so a forged POST without the key does nothing. ✓
- *"Token leakage via logs/traces?"* — Scope-6 hard rule; tests grep emitted log bodies for the
  issued tokens. ✓
- *"Replay of the auth code?"* — single-use (burned on exchange) + 10-min TTL + PKCE binds it to
  the verifier. ✓
- *"What if claude.ai registers a new client every connect?"* — rows accumulate in the state
  file; harmless at personal scale; GC deferred (Scope-out). ✓
- *"Restart mid-flow?"* — pending consents + codes are memory-only; Claude just restarts the
  flow. Issued tokens persist. ✓
- *"Does the WS bridge hop change?"* — no; `bridge_api_key` and the module are untouched (D-3). ✓
- *"Latency budget?"* — all endpoints are local map/file ops, orders of magnitude under 10s. ✓

## Hand-off

Implement via `octo:embrace`, slice by slice, one CI-green Conventional Commit per slice
(`feat(portal): …`), push on completion, `just up` at S3, then the F human step. The builder
should read the scope doc §2–§4 for the SDK file paths and the exact portal seams before writing
code.
