/**
 * Rebuilds the fixture corpus at `fixtures/entities/` from its committed inputs
 * (`scripts/fixtureCorpus.ts`). Run via `pnpm --filter @astra/codex fixture`.
 */
import { rmSync } from "node:fs";

import { buildFixtureCorpus, FIXTURE_CORPUS_DIR } from "./fixtureCorpus";

rmSync(FIXTURE_CORPUS_DIR, { recursive: true, force: true });
const { entityCount } = buildFixtureCorpus(FIXTURE_CORPUS_DIR);
console.log(`fixture: wrote ${entityCount} entities to ${FIXTURE_CORPUS_DIR}`);
