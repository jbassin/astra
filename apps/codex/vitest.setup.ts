import { fixtureCorpusRoot } from "./src/server/corpusFs";

// Every codex test reads the committed fixture corpus unless the caller pins another
// root, so results are the same on a host with the real corpus and in CI.
process.env.CODEX_CORPUS_ROOT ??= fixtureCorpusRoot();
