/**
 * Server fn that returns a transcript's (large) body HTML. Transcript bodies are
 * ~1 MB each (76 of them ≈ 115 MB total), far too big for the in-bundle BODIES
 * module, so the build code-splits one lazy module per session
 * (`@/generated/transcripts`). This `createServerFn` is the boundary: its handler
 * (and the dynamic-import map it pulls in) is stripped from the CLIENT bundle, so
 * the heavy chunks live only in the server build. Under this app's full-page
 * navigation the loader runs server-side, so the call executes inline at SSR.
 */
import { getLogger } from "@astra/observe";
import { createServerFn } from "@tanstack/react-start";

import { TRANSCRIPT_BODIES } from "@/generated/transcripts";

const log = getLogger("astra.akasha-frontend");

export const transcriptBody = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data }) => {
    const load = TRANSCRIPT_BODIES[data];
    if (!load) {
      // A request for a transcript slug with no code-split body — a stale link or a bad
      // slug. Returns "" (the route renders empty) but was previously silent to SigNoz.
      log.emit({ severityText: "WARN", body: `transcript body not found for slug: ${data}` });
      return "";
    }
    return (await load()).default;
  });
