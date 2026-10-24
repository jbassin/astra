import { ensureFixtureCorpus } from "./src/fixtureCorpus";

// The fixture corpus is generated, not committed (`src/fixtureCorpus.ts`).
export default function setup(): void {
  ensureFixtureCorpus();
}
