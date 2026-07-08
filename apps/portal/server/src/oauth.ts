/**
 * The portal OAuth 2.1 authorization server (spec 0025 S1) — lets claude.ai add
 * `https://portal.iridi.cc/mcp` as a custom connector, which requires DCR +
 * authorization-code+PKCE + discovery metadata (claude.ai does not support static
 * bearer auth for custom connectors). Built on the MCP SDK's own audited toolkit
 * (`mcpAuthRouter` + its handlers, D-5) — this module supplies only what the SDK
 * doesn't ship: an `OAuthServerProvider`/clients-store implementation
 * ({@link PortalOAuthProvider}), a single-user HTML consent page, and a JSON-file
 * persistence layer for registered clients + hashed tokens (D-2, so a claude.ai
 * connection survives a `just up` redeploy).
 *
 * Single-user by design (D-1): the "user" consents by typing the same
 * `portal_mcp_api_key` that already bearer-gates `/mcp` — no new SOPS secret, no
 * accounts, no sessions/cookies. The whole flow is two HTTP round-trips: GET
 * `/authorize` renders the consent form (this module renders HTML directly to
 * `res` instead of an immediate redirect — an intentional, spec-sanctioned reading
 * of the SDK's "must eventually redirect" contract, since the redirect only
 * happens once POST `/consent` approves); POST `/consent` (astra-owned, not part
 * of `mcpAuthRouter`) mints a single-use code and 302s back to the registered
 * redirect URI.
 *
 * HARD RULE (audit-log/telemetry hygiene): no access/refresh token, authorization
 * code, or the consent key ever appears in a log body, span attribute, or thrown
 * error message — every `log.emit`/error-message call site below was written
 * with this in mind (client ids and typed outcomes only).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { getLogger, getTracer, lazyCounter } from "@astra/observe";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import express, { type Express, type Response } from "express";

import { MCP_HTTP_PATH, OAUTH_CONSENT_PATH, SERVICE_NAME } from "./constants";

const log = getLogger(SERVICE_NAME);
const tracer = getTracer(SERVICE_NAME);

const oauthAuthorizations = lazyCounter(SERVICE_NAME, "astra.portal.oauth.authorizations", {
  description: "GET /authorize renders + POST /consent decisions, by outcome",
});
const oauthTokensIssued = lazyCounter(SERVICE_NAME, "astra.portal.oauth.tokens_issued", {
  description: "OAuth access+refresh token pairs issued, by grant type",
});
const oauthRejections = lazyCounter(SERVICE_NAME, "astra.portal.oauth.rejections", {
  description: "OAuth requests rejected before a token was issued, by reason",
});

/** D-4: the only redirect URIs DCR will register. claude.ai's hosted callback is an
 * exact string; native/CLI clients (RFC 8252) get any loopback port. Mirrors the
 * SDK's own `redirectUriMatches` loopback-hostname set (`server/auth/handlers/
 * authorize.js`) — that function governs the PER-REQUEST redirect_uri check the
 * SDK already performs before calling `authorize()`; this one governs which URIs
 * are allowed to REGISTER in the first place. */
const CLAUDE_AI_REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isAllowedRedirectUri(uri: string): boolean {
  if (uri === CLAUDE_AI_REDIRECT_URI) return true;
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" && LOOPBACK_HOSTNAMES.has(parsed.hostname);
}

const PENDING_CONSENT_TTL_MS = 10 * 60_000;
const AUTH_CODE_TTL_MS = 10 * 60_000;
const DEFAULT_ACCESS_TOKEN_TTL_S = 3600;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Timing-safe compare that tolerates a length mismatch (the naive case
 * `crypto.timingSafeEqual` throws on) without leaking timing information beyond
 * "same length or not" — an attacker who can only observe candidate-length
 * mismatches learns nothing about the actual key. */
