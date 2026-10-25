/**
 * Playback control API. The same routes are reachable via a web session
 * or a Stream Deck API key; `ctx.session.uid` is the actor used for follow-the-
 * operator regardless of which auth path set it.
 *
 * astra port: `resolveTrackIds` reads the async `ctx.store` (was sync `repo`).
 */
import { z } from "zod";

import type { PlaybackEngine } from "../../bot/playback";
import { ids, int, jsonBody, text } from "../bodies";
import { type ApiCtx, type ApiRoute, apiRoute, HttpError, json } from "../router";

function engineOf(ctx: ApiCtx): PlaybackEngine {
  const e = ctx.services.playback;
  if (!e) throw new HttpError(503, "playback_unavailable");
  return e;
}

/** Resolve the trackId list for a play request from ids/track/collection/playlist. */
async function resolveTrackIds(
  ctx: ApiCtx,
  body: { trackIds?: number[]; trackId?: number; collectionId?: number; playlistId?: number },
): Promise<number[]> {
  if (Array.isArray(body.trackIds) && body.trackIds.length > 0) return body.trackIds;
  if (body.trackId) return [body.trackId];
  if (body.collectionId)
    return (await ctx.store.listTracks({ collectionId: body.collectionId, limit: 500 })).map(
      (t) => t.id,
    );
  if (body.playlistId) return ctx.store.playlistTrackIds(body.playlistId);
  throw new HttpError(400, "trackIds_trackId_collectionId_or_playlistId_required");
}

export const playbackRoutes: ApiRoute[] = [
  {
    method: "GET",
    path: "/api/v1/playback/now",
    handler: (ctx) => json(engineOf(ctx).nowPlaying()),
  },

  // Diagnostic: confirms what the server sees for the calling operator — your
  // resolved uid, the configured guild, whether the bot is up, and which voice
  // channel (if any) it can resolve for you.
  {
    method: "GET",
    path: "/api/v1/voice/debug",
    handler: async (ctx) => {
      const engine = ctx.services.playback;
      return json({
        uid: ctx.session.uid,
        guildId: ctx.config.guildId || null,
        playbackAvailable: Boolean(engine),
        resolvedChannelId: engine ? await engine.whereIsOperator(ctx.session.uid) : null,
        now: engine ? engine.nowPlaying() : null,
      });
    },
  },

  apiRoute({
    method: "POST",
    path: "/api/v1/playback/play",
    body: jsonBody({
      trackIds: ids().optional(),
      trackId: int().optional(),
      collectionId: int().optional(),
      playlistId: int().optional(),
      channelId: text(),
    }),
    handler: async (ctx) => {
      const engine = engineOf(ctx);
      const body = await ctx.body();
      const trackIds = await resolveTrackIds(ctx, body);
      if (trackIds.length === 0) throw new HttpError(404, "no_tracks");
      return json(
        await engine.play({ trackIds, userId: ctx.session.uid, channelId: body.channelId }),
      );
    },
  }),

  {
    method: "POST",
    path: "/api/v1/playback/stop",
    handler: async (ctx) => json(await engineOf(ctx).stop()),
  },
  {
    method: "POST",
    path: "/api/v1/playback/pause",
    handler: async (ctx) => json(await engineOf(ctx).pause()),
  },
  {
    method: "POST",
    path: "/api/v1/playback/resume",
    handler: async (ctx) => json(await engineOf(ctx).resume()),
  },
  {
    method: "POST",
    path: "/api/v1/playback/next",
    handler: async (ctx) => json(await engineOf(ctx).next()),
  },
  {
    method: "POST",
    path: "/api/v1/playback/prev",
    handler: async (ctx) => json(await engineOf(ctx).prev()),
  },

  apiRoute({
    method: "POST",
    path: "/api/v1/playback/loop",
    body: jsonBody({
      mode: z.enum(["none", "track", "playlist"], { error: "invalid_mode" }).optional(),
    }),
    handler: async (ctx) => {
      const body = await ctx.body();
      if (!body.mode || !["none", "track", "playlist"].includes(body.mode))
        throw new HttpError(400, "invalid_mode");
      return json(await engineOf(ctx).setLoop(body.mode));
    },
  }),

  apiRoute({
    method: "POST",
    path: "/api/v1/voice/join",
    body: jsonBody({ channelId: text() }),
    handler: async (ctx) => {
      // The body is optional here: none (or a bad one) means "follow the operator".
      const body = await ctx.body().catch(() => ({ channelId: undefined }));
      await engineOf(ctx).join({ userId: ctx.session.uid, channelId: body.channelId });
      return json(engineOf(ctx).nowPlaying());
    },
  }),
  {
    method: "POST",
    path: "/api/v1/voice/leave",
    handler: async (ctx) => json(await engineOf(ctx).leave()),
  },
];
