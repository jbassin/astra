// The TanStack Start server entry (found by name: `src/server.ts`). It wraps the default
// handler and checks the corpus when the server bundle loads, so a built server with no
// current release, a corpus of another schema generation, or the fixture where the real
// corpus belongs throws here and the process exits before it listens. Each request runs
// pinned to the release that is current when it starts (`withPinnedCorpus`), so a release
// switch never mixes two releases in one response. Never imported by client code.

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { describeServedCorpus, servedCorpus, withPinnedCorpus } from "./server/corpusFs";

// oxlint-disable-next-line no-console -- one startup line to stdout; codex has no OTel logger yet
console.info(`[codex] serving ${describeServedCorpus(servedCorpus())}`);

// `servedCorpus` rides on the handler object for the root `server.ts`: its `/pagefind/`
// redirect and `/healthz` must name the release THIS process serves, which can lag
// `current` (a release it refused, e.g. one of a newer schema generation).
export default Object.assign(
  createServerEntry({
    fetch: (...args) => withPinnedCorpus(() => handler.fetch(...args)),
  }),
  { servedCorpus },
);
