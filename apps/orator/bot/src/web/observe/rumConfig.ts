// The operator UI is a client-only SPA served as static `dist/` (M3) — it has no
// TanStack Start server boundary, so unlike the strider template (which resolves
// the RUM endpoint via a `createServerFn`), it fetches a small PUBLIC endpoint on
// orator-backend. The server reads it from config.kdl (config-single-source), so
// the endpoint never gets baked into the bundle.
export async function getRumEndpoint(): Promise<string | null> {
  try {
    const res = await fetch("/api/v1/rum-config", { credentials: "same-origin" });
    if (!res.ok) return null;
    const data = (await res.json()) as { endpoint?: string };
    return data.endpoint ?? null;
  } catch {
    return null;
  }
}
