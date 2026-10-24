import { fixtureCorpusRoot } from "./src/server/corpusFs";

// Every codex test reads the generated fixture corpus (built by vitest.globalSetup.ts)
// unless the caller pins another root, so results are the same on a host with the real
// corpus and in CI.
process.env.CODEX_CORPUS_ROOT ??= fixtureCorpusRoot();
