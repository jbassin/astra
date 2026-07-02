/**
 * Multipart upload ingest (lark B19). Stores each uploaded audio file under the
 * data dir, probes it (injected prober), and creates a `ready` track. The store
 * + DB logic is testable with a stub prober and a temp dir (no ffmpeg).
 *
 * astra port: `createTrack(db, …)` → `await store.createTrack(…)` (async store).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import type { LibraryStore, Track } from "../db/store";
import type { AudioProbe, AudioProber } from "../media/probe";

export interface UploadResult {
  created: Track[];
  errors: { name: string; error: string }[];
}

const AUDIO_EXTS = new Set([".mp3", ".flac", ".wav", ".ogg", ".opus", ".m4a", ".aac", ".webm"]);

/** Sanitize a display title from an uploaded filename (drop extension). */
export function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return base.replace(/[_]+/g, " ").trim() || name;
}

export async function handleUpload(opts: {
  store: LibraryStore;
  dataDir: string;
  files: File[];
  collectionId?: number | null;
  prober?: AudioProber;
}): Promise<UploadResult> {
  const audioDir = resolve(opts.dataDir, "audio");
  await mkdir(audioDir, { recursive: true });
  const result: UploadResult = { created: [], errors: [] };

  for (const file of opts.files) {
    try {
      const ext = (extname(file.name) || ".bin").toLowerCase();
      if (!AUDIO_EXTS.has(ext)) {
        result.errors.push({ name: file.name, error: `unsupported file type ${ext}` });
        continue;
      }
      const id = crypto.randomUUID();
      const dest = resolve(audioDir, `${id}${ext}`);
      // node:fs, not Bun.write (vitest workers are Node — no `Bun` global; the
      // production write-target is unchanged, R3/S8 does the rest of this file's
      // Bun-runtime exit — Bun.serve, ytdlp Bun.spawn).
      await writeFile(dest, Buffer.from(await file.arrayBuffer()));
      const probe: AudioProbe = opts.prober
        ? await opts.prober(dest).catch((): AudioProbe => ({}))
        : {};
      const track = await opts.store.createTrack({
        collectionId: opts.collectionId ?? null,
        title: titleFromFilename(file.name),
        originalTitle: file.name,
        sourceType: "upload",
        filePath: dest,
        format: probe.format ?? ext.slice(1),
        durationMs: probe.durationMs ?? null,
        fileSize: file.size,
        loudnessLufs: probe.loudnessLufs ?? null,
        status: "ready",
      });
      result.created.push(track);
    } catch (err) {
      result.errors.push({ name: file.name, error: (err as Error).message });
    }
  }
  return result;
}
