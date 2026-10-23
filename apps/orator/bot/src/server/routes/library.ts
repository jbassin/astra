/**
 * Library CRUD + bulk ops API (lark B11–B19, §7 web superset). All routes are
 * session-guarded (mounted behind the auth check in the app, slice 4).
 *
 * astra port: every `repo.X(ctx.db, …)` became `await ctx.store.X(…)` (sync
 * `bun:sqlite` → async `LibraryStore`). The `/ingest/upload` route lives in the
 * ingest slice (5) — it needs the uploads handler + the audio prober.
 */
import { unlink } from "node:fs/promises";

import type { Track } from "../../db/store";
import { previewBulkRename, RenameError, type RenameOp } from "../../lib/rename";
import { type ApiCtx, type ApiRoute, HttpError, intParam, json, readJson } from "../router";

async function trackWithTags(ctx: ApiCtx, track: Track) {
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
  {
    method: "POST",
    path: "/api/v1/collections",
    handler: async (ctx) => {
      const body = await readJson<{ name?: string; ipOrGame?: string }>(ctx.req);
      if (!body.name?.trim()) throw new HttpError(400, "name_required");
      return json(
        await ctx.store.createCollection({
          name: body.name.trim(),
          ipOrGame: body.ipOrGame ?? null,
        }),
        201,
      );
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/collections/:id",
    handler: async (ctx) => {
      const id = intParam(ctx.params, "id");
      const body = await readJson<{ name?: string }>(ctx.req);
      if (!body.name?.trim()) throw new HttpError(400, "name_required");
      if (!(await ctx.store.renameCollection(id, body.name.trim())))
        throw new HttpError(404, "not_found");
      return json(await ctx.store.getCollection(id));
    },
  },
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
      const page = Math.max(Number(sp.get("page") ?? "1"), 1);
      const limit = Math.min(Math.max(Number(sp.get("limit") ?? "200"), 1), 500);
      const tracks = await ctx.store.listTracks({
        collectionId: sp.get("collection") ? Number(sp.get("collection")) : undefined,
        tagId: sp.get("tag") ? Number(sp.get("tag")) : undefined,
        q: sp.get("q") ?? undefined,
        limit,
        offset: (page - 1) * limit,
      });
      return json(await Promise.all(tracks.map((t) => trackWithTags(ctx, t))));
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
  {
    method: "PATCH",
    path: "/api/v1/tracks/:id",
    handler: async (ctx) => {
      const id = intParam(ctx.params, "id");
      const track = await ctx.store.getTrack(id);
      if (!track) throw new HttpError(404, "not_found");
      const body = await readJson<{ title?: string; collectionId?: number | null }>(ctx.req);
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
  },
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

  // Move selected tracks into a collection (or out, with collectionId: null), B15.
  {
    method: "POST",
    path: "/api/v1/tracks/bulk-move",
    handler: async (ctx) => {
      const body = await readJson<{ ids?: number[]; collectionId?: number | null }>(ctx.req);
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
  },

  // Bulk delete (rows + underlying files), B18.
  {
    method: "POST",
    path: "/api/v1/tracks/bulk-delete",
    handler: async (ctx) => {
      const body = await readJson<{ ids?: number[] }>(ctx.req);
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
  },

  // --- Bulk rename (B13): preview or apply ---
  {
    method: "POST",
    path: "/api/v1/tracks/bulk-rename",
    handler: async (ctx) => {
      const body = await readJson<{ ids?: number[]; ops?: RenameOp[]; preview?: boolean }>(ctx.req);
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
  },

  // --- Bulk tag / untag (B14) ---
  {
    method: "POST",
    path: "/api/v1/tracks/bulk-tag",
    handler: async (ctx) => {
      const body = await readJson<{ ids?: number[]; addTags?: string[]; removeTagIds?: number[] }>(
        ctx.req,
      );
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
  },

  // --- Tags ---
  { method: "GET", path: "/api/v1/tags", handler: async (ctx) => json(await ctx.store.listTags()) },
  {
    method: "POST",
    path: "/api/v1/tags",
    handler: async (ctx) => {
      const body = await readJson<{ name?: string; category?: string }>(ctx.req);
      if (!body.name?.trim()) throw new HttpError(400, "name_required");
      return json(await ctx.store.upsertTag(body.name, body.category ?? null), 201);
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/tags/:id",
    handler: async (ctx) => {
      const body = await readJson<{ name?: string; color?: string | null }>(ctx.req);
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
  },
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
  {
    method: "POST",
    path: "/api/v1/playlists",
    handler: async (ctx) => {
      const body = await readJson<{ name?: string }>(ctx.req);
      if (!body.name?.trim()) throw new HttpError(400, "name_required");
      return json(await ctx.store.createPlaylist(body.name.trim()), 201);
    },
  },
  {
    method: "GET",
    path: "/api/v1/playlists/:id",
    handler: async (ctx) => {
      const id = intParam(ctx.params, "id");
      const playlist = await ctx.store.getPlaylist(id);
      if (!playlist) throw new HttpError(404, "not_found");
      const trackIds = await ctx.store.playlistTrackIds(id);
      return json({ ...playlist, trackIds });
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/playlists/:id",
    handler: async (ctx) => {
      const id = intParam(ctx.params, "id");
      const body = await readJson<{
        name?: string;
        loopMode?: "none" | "track" | "playlist";
        shuffle?: boolean;
      }>(ctx.req);
      if (!(await ctx.store.updatePlaylist(id, body)) && !(await ctx.store.getPlaylist(id)))
        throw new HttpError(404, "not_found");
      return json(await ctx.store.getPlaylist(id));
    },
  },
  {
    method: "PUT",
    path: "/api/v1/playlists/:id/items",
    handler: async (ctx) => {
      const id = intParam(ctx.params, "id");
      if (!(await ctx.store.getPlaylist(id))) throw new HttpError(404, "not_found");
      const body = await readJson<{ trackIds?: number[] }>(ctx.req);
      if (!Array.isArray(body.trackIds)) throw new HttpError(400, "trackIds_required");
      await ctx.store.setPlaylistItems(id, body.trackIds);
      return json({ trackIds: await ctx.store.playlistTrackIds(id) });
    },
  },
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
