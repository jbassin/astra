/**
 * Library CRUD + bulk ops API (a superset of lark's web API). All routes are
 * session-guarded (mounted behind the auth check in the app).
 *
 * astra port: every `repo.X(ctx.db, …)` became `await ctx.store.X(…)` (sync
 * `bun:sqlite` → async `LibraryStore`). The `/ingest/upload` route lives in the
 * ingest slice (5) — it needs the uploads handler + the audio prober.
 */
import { unlink } from "node:fs/promises";

import { z } from "zod";

import type { PlaylistWithItems, TrackWithTags } from "../../api/types";
import type { Track } from "../../db/store";
import { previewBulkRename, RenameError, type RenameOp } from "../../lib/rename";
import { ids, INVALID_BODY, int, jsonBody, text } from "../bodies";
import {
  type ApiCtx,
  type ApiRoute,
  apiRoute,
  HttpError,
  intParam,
  json,
  optionalIntParam,
} from "../router";

async function trackWithTags(ctx: ApiCtx, track: Track): Promise<TrackWithTags> {
  return { ...track, tags: await ctx.store.tagsForTrack(track.id) };
}

export const libraryRoutes: ApiRoute[] = [
  { method: "GET", path: "/api/v1/me", handler: (ctx) => json({ uid: ctx.session.uid }) },

  // --- Collections ---
  {
    method: "GET",
    path: "/api/v1/collections",
    handler: async (ctx) => json(await ctx.store.listCollections()),
  },
  apiRoute({
    method: "POST",
    path: "/api/v1/collections",
    body: jsonBody(
      { name: text("name_required"), ipOrGame: z.string({ error: INVALID_BODY }).nullish() },
      "name_required",
    ),
    handler: async (ctx) => {
      const body = await ctx.body();
      if (!body.name?.trim()) throw new HttpError(400, "name_required");
      return json(
        await ctx.store.createCollection({
          name: body.name.trim(),
          ipOrGame: body.ipOrGame ?? null,
        }),
        201,
      );
    },
  }),
  apiRoute({
    method: "PATCH",
    path: "/api/v1/collections/:id",
    body: jsonBody({ name: text("name_required") }, "name_required"),
    handler: async (ctx) => {
      const id = intParam(ctx.params, "id");
      const body = await ctx.body();
      if (!body.name?.trim()) throw new HttpError(400, "name_required");
      if (!(await ctx.store.renameCollection(id, body.name.trim())))
        throw new HttpError(404, "not_found");
      return json(await ctx.store.getCollection(id));
    },
  }),
  {
    method: "DELETE",
    path: "/api/v1/collections/:id",
    handler: async (ctx) => {
      if (!(await ctx.store.deleteCollection(intParam(ctx.params, "id"))))
        throw new HttpError(404, "not_found");
      return new Response(null, { status: 204 });
    },
  },

  // --- Tracks ---
  {
    method: "GET",
    path: "/api/v1/tracks",
    handler: async (ctx) => {
      const sp = ctx.url.searchParams;
      const page = optionalIntParam(sp.get("page"), "page") ?? 1;
      const limit = Math.min(optionalIntParam(sp.get("limit"), "limit") ?? 200, 500);
      const tracks = await ctx.store.listTracks({
        collectionId: optionalIntParam(sp.get("collection"), "collection"),
        tagId: optionalIntParam(sp.get("tag"), "tag"),
        q: sp.get("q") ?? undefined,
        limit,
        offset: (page - 1) * limit,
      });
      // One tags query for the whole page, not one per track.
      const tags = await ctx.store.tagsForTracks(tracks.map((t) => t.id));
      const body: TrackWithTags[] = tracks.map((t) =>
        Object.assign(t, { tags: tags.get(t.id) ?? [] }),
      );
      return json(body);
    },
  },
  {
    method: "GET",
    path: "/api/v1/tracks/:id",
    handler: async (ctx) => {
      const track = await ctx.store.getTrack(intParam(ctx.params, "id"));
      if (!track) throw new HttpError(404, "not_found");
      return json(await trackWithTags(ctx, track));
    },
  },
  apiRoute({
    method: "PATCH",
    path: "/api/v1/tracks/:id",
    body: jsonBody({ title: text("title_required"), collectionId: int().nullable().optional() }),
    handler: async (ctx) => {
      const id = intParam(ctx.params, "id");
      const track = await ctx.store.getTrack(id);
      if (!track) throw new HttpError(404, "not_found");
      const body = await ctx.body();
      if (body.title !== undefined) {
        if (!body.title.trim()) throw new HttpError(400, "title_required");
        await ctx.store.updateTrackTitle(id, body.title.trim());
      }
      if (body.collectionId !== undefined)
        await ctx.store.setTrackCollection(id, body.collectionId);
      const updated = await ctx.store.getTrack(id);
      if (!updated) throw new HttpError(404, "not_found");
      return json(await trackWithTags(ctx, updated));
    },
  }),
  {
    method: "DELETE",
    path: "/api/v1/tracks/:id",
    handler: async (ctx) => {
      const removed = await ctx.store.deleteTrack(intParam(ctx.params, "id"));
      if (!removed) throw new HttpError(404, "not_found");
      if (removed.filePath) await unlink(removed.filePath).catch(() => {});
      return new Response(null, { status: 204 });
    },
  },

  // Move selected tracks into a collection (or out, with collectionId: null).
  apiRoute({
    method: "POST",
    path: "/api/v1/tracks/bulk-move",
    body: jsonBody(
      { ids: ids("ids_required").optional(), collectionId: int().nullish() },
      "ids_required",
    ),
    handler: async (ctx) => {
      const body = await ctx.body();
      if (!Array.isArray(body.ids) || body.ids.length === 0)
        throw new HttpError(400, "ids_required");
      const collectionId = body.collectionId ?? null;
      if (collectionId !== null && !(await ctx.store.getCollection(collectionId)))
        throw new HttpError(404, "collection_not_found");
      let moved = 0;
      for (const id of body.ids)
        moved += (await ctx.store.setTrackCollection(id, collectionId)) ? 1 : 0;
      return json({ moved });
    },
  }),

  // Bulk delete (rows + underlying files).
  apiRoute({
    method: "POST",
    path: "/api/v1/tracks/bulk-delete",
    body: jsonBody({ ids: ids("ids_required").optional() }, "ids_required"),
    handler: async (ctx) => {
      const body = await ctx.body();
      if (!Array.isArray(body.ids) || body.ids.length === 0)
        throw new HttpError(400, "ids_required");
      let deleted = 0;
      for (const id of body.ids) {
        const removed = await ctx.store.deleteTrack(id);
        if (removed) {
          deleted++;
          if (removed.filePath) await unlink(removed.filePath).catch(() => {});
        }
      }
      return json({ deleted });
    },
  }),

  // --- Bulk rename: preview or apply ---
  apiRoute({
    method: "POST",
    path: "/api/v1/tracks/bulk-rename",
    body: jsonBody(
      {
        ids: ids("ids_and_ops_required").optional(),
        // Each op is checked by previewBulkRename, which answers its own 400.
        ops: z.array(z.custom<RenameOp>(), { error: "ids_and_ops_required" }).optional(),
        preview: z.boolean({ error: INVALID_BODY }).optional(),
      },
      "ids_and_ops_required",
    ),
    handler: async (ctx) => {
      const body = await ctx.body();
      if (!Array.isArray(body.ids) || !Array.isArray(body.ops))
        throw new HttpError(400, "ids_and_ops_required");
      const fetched = await Promise.all(body.ids.map((id) => ctx.store.getTrack(id)));
      const items = fetched
        .filter((t): t is Track => t !== null)
        .map((t) => ({ id: t.id, title: t.title }));
      let rows: ReturnType<typeof previewBulkRename>;
      try {
        rows = previewBulkRename(items, body.ops);
      } catch (err) {
        if (err instanceof RenameError) throw new HttpError(400, err.message);
        throw err;
      }
      if (body.preview) return json({ preview: rows });
      const applied = await ctx.store.bulkUpdateTitles(
        rows.filter((r) => r.changed).map((r) => ({ id: r.id, title: r.to })),
      );
      return json({ applied });
    },
  }),

  // --- Bulk tag / untag ---
  apiRoute({
    method: "POST",
    path: "/api/v1/tracks/bulk-tag",
    body: jsonBody(
      {
        ids: ids("ids_required").optional(),
        addTags: z.array(z.string({ error: INVALID_BODY }), { error: INVALID_BODY }).optional(),
        removeTagIds: ids().optional(),
      },
      "ids_required",
    ),
    handler: async (ctx) => {
      const body = await ctx.body();
      if (!Array.isArray(body.ids) || body.ids.length === 0)
        throw new HttpError(400, "ids_required");
      let added = 0;
      let removed = 0;
      if (body.addTags?.length) {
        const tagIds = await Promise.all(
          body.addTags.map(async (name) => (await ctx.store.upsertTag(name)).id),
        );
        added = await ctx.store.addTagsToTracks(body.ids, tagIds);
      }
      if (body.removeTagIds?.length)
        removed = await ctx.store.removeTagsFromTracks(body.ids, body.removeTagIds);
      return json({ added, removed });
    },
  }),

  // --- Tags ---
  { method: "GET", path: "/api/v1/tags", handler: async (ctx) => json(await ctx.store.listTags()) },
  apiRoute({
    method: "POST",
    path: "/api/v1/tags",
    body: jsonBody(
      { name: text("name_required"), category: z.string({ error: INVALID_BODY }).nullish() },
      "name_required",
    ),
    handler: async (ctx) => {
      const body = await ctx.body();
      if (!body.name?.trim()) throw new HttpError(400, "name_required");
      return json(await ctx.store.upsertTag(body.name, body.category ?? null), 201);
    },
  }),
  apiRoute({
    method: "PATCH",
    path: "/api/v1/tags/:id",
    body: jsonBody({
      name: text("name_required"),
      color: z.string({ error: "invalid_color" }).nullable().optional(),
    }),
    handler: async (ctx) => {
      const body = await ctx.body();
      if (body.name !== undefined && !body.name.trim()) throw new HttpError(400, "name_required");
      // color: null clears it; a string must be #rrggbb.
      if (
        body.color !== undefined &&
        body.color !== null &&
        !/^#[0-9a-fA-F]{6}$/.test(body.color)
      ) {
        throw new HttpError(400, "invalid_color");
      }
      const updated = await ctx.store.updateTag(intParam(ctx.params, "id"), {
        name: body.name?.trim(),
        color: body.color,
      });
      if (!updated) throw new HttpError(404, "not_found");
      return json(updated);
    },
  }),
  {
    method: "DELETE",
    path: "/api/v1/tags/:id",
    handler: async (ctx) => {
      if (!(await ctx.store.deleteTag(intParam(ctx.params, "id"))))
        throw new HttpError(404, "not_found");
      return new Response(null, { status: 204 });
    },
  },

  // --- Playlists ---
  {
    method: "GET",
    path: "/api/v1/playlists",
    handler: async (ctx) => json(await ctx.store.listPlaylists()),
  },
  apiRoute({
    method: "POST",
    path: "/api/v1/playlists",
    body: jsonBody({ name: text("name_required") }, "name_required"),
    handler: async (ctx) => {
      const body = await ctx.body();
      if (!body.name?.trim()) throw new HttpError(400, "name_required");
      return json(await ctx.store.createPlaylist(body.name.trim()), 201);
    },
  }),
  {
    method: "GET",
    path: "/api/v1/playlists/:id",
    handler: async (ctx) => {
      const id = intParam(ctx.params, "id");
      const playlist = await ctx.store.getPlaylist(id);
      if (!playlist) throw new HttpError(404, "not_found");
      const body: PlaylistWithItems = {
        ...playlist,
        trackIds: await ctx.store.playlistTrackIds(id),
      };
      return json(body);
    },
  },
  apiRoute({
    method: "PATCH",
    path: "/api/v1/playlists/:id",
    body: jsonBody({
      name: text(),
      loopMode: z.enum(["none", "track", "playlist"], { error: INVALID_BODY }).optional(),
      shuffle: z.boolean({ error: INVALID_BODY }).optional(),
    }),
    handler: async (ctx) => {
      const id = intParam(ctx.params, "id");
      const body = await ctx.body();
      if (!(await ctx.store.updatePlaylist(id, body)) && !(await ctx.store.getPlaylist(id)))
        throw new HttpError(404, "not_found");
      return json(await ctx.store.getPlaylist(id));
    },
  }),
  apiRoute({
    method: "PUT",
    path: "/api/v1/playlists/:id/items",
    body: jsonBody({ trackIds: ids("trackIds_required").optional() }, "trackIds_required"),
    handler: async (ctx) => {
      const id = intParam(ctx.params, "id");
      if (!(await ctx.store.getPlaylist(id))) throw new HttpError(404, "not_found");
      const body = await ctx.body();
      if (!Array.isArray(body.trackIds)) throw new HttpError(400, "trackIds_required");
      await ctx.store.setPlaylistItems(id, body.trackIds);
      return json({ trackIds: await ctx.store.playlistTrackIds(id) });
    },
  }),
  {
    method: "DELETE",
    path: "/api/v1/playlists/:id",
    handler: async (ctx) => {
      if (!(await ctx.store.deletePlaylist(intParam(ctx.params, "id"))))
        throw new HttpError(404, "not_found");
      return new Response(null, { status: 204 });
    },
  },
];
