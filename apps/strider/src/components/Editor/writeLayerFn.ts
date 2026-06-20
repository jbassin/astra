import { createServerFn } from "@tanstack/react-start";
import { writeLayer } from "../../../scripts/writeLayer";

// Editor save endpoint as a TanStack Start server function — the idiomatic way to
// run server-only code in this stack (handled in dev and prod alike; the node:fs
// write + validation stay out of the client bundle). Replaces the old
// editor-server sidecar. The editor UI that calls this is gated to the local
// network at the Caddy edge.
export const writeLayerFn = createServerFn({ method: "POST" })
  .validator((data: { filename: string; content: string }) => data)
  .handler(({ data }) => {
    const result = writeLayer(data);
    if (!result.body.ok) throw new Error(result.body.error ?? "write failed");
    return result.body;
  });
