/// <reference types="vite/client" />
import type { ThemeMode } from "@astra/vellum-lang";

// Default to same-origin (empty base → POST to `/render`), which Caddy proxies to
// the vellum-render service in production (D2 — see sites.caddyfile). This is the
// safe default for the deployed bundle: a build that forgets the env var hits the
// right place. Local dev points at vellum-render's own port via the Vite proxy
// (slice 5) — same-origin still works because the proxy forwards /render.
const RENDER_URL = (import.meta.env.VITE_VELLUM_RENDER_URL as string | undefined) ?? "";

/** POST the document to the render service and get back a PNG blob. */
export async function requestPng(source: string, mode: ThemeMode, scale = 2): Promise<Blob> {
  const res = await fetch(`${RENDER_URL}/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, mode, scale }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `render failed (${res.status})`);
  }
  return res.blob();
}
