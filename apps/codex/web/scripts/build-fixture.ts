/**
 * Brings the generated fixture corpus at `fixtures/entities/` up to date from its committed
 * inputs (`scripts/fixtureCorpus.ts`). Run via `pnpm --filter @astra/codex fixture`. Tests
 * and the Chromium guards do this themselves; a dev server without the real corpus needs it
 * once.
 */
import { ensureFixtureCorpus } from "./fixtureCorpus";

console.log(`fixture: ${ensureFixtureCorpus()} is up to date`);