function constantTimeEquals(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// --- persisted state (D-2) --------------------------------------------------------
//
// One JSON file: registered clients + hashed tokens. Pending consents and
// authorization codes are DELIBERATELY absent from this shape — they're memory-only
// (a restart mid-flow just makes Claude retry the flow from scratch, which is fine;
// see the spec's adversarial-completeness pass).

interface StoredAccessToken {
  clientId: string;
  scopes: string[];
  /** Epoch seconds (matches `AuthInfo.expiresAt`'s unit), not epoch ms. */
  expiresAt: number;
}

interface StoredRefreshToken {
  clientId: string;
  scopes: string[];
}

interface PersistedState {
  version: 1;
  clients: Record<string, OAuthClientInformationFull>;
  /** Keyed by sha256 hex of the token — the token itself is never stored (D-7). */
  accessTokens: Record<string, StoredAccessToken>;
  refreshTokens: Record<string, StoredRefreshToken>;
}

function emptyState(): PersistedState {
  return { version: 1, clients: {}, accessTokens: {}, refreshTokens: {} };
}

function pruneExpiredAccessTokens(
  tokens: Record<string, StoredAccessToken>,
): Record<string, StoredAccessToken> {
  const nowS = Math.floor(Date.now() / 1000);
  const pruned: Record<string, StoredAccessToken> = {};
  for (const [hash, entry] of Object.entries(tokens)) {
    if (entry.expiresAt > nowS) pruned[hash] = entry;
  }
  return pruned;
}

/** Loads the state file at construction. Missing file → empty (normal first boot).
 * Corrupt/unparseable file → renamed aside to `<path>.corrupt-<epoch-ms>` + an ERROR
 * log + start empty (availability over fail-stop — the only cost is re-consent, per
 * the spec's Risks). `mkdirSync` is NOT wrapped in try/catch: an unwritable parent
 * directory should fail startup loudly, not silently run without persistence. */
function loadState(statePath: string): PersistedState {
  mkdirSync(dirname(statePath), { recursive: true });

  let raw: string;
  try {
    raw = readFileSync(statePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw err; // permission-denied etc. — fail fast, matching the mkdir contract above
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      version: 1,
      clients: parsed.clients ?? {},
      accessTokens: pruneExpiredAccessTokens(parsed.accessTokens ?? {}),
      refreshTokens: parsed.refreshTokens ?? {},
    };
  } catch {
    const corruptPath = `${statePath}.corrupt-${Date.now()}`;
    try {
      renameSync(statePath, corruptPath);
    } catch {
      /* best-effort — even if the rename itself fails we still start empty below */
    }
    log.emit({
      severityText: "ERROR",
      body:
        `portal oauth state file was corrupt/unparseable — renamed aside to ` +
        `${corruptPath} and starting empty (registered clients + tokens lost; ` +
        `re-consent required)`,
    });
    return emptyState();
  }
}

/** Atomic write (the scribe idiom): write `<path>.tmp`, then `renameSync` over the
 * real path — a crash mid-write never leaves a half-written state file. */
function persistState(statePath: string, state: PersistedState): void {
  const pruned: PersistedState = {
    ...state,
    accessTokens: pruneExpiredAccessTokens(state.accessTokens),
  };
  const tmpPath = `${statePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(pruned, null, 2));
  renameSync(tmpPath, statePath);
}

// --- memory-only flow state --------------------------------------------------------

interface PendingConsent {
  clientId: string;
  params: AuthorizationParams;
  createdAt: number;
}

interface AuthCodeEntry {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  createdAt: number;
}

export interface PortalOAuthProviderOptions {
  /** Bind-mounted state file path (D-2) — `cfg.portal.oauthStatePath`. */
  statePath: string;
  /** The already-resolved `portal_mcp_api_key` (D-1) — the consent-page password.
   * Never logged, never echoed in any response body. */
  consentKey: string;
  /** Access-token lifetime in seconds (D-7; production default 3600 via the
   * fallback below). Test-only override for the expiry acceptance case. */
  accessTokenTtlS?: number;
}

/**
 * Single-user `OAuthServerProvider` + `OAuthRegisteredClientsStore` (merged into one
 * class — `clientsStore` just returns `this`, mirroring the SDK's own demo shape but
 * production-grade: persisted, allowlisted, hashed-at-rest). See the module doc for
 * the two-request consent flow this implements (`authorize` renders the form;
 * `takePendingConsent`/`grantConsent`/`renewPendingConsent` back the astra-owned
 * `POST /consent` route in {@link createOAuthSubApp}).
 */
export class PortalOAuthProvider implements OAuthServerProvider, OAuthRegisteredClientsStore {
  readonly #statePath: string;
  readonly #consentKey: string;
  readonly #accessTokenTtlS: number;
  #state: PersistedState;

  readonly #pending = new Map<string, PendingConsent>();
  readonly #codes = new Map<string, AuthCodeEntry>();

  constructor(opts: PortalOAuthProviderOptions) {
    this.#statePath = opts.statePath;
    this.#consentKey = opts.consentKey;
    this.#accessTokenTtlS = opts.accessTokenTtlS ?? DEFAULT_ACCESS_TOKEN_TTL_S;
    this.#state = loadState(this.#statePath);
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return this;
  }

  #persist(): void {
    persistState(this.#statePath, this.#state);
  }

  // --- OAuthRegisteredClientsStore (DCR, D-4) --------------------------------

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.#state.clients[clientId];
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): OAuthClientInformationFull {
    for (const uri of client.redirect_uris) {
      if (!isAllowedRedirectUri(uri)) {
        oauthRejections.add(1, { reason: "redirect-uri-not-allowed" });
        // Thrown as an OAuthError subclass so `register.js`'s handler serializes it
        // as a proper RFC 7591 `{error: "invalid_client_metadata", ...}` 400 — never
        // a bare 500.
        throw new InvalidClientMetadataError(
          `redirect_uri "${uri}" is not allowed — only ${CLAUDE_AI_REDIRECT_URI} or an ` +
            "RFC 8252 loopback URI (http://localhost/... or http://127.0.0.1/..., any port) " +
            "may be registered",
        );
      }
    }
    // The router (`register.js`, default `clientIdGeneration: true`) already stamps
    // `client_id`/`client_id_issued_at` onto this object before calling us — the
    // `Omit<...>` param type is the SDK's own (slightly loose) interface contract,
    // not what actually arrives. Reuse what's there; only generate fresh values as a
    // defensive fallback (e.g. if that default were ever flipped).
    const incoming = client as Partial<OAuthClientInformationFull>;
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: incoming.client_id ?? randomBytes(16).toString("hex"),
      client_id_issued_at: incoming.client_id_issued_at ?? Math.floor(Date.now() / 1000),
    };
    this.#state.clients[full.client_id] = full;
    this.#persist();
    log.emit({
      severityText: "INFO",
      body: `portal oauth: client registered (client_id=${full.client_id})`,
      attributes: { "portal.oauth.event": "register" },
    });
    return full;
  }

  // --- consent flow (D-10) ----------------------------------------------------

  #prunePendingConsents(): void {
    const cutoff = Date.now() - PENDING_CONSENT_TTL_MS;
    for (const [id, entry] of this.#pending) {
      if (entry.createdAt < cutoff) this.#pending.delete(id);
    }
  }

  /** SDK entry point: renders the consent page directly to `res` (200 HTML) rather
   * than redirecting immediately. This is a deliberate two-request split (D-10):
   * the actual authorization-response redirect only happens once `POST /consent`
   * (below) approves — `authorize()`'s job here is just to stage a 10-min-TTL
   * pending consent and show the form. By the time this runs, the SDK's own
   * `authorizationHandler` has already resolved+validated `client` and checked
   * `params.redirectUri` against the client's registered URIs. */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    return tracer.startActiveSpan("portal.oauth.authorize", async (span) => {
      try {
        this.#prunePendingConsents();
        const pendingId = randomBytes(16).toString("hex");
        this.#pending.set(pendingId, { clientId: client.client_id, params, createdAt: Date.now() });
        oauthAuthorizations.add(1, { outcome: "rendered" });
        res
          .status(200)
          .set("content-type", "text/html; charset=utf-8")
          .send(renderConsentPage({ client, params, pendingId }));
      } finally {
        span.end();
      }
    });
  }

  /** Single-use retrieval for the `/consent` handler — deletes on read regardless
   * of whether it turns out to be expired, so a pendingId is never usable twice. */
  takePendingConsent(pendingId: string): PendingConsent | undefined {
    const entry = this.#pending.get(pendingId);
    this.#pending.delete(pendingId);
    if (!entry || Date.now() - entry.createdAt > PENDING_CONSENT_TTL_MS) return undefined;
    return entry;
  }

  /** Wrong-key retry (D-10): re-stage the SAME client/params under a fresh
   * pendingId so the consent form can be shown again with an error line. */
  renewPendingConsent(clientId: string, params: AuthorizationParams): string {
    this.#prunePendingConsents();
    const pendingId = randomBytes(16).toString("hex");
    this.#pending.set(pendingId, { clientId, params, createdAt: Date.now() });
    return pendingId;
  }

  /** Constant-time check of a submitted consent-form key against the configured
   * `portal_mcp_api_key` (D-1) — never throws on a length mismatch. */
  verifyConsentKey(candidate: string): boolean {
    return constantTimeEquals(candidate, this.#consentKey);
  }

  /** Approved-consent path: mints a single-use 256-bit authorization code (10-min
   * TTL, memory-only) and returns the redirect target carrying `code`+`state`
   * (never string-concatenated — `URLSearchParams`, per the spec's open-redirect
   * note: this only ever targets the ALREADY-validated `params.redirectUri`). */
  grantConsent(clientId: string, params: AuthorizationParams): URL {
    const code = randomBytes(32).toString("hex");
    this.#codes.set(code, {
      clientId,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      scopes: params.scopes ?? [],
      createdAt: Date.now(),
    });
    const redirectUrl = new URL(params.redirectUri);
    const search = new URLSearchParams({ code });
    if (params.state !== undefined) search.set("state", params.state);
    redirectUrl.search = search.toString();
    return redirectUrl;
  }

  // --- OAuthServerProvider: code exchange + tokens ----------------------------

  #peekCode(code: string): AuthCodeEntry | undefined {
    const entry = this.#codes.get(code);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > AUTH_CODE_TTL_MS) {
      this.#codes.delete(code);
      return undefined;
    }
    return entry;
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const entry = this.#peekCode(authorizationCode);
    if (!entry || entry.clientId !== client.client_id) {
      throw new InvalidGrantError("unknown, expired, or already-used authorization code");
    }
    return entry.codeChallenge;
  }

  /** PKCE is already verified by the SDK's token handler (against the challenge
   * `challengeForAuthorizationCode` returned) before this is ever called — our job
   * is just to burn the code and mint tokens. `redirectUri`, if the token request
   * supplied one, must match what was recorded at consent time (OAuth 2.1
   * consistency check — belt-and-suspenders alongside the SDK's own registered-URI
   * check at `/authorize` time). */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    return tracer.startActiveSpan("portal.oauth.token", async (span) => {
      try {
        const entry = this.#peekCode(authorizationCode);
        // Burn it unconditionally, BEFORE the ownership check — a code must never
        // be exchangeable twice, even by a client that fails the check below.
        this.#codes.delete(authorizationCode);
        if (
          !entry ||
          entry.clientId !== client.client_id ||
          (redirectUri !== undefined && redirectUri !== entry.redirectUri)
        ) {
          throw new InvalidGrantError("unknown, expired, or already-used authorization code");
        }
        const tokens = this.#issueTokenPair(client.client_id, entry.scopes);
        oauthTokensIssued.add(1, { grant: "authorization_code" });
        // Audit line intentionally carries only client_id + a fixed literal body —
        // see the module doc's hard rule: never the token/hash/code itself.
        log.emit({
          severityText: "INFO",
          body: `portal oauth: token issued (client_id=${client.client_id}, grant=authorization_code)`,
          attributes: { "portal.oauth.event": "token-issued" },
        });
        return tokens;
      } finally {
        span.end();
      }
    });
  }

  /** Rotation (D-7, OAuth 2.1 public-client requirement): the presented refresh
   * token is deleted unconditionally before a new pair is issued, so a dead/reused
   * refresh token can never succeed twice. */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    return tracer.startActiveSpan("portal.oauth.token", async (span) => {
      try {
        const hash = sha256Hex(refreshToken);
        const stored = this.#state.refreshTokens[hash];
        if (!stored || stored.clientId !== client.client_id) {
          throw new InvalidGrantError("unknown, expired, or already-rotated refresh token");
        }
        delete this.#state.refreshTokens[hash];
        const tokens = this.#issueTokenPair(client.client_id, scopes ?? stored.scopes);
        oauthTokensIssued.add(1, { grant: "refresh_token" });
        log.emit({
          severityText: "INFO",
          body: `portal oauth: refresh token rotated (client_id=${client.client_id})`,
          attributes: { "portal.oauth.event": "refresh-rotated" },
        });
        return tokens;
      } finally {
        span.end();
      }
    });
  }

  #issueTokenPair(clientId: string, scopes: string[]): OAuthTokens {
    const accessToken = randomBytes(32).toString("hex");
    const refreshToken = randomBytes(32).toString("hex");
    const expiresAt = Math.floor(Date.now() / 1000) + this.#accessTokenTtlS;
    this.#state.accessTokens[sha256Hex(accessToken)] = { clientId, scopes, expiresAt };
    this.#state.refreshTokens[sha256Hex(refreshToken)] = { clientId, scopes };
    this.#persist();
    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: this.#accessTokenTtlS,
      refresh_token: refreshToken,
      scope: scopes.join(" "),
    };
  }

  /** Called directly by `mcp.ts`'s dual-auth check in S2 (not by `mcpAuthRouter`
   * itself — the SDK's bearer middleware, `requireBearerAuth`, is Express-only and
   * portal's `/mcp` stays on the raw-node handler). */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const hash = sha256Hex(token);
    const stored = this.#state.accessTokens[hash];
    const nowS = Math.floor(Date.now() / 1000);
    if (!stored || stored.expiresAt <= nowS) {
      throw new InvalidTokenError("invalid or expired access token");
    }
    return { token, clientId: stored.clientId, scopes: stored.scopes, expiresAt: stored.expiresAt };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const hash = sha256Hex(request.token);
    const revoked = hash in this.#state.accessTokens || hash in this.#state.refreshTokens;
    delete this.#state.accessTokens[hash];
    delete this.#state.refreshTokens[hash];
    if (revoked) {
      this.#persist();
      log.emit({
        severityText: "INFO",
        body: "portal oauth: token revoked",
        attributes: { "portal.oauth.event": "revoked" },
      });
    }
  }
}

// --- consent page HTML --------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderConsentPage(opts: {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  pendingId: string;
  error?: string;
}): string {
  const clientName = opts.client.client_name ?? opts.client.client_id;
  const scopeList = (opts.params.scopes ?? []).join(", ") || "(none requested)";
  // Per the MCP spec's loopback-impersonation mitigation: show the redirect HOST
  // prominently so the user can catch a malicious/lookalike registered client
  // before typing the key.
  const redirectHost = new URL(opts.params.redirectUri).host;
  const errorHtml = opts.error ? `<p class="error">${escapeHtml(opts.error)}</p>` : "";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>astra portal — authorize</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; }
  .redirect-host { font-weight: bold; }
  .error { color: #b00020; }
  input[type="password"] { width: 100%; padding: 0.5rem; margin: 0.5rem 0 1rem; box-sizing: border-box; }
  button { padding: 0.5rem 1.5rem; }
</style>
</head>
<body>
  <h1>Authorize ${escapeHtml(clientName)}</h1>
  <p>This application is requesting access to the astra portal with scopes:
     <strong>${escapeHtml(scopeList)}</strong>.</p>
  <p>You will be redirected to <span class="redirect-host">${escapeHtml(redirectHost)}</span> after
     granting access — make sure you recognize this host before entering your key.</p>
  ${errorHtml}
  <form method="post" action="${OAUTH_CONSENT_PATH}">
    <input type="hidden" name="pendingId" value="${escapeHtml(opts.pendingId)}">
    <label for="key">Portal key</label>
    <input type="password" id="key" name="key" autocomplete="off" required>
    <button type="submit">Authorize</button>
  </form>
</body>
</html>`;
}

function renderConsentErrorPage(message: string): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>astra portal — authorize</title></head>
<body><p class="error">${escapeHtml(message)}</p></body>
</html>`;
}

// --- the sub-app factory (D-6) --------------------------------------------------

export interface CreateOAuthSubAppOptions {
  /** `cfg.portal.oauthStatePath`. */
  statePath: string;
  /** The resolved `portal_mcp_api_key` (D-1) — reused as the consent password. */
  consentKey: string;
  /** `cfg.portal.publicOrigin` — the OAuth issuer + the `/mcp` resource server URL
   * (D-9: PRM `resource` must exact-match `<publicOrigin>/mcp`). */
  publicOrigin: string;
  /** Test-only access-token TTL override (D-7 default 3600s otherwise). */
  accessTokenTtlS?: number;
}

export interface OAuthSubApp {
  /** Mount this at the dispatch root for `/authorize`, `/token`, `/register`,
   * `/revoke`, `/.well-known/*`, and {@link OAUTH_CONSENT_PATH} — call it as a bare
   * `(req, res)` function (`server.ts`'s raw-node dispatch, D-6). */
  app: Express;
  /** Exposed so `server.ts`/`mcp.ts` (S2) can call `verifyAccessToken` for the
   * `/mcp` dual-auth check without re-parsing the state file. */
  provider: PortalOAuthProvider;
}

