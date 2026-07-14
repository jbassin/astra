import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  CodexEntitySchema,
  IndexRowSchema,
  type CodexEntity,
  type IndexRow,
} from "../../schema/entity";
import { type RenderCtx, rootRenderCtx } from "./nodes";

/**
 * Shared, deterministic loader for `apps/codex/fixtures/entities/` — used by
 * the totality test, the golden-regen script, and the golden byte-exact
 * test, so all three see the exact same entity set / embed resolver / trait
 * index (S1 is frontend-free: no corpus reader yet, D29-23 is S2's job).
 */

export const FIXTURE_ROOT = join(import.meta.dirname, "../../../fixtures/entities");

export function loadFixtureEntities(): CodexEntity[] {
  const entities: CodexEntity[] = [];
  for (const category of readdirSync(FIXTURE_ROOT).sort()) {
    const categoryDir = join(FIXTURE_ROOT, category);
    if (!statSync(categoryDir).isDirectory()) continue;
    for (const file of readdirSync(categoryDir).sort()) {
      if (file === "_index.json") continue;
      const raw = JSON.parse(readFileSync(join(categoryDir, file), "utf8"));
      entities.push(CodexEntitySchema.parse(raw));
    }
  }
  return entities;
}

export function loadTraitIndex(): ReadonlySet<string> {
  const path = join(FIXTURE_ROOT, "trait", "_index.json");
  const rows: IndexRow[] = JSON.parse(readFileSync(path, "utf8")).map((r: unknown) =>
    IndexRowSchema.parse(r),
  );
  return new Set(rows.map((r) => r.id));
}

export interface FixtureRenderEnv {
  entities: CodexEntity[];
  byId: ReadonlyMap<string, CodexEntity>;
  ctx: RenderCtx;
}

export function loadFixtureRenderEnv(): FixtureRenderEnv {
  const entities = loadFixtureEntities();
  const byId = new Map(entities.map((e) => [e.id, e] as const));
  const knownTraitIds = loadTraitIndex();
  const ctx = rootRenderCtx({ resolveEmbed: (targetId) => byId.get(targetId), knownTraitIds });
  return { entities, byId, ctx };
}

export function requireEntity(byId: ReadonlyMap<string, CodexEntity>, id: string): CodexEntity {
  const entity = byId.get(id);
  if (!entity) throw new Error(`fixtureLoader: required entity "${id}" not found in the fixture`);
  return entity;
}
