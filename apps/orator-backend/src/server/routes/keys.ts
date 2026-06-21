/**
 * Stream Deck API-key management (lark B26). Bound to the logged-in user; the raw
 * key is returned only once at creation. These routes require a **web session** —
 * an API key cannot mint or revoke keys (so the orator-controller plugin, which
 * has no session, can only *consume* a key the operator mints here).
 *
 * astra port: `repo.X(ctx.db, …)` → `await ctx.store.X(…)` (async LibraryStore).
 */
import type { ApiKey } from "../../db/store";
import { generateKey } from "../apikeys";
import { type ApiCtx, type ApiRoute, HttpError, intParam, json, readJson } from "../router";

function requireSession(ctx: ApiCtx): void {
  if (ctx.authMethod !== "session") throw new HttpError(403, "key_management_requires_login");
}

/** Public view of a key — never includes the hash. */
function publicKey(k: ApiKey) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.key_prefix,
    created_at: k.created_at,
    last_used_at: k.last_used_at,
    revoked: k.revoked_at !== null,
  };
}

export const keyRoutes: ApiRoute[] = [
  {
    method: "GET",
    path: "/api/v1/keys",
    handler: async (ctx) => {
      requireSession(ctx);
      return json((await ctx.store.listApiKeys(ctx.session.uid)).map(publicKey));
    },
  },
  {
    method: "POST",
    path: "/api/v1/keys",
    handler: async (ctx) => {
      requireSession(ctx);
      const body = await readJson<{ name?: string }>(ctx.req);
      const name = body.name?.trim() || "Stream Deck";
      const gen = generateKey();
      const stored = await ctx.store.createApiKey({
        userId: ctx.session.uid,
        name,
        keyHash: gen.hash,
        keyPrefix: gen.prefix,
      });
      // The raw key is shown exactly once here and never retrievable again (B26).
      return json({ ...publicKey(stored), key: gen.raw }, 201);
    },
  },
  {
    method: "DELETE",
    path: "/api/v1/keys/:id",
    handler: async (ctx) => {
      requireSession(ctx);
      if (!(await ctx.store.revokeApiKey(intParam(ctx.params, "id"), ctx.session.uid)))
        throw new HttpError(404, "not_found");
      return new Response(null, { status: 204 });
    },
  },
];
