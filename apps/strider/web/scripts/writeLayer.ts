// Editor write-layer logic — folded out of the old standalone editor-server
// sidecar into the SSR server (strider is SSR now, so the authoring write API is
// just a same-origin route). Pure of any transport: takes the parsed request
// body, returns {status, body}; server.ts (Bun) and the vite dev middleware each
// adapt their own request/response shapes. Writes a new content/layers/*.kdl.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const LAYERS_DIR = path.resolve(process.cwd(), "content", "layers");
const FILENAME_RE = /^\d{4}-\d{2}-\d{2}T\d{6}-[a-z0-9-]+\.kdl$/;
const MAX_CONTENT_BYTES = 64 * 1024;

export interface WriteResult {
  status: number;
  body: { ok: boolean; error?: string; path?: string };
}

interface WriteRequest {
  filename: string;
  content: string;
}

function validate(
  body: unknown,
  layersDir: string,
): { ok: true; req: WriteRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;
  if (typeof b.filename !== "string") return { ok: false, error: "'filename' must be a string" };
  if (typeof b.content !== "string") return { ok: false, error: "'content' must be a string" };
  if (b.content.length === 0) return { ok: false, error: "'content' must be non-empty" };
  if (b.content.length > MAX_CONTENT_BYTES) {
    return { ok: false, error: `'content' exceeds ${MAX_CONTENT_BYTES} bytes` };
  }
  if (!FILENAME_RE.test(b.filename)) {
    return {
      ok: false,
      error: "'filename' must match ^\\d{4}-\\d{2}-\\d{2}T\\d{6}-[a-z0-9-]+\\.kdl$",
    };
  }
  const fullPath = path.resolve(layersDir, b.filename);
  if (!fullPath.startsWith(layersDir + path.sep)) {
    return { ok: false, error: "'filename' resolves outside content/layers" };
  }
  return { ok: true, req: { filename: b.filename, content: b.content } };
}

/**
 * Validate + write a layer file. Never overwrites (flag wx). `layersDir`
 * defaults to the real content/layers dir; tests pass a temp dir so the guard
 * logic is exercised without touching the repo's content.
 */
export function writeLayer(body: unknown, layersDir: string = LAYERS_DIR): WriteResult {
  const v = validate(body, layersDir);
  if (!v.ok) return { status: 400, body: { ok: false, error: v.error } };

  const target = path.join(layersDir, v.req.filename);
  if (existsSync(target)) {
    return {
      status: 409,
      body: { ok: false, error: `file already exists: content/layers/${v.req.filename}` },
    };
  }
  if (!existsSync(layersDir)) mkdirSync(layersDir, { recursive: true });

  try {
    writeFileSync(target, v.req.content, { encoding: "utf8", flag: "wx" });
  } catch (err) {
    return {
      status: 500,
      body: { ok: false, error: err instanceof Error ? err.message : "write failed" },
    };
  }

  // Pure of transport + telemetry: writeLayerFn wraps this in a span + log.
  return { status: 200, body: { ok: true, path: `content/layers/${v.req.filename}` } };
}
