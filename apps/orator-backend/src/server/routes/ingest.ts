/**
 * YouTube ingest + upload API + SSE progress (lark B19–B22). Session-guarded.
 *
 * astra port: `repo.X(ctx.db, …)` → `await ctx.store.X(…)`; `ingest.start(…)` is
 * now async. The `/ingest/upload` route (lark had it in libraryRoutes) lives here.
 */

import { type ApiRoute, HttpError, intParam, json, readJson } from "../router";
import { handleUpload } from "../uploads";

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
} as const;

export const ingestRoutes: ApiRoute[] = [
  // Multipart upload ingest (B19).
  {
    method: "POST",
    path: "/api/v1/ingest/upload",
    handler: async (ctx) => {
      let form: FormData;
      try {
        form = await ctx.req.formData();
      } catch {
        throw new HttpError(400, "expected_multipart");
      }
      const files = form.getAll("files").filter((f): f is File => f instanceof File);
      if (files.length === 0) throw new HttpError(400, "no_files");
      const collectionRaw = form.get("collectionId");
      const collectionId = collectionRaw ? Number(collectionRaw) : null;
      const result = await handleUpload({
        store: ctx.store,
        dataDir: ctx.config.dataDir,
        files,
        collectionId,
        prober: ctx.services.prober,
      });
      return json(result, 201);
    },
  },

  // Kick off an import (single video or whole playlist). Returns immediately;
  // progress is observed via the job + its SSE stream (B22).
  {
    method: "POST",
    path: "/api/v1/ingest/youtube",
    handler: async (ctx) => {
      const ingest = ctx.services.ingest;
      if (!ingest) throw new HttpError(503, "ingest_unavailable");
      const body = await readJson<{ url?: string; collectionId?: number }>(ctx.req);
      if (!body.url?.trim()) throw new HttpError(400, "url_required");
      const { job, done } = await ingest.start(body.url.trim(), body.collectionId ?? undefined);
      // Run in the background; never block the request on the download.
      void done.catch((err) => console.error("[orator] ingest job failed", err));
      return json(job, 202);
    },
  },

  {
    method: "GET",
    path: "/api/v1/ingest/jobs",
    handler: async (ctx) => json(await ctx.store.listDownloadJobs()),
  },

  {
    method: "GET",
    path: "/api/v1/ingest/jobs/:id",
    handler: async (ctx) => {
      const id = intParam(ctx.params, "id");
      const job = await ctx.store.getDownloadJob(id);
      if (!job) throw new HttpError(404, "not_found");
      return json({ ...job, items: await ctx.store.listJobItems(id) });
    },
  },

  {
    method: "GET",
    path: "/api/v1/ingest/jobs/:id/events",
    handler: async (ctx) => {
      const id = intParam(ctx.params, "id");
      const hub = ctx.services.hub;
      if (!hub) throw new HttpError(503, "events_unavailable");
      if (!(await ctx.store.getDownloadJob(id))) throw new HttpError(404, "not_found");

      const encoder = new TextEncoder();
      let off: (() => void) | undefined;
      const store = ctx.store;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (frame: string) => {
            try {
              controller.enqueue(encoder.encode(frame));
            } catch {
              off?.();
            }
          };
          off = hub.subscribe(id, send);
          // Prime with the current snapshot so a late subscriber is in sync (B22).
          const snapshot = {
            job: await store.getDownloadJob(id),
            items: await store.listJobItems(id),
          };
          send(`data: ${JSON.stringify(snapshot)}\n\n`);
        },
        cancel() {
          off?.();
        },
      });
      return new Response(stream, { headers: SSE_HEADERS });
    },
  },
];
