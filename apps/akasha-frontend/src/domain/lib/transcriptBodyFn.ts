/**
 * Server fn that returns a transcript's (large) body HTML. Transcript bodies are
 * ~1 MB each (76 of them ≈ 115 MB total), far too big for the in-bundle BODIES
 * module, so the build code-splits one lazy module per session
 * (`@/generated/transcripts`). This `createServerFn` is the boundary: its handler
 * (and the dynamic-import map it pulls in) is stripped from the CLIENT bundle, so
 * the heavy chunks live only in the server build. Under this app's full-page
 * navigation the loader runs server-side, so the call executes inline at SSR.
 */
import { createServerFn } from "@tanstack/react-start";
import { TRANSCRIPT_BODIES } from "@/generated/transcripts";

export const transcriptBody = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data }) => {
    const load = TRANSCRIPT_BODIES[data];
    if (!load) return "";
    return (await load()).default;
  });
