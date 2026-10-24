// The TanStack Start server entry (found by name: `src/server.ts`). It wraps the default
// handler and checks the corpus when the server bundle loads, so a built server with a
// missing corpus, a corpus of another schema generation, or the fixture where the real
// corpus belongs throws here and the process exits before it listens. Never imported by
// client code.

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { servedCorpus } from "./server/corpusFs";

const corpus = servedCorpus();
// oxlint-disable-next-line no-console -- one startup line to stdout; codex has no OTel logger yet
console.info(
  `[codex] serving the corpus at "${corpus.root}" (source ${corpus.source}, ` +
    `${corpus.totalEntityCount} entities, schemaVersion ${corpus.schemaVersion}` +
    `${corpus.fixture ? ", fixture" : ""})`,
);

export default createServerEntry({
  fetch: (...args) => handler.fetch(...args),
});
