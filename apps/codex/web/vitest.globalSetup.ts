import { ensureFixtureCorpus } from "@astra/codex-ingest/fixture";

// The fixture corpus every test reads is generated, not committed: build it once per run,
// before any test file loads (the ingest package's `src/fixtureCorpus.ts`).
export default function setup(): void {
  ensureFixtureCorpus();
}
