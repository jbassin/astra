import { ensureFixtureCorpus } from "./scripts/fixtureCorpus";

// The fixture corpus every test reads is generated, not committed: build it once per run,
// before any test file loads (`scripts/fixtureCorpus.ts`).
export default function setup(): void {
  ensureFixtureCorpus();
}