/** Builds the provider + the Express sub-app that fronts it (D-6: portal does NOT
 * become an Express server — this app is only ever invoked as a plain `(req,res)`
 * function from the raw dispatch in `server.ts`, for the handful of OAuth paths). */
export function createOAuthSubApp(opts: CreateOAuthSubAppOptions): OAuthSubApp {
  const provider = new PortalOAuthProvider({
    statePath: opts.statePath,
    consentKey: opts.consentKey,
    accessTokenTtlS: opts.accessTokenTtlS,
  });

  const issuerUrl = new URL(opts.publicOrigin);
  const resourceServerUrl = new URL(`${opts.publicOrigin}${MCP_HTTP_PATH}`);

  const app = express();
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      resourceServerUrl,
      // D-8: advertised but not enforced on /mcp (single-user). `offline_access`
      // is what makes claude.ai request a refresh token.
      scopesSupported: ["portal", "offline_access"],
    }),
  );

  app.post(OAUTH_CONSENT_PATH, express.urlencoded({ extended: false }), (req, res) => {
    tracer.startActiveSpan("portal.oauth.consent", (span) => {
      try {
        const body = req.body as { pendingId?: unknown; key?: unknown };
        const pendingId = typeof body.pendingId === "string" ? body.pendingId : undefined;
        const key = typeof body.key === "string" ? body.key : "";

        if (!pendingId) {
          res.status(400).send(renderConsentErrorPage("missing pendingId"));
          return;
        }

        const pending = provider.takePendingConsent(pendingId);
        if (!pending) {
          oauthRejections.add(1, { reason: "pending-expired" });
          res
            .status(400)
            .send(
              renderConsentErrorPage(
                "this authorization request has expired or was already used — go back to " +
                  "the app and try connecting again",
              ),
            );
          return;
        }

        const client = provider.getClient(pending.clientId);
        if (!client) {
          // Unreachable in normal operation (a client is never deleted once
          // registered) — only reachable via a hand-edited/corrupted state file.
          res.status(400).send(renderConsentErrorPage("unknown client"));
          return;
        }

        if (!provider.verifyConsentKey(key)) {
          oauthRejections.add(1, { reason: "consent-wrong-key" });
          oauthAuthorizations.add(1, { outcome: "denied" });
          const retryPendingId = provider.renewPendingConsent(pending.clientId, pending.params);
          res
            .status(200)
            .set("content-type", "text/html; charset=utf-8")
            .send(
              renderConsentPage({
                client,
                params: pending.params,
                pendingId: retryPendingId,
                error: "Wrong key — try again.",
              }),
            );
          return;
        }

        oauthAuthorizations.add(1, { outcome: "granted" });
        log.emit({
          severityText: "INFO",
          body: `portal oauth: consent granted (client_id=${pending.clientId})`,
          attributes: { "portal.oauth.event": "consent-ok" },
        });
        const redirectUrl = provider.grantConsent(pending.clientId, pending.params);
        res.redirect(302, redirectUrl.href);
      } finally {
        span.end();
      }
    });
  });

  return { app, provider };
}
