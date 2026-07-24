import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import type { BlockNode, CodexNode } from "../schema/nodes";
import {
  assertNoHomebrewCollisions,
  countHomebrewUuidRefs,
  loadHomebrewSide,
  type HardFailure,
} from "./homebrew";
import { UuidIndex } from "./uuidResolve";

/**
 * Unit-level coverage for `loadHomebrewSide`/`assertNoHomebrewCollisions`/
 * `countHomebrewUuidRefs` (0030 S1, D30-42/-43/-46/-47) — the end-to-end
 * fixture-pipeline proof (real `@UUID` resolution against the official
 * `UuidIndex`, the report section, the negative-path collision throw) lives
 * in `scripts/transform.test.ts`'s "0030 S1" describe block instead, since
 * it needs the real committed Foundry fixture snapshot for a resolvable
 * `@UUID` target. This file exercises the loader/guard mechanics directly
 * against small hand-written temp-dir fixtures.
 */

function entity(
  overrides: Partial<CodexEntity> & Pick<CodexEntity, "id" | "category" | "slug" | "name">,
): CodexEntity {
  return {
    edition: "remaster",
    source: { book: "unknown", license: "unknown" },
    traits: [],
    body: [],
    facets: {},
    ...overrides,
  };
}

function collector(): {
  reports: Array<{ cls: string; detail: string }>;
  report: (cls: string, detail: string) => void;
} {
  const reports: Array<{ cls: string; detail: string }> = [];
  return { reports, report: (cls, detail) => reports.push({ cls, detail }) };
}

const tempDirs: string[] = [];
function freshHomebrewDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "codex-homebrew-unit-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeDoc(dir: string, basename: string, doc: Record<string, unknown>): void {
  writeFileSync(join(dir, `${basename}.json`), JSON.stringify(doc));
}

function plainSpellDoc(name: string, descriptionHtml = "<p>Test.</p>"): Record<string, unknown> {
  return {
    _id: "hbtest0000000001",
    name,
    type: "spell",
    system: {
      description: { value: descriptionHtml },
      level: { value: 1 },
      publication: { license: "OGL", remaster: true, title: "Liturgy of the Iridite Vol.2" },
      traits: { rarity: "common", traditions: ["arcane"], value: ["fire"] },
    },
  };
}

function ritualDoc(name: string): Record<string, unknown> {
  const doc = plainSpellDoc(name);
  (doc.system as Record<string, unknown>).ritual = {
    primary: { check: "Arcana (expert)" },
    secondary: { casters: 1, checks: "Crafting" },
  };
  return doc;
}

describe("loadHomebrewSide (D30-42)", () => {
  it("walks in sorted order regardless of filesystem write order", () => {
    const dir = freshHomebrewDir();
    // Written zzz, aaa, mmm — sorted output proves `walkFiles`'s own sort
    // guarantee flows through untouched.
    writeDoc(dir, "zzz-last", plainSpellDoc("Zzz Last"));
    writeDoc(dir, "aaa-first", plainSpellDoc("Aaa First"));
    writeDoc(dir, "mmm-middle", plainSpellDoc("Mmm Middle"));
    const { report } = collector();
    const result = loadHomebrewSide(dir, new UuidIndex(), report, []);
    expect(result.entities.map((e) => e.id)).toEqual([
      "spell/aaa-first",
      "spell/mmm-middle",
      "spell/zzz-last",
    ]);
  });

  it("D30-42: the store file basename IS the id/slug (not sluggify(name))", () => {
    const dir = freshHomebrewDir();
    writeDoc(dir, "fixture-doc", plainSpellDoc("Fixture Doc"));
    const { report } = collector();
    const result = loadHomebrewSide(dir, new UuidIndex(), report, []);
    expect(result.entities[0]?.id).toBe("spell/fixture-doc");
    expect(result.entities[0]?.slug).toBe("fixture-doc");
  });

  it("D30-43: a doc carrying system.ritual reroutes BOTH category and id to ritual/*; a plain doc does not", () => {
    const dir = freshHomebrewDir();
    writeDoc(dir, "a-ritual", ritualDoc("A Ritual"));
    writeDoc(dir, "a-plain-spell", plainSpellDoc("A Plain Spell"));
    const { report } = collector();
    const result = loadHomebrewSide(dir, new UuidIndex(), report, []);
    const ritual = result.entities.find((e) => e.slug === "a-ritual");
    const plain = result.entities.find((e) => e.slug === "a-plain-spell");
    expect(ritual?.category).toBe("ritual");
    expect(ritual?.id).toBe("ritual/a-ritual");
    expect(plain?.category).toBe("spell");
    expect(plain?.id).toBe("spell/a-plain-spell");
  });

  it("D30-46: slugMismatchCount increments exactly once per basename/sluggify(name) disagreement (possessive-apostrophe class)", () => {
    const dir = freshHomebrewDir();
    // sluggify() strips the apostrophe entirely ("almonks-drain"); the store
    // basename convention hyphenates it instead — a genuine disagreement.
    writeDoc(dir, "almonk-s-drain", plainSpellDoc("Almonk's Drain"));
    writeDoc(dir, "agreeing-doc", plainSpellDoc("Agreeing Doc"));
    const { reports, report } = collector();
    const result = loadHomebrewSide(dir, new UuidIndex(), report, []);
    expect(result.slugMismatchCount).toBe(1);
    expect(reports.filter((r) => r.cls === "slugMismatch")).toHaveLength(1);
  });

  it("pushes a malformed enricher grammar failure onto hardFailures instead of throwing", () => {
    const dir = freshHomebrewDir();
    writeDoc(dir, "bad-doc", plainSpellDoc("Bad Doc", "<p>@Bogus[foo]</p>"));
    const { report } = collector();
    const hardFailures: HardFailure[] = [];
    const result = loadHomebrewSide(dir, new UuidIndex(), report, hardFailures);
    expect(result.entities).toEqual([]);
    expect(hardFailures).toHaveLength(1);
    expect(hardFailures[0]?.path).toBe("bad-doc.json");
  });
});

describe("assertNoHomebrewCollisions (D30-43, M3-widened)", () => {
  it("does not throw when no homebrew id collides with anything official", () => {
    const foundryAssembled = new Map<string, CodexEntity>([
      ["spell/heal", entity({ id: "spell/heal", category: "spell", slug: "heal", name: "Heal" })],
    ]);
    const kept = [
      entity({ id: "spell/heal", category: "spell", slug: "heal", name: "Heal" }),
      entity({
        id: "spell/homebrew-x",
        category: "spell",
        slug: "homebrew-x",
        name: "Homebrew X",
      }),
    ];
    expect(() =>
      assertNoHomebrewCollisions(new Set(["spell/homebrew-x"]), foundryAssembled, kept),
    ).not.toThrow();
  });

  it("throws when a homebrew id collides with a pre-drop assembled official Foundry entity (even one later dropped)", () => {
    const foundryAssembled = new Map<string, CodexEntity>([
      ["boon/x", entity({ id: "boon/x", category: "boon", slug: "x", name: "X" })],
    ]);
    // The official boon was DROPPED (not present in `kept`) — the guard
    // still must catch the shadowing collision (the Gate-B drift vector).
    expect(() => assertNoHomebrewCollisions(new Set(["boon/x"]), foundryAssembled, [])).toThrow(
      /homebrew id "boon\/x" collides with a pre-drop assembled official Foundry entity/,
    );
  });

  it("throws when a homebrew id collides with a SURVIVING official corpus id (post-drop kept set)", () => {
    const foundryAssembled = new Map<string, CodexEntity>(); // e.g. an AoN-only official entity
    const kept = [
      entity({
        id: "spell/magic-missile",
        category: "spell",
        slug: "magic-missile",
        name: "Magic Missile",
      }),
      entity({
        id: "spell/magic-missile",
        category: "spell",
        slug: "magic-missile",
        name: "Homebrew Collider",
      }),
    ];
    expect(() =>
      assertNoHomebrewCollisions(new Set(["spell/magic-missile"]), foundryAssembled, kept),
    ).toThrow(/homebrew id "spell\/magic-missile" collides with a surviving official corpus id/);
  });
});

describe("countHomebrewUuidRefs (D30-46)", () => {
  function withBody(body: BlockNode[]): CodexEntity {
    return entity({ id: "spell/x", category: "spell", slug: "x", name: "X", body });
  }

  it("counts a resolved crossref and a brokenRef separately", () => {
    const crossref: CodexNode = {
      kind: "crossref",
      targetId: "condition/slowed",
      display: "Slowed",
    };
    const broken: CodexNode = { kind: "brokenRef", target: "condition/nope", display: "Nope" };
    const entities = [
      withBody([{ kind: "paragraph", children: [crossref as never] } as unknown as BlockNode]),
      withBody([{ kind: "paragraph", children: [broken as never] } as unknown as BlockNode]),
    ];
    expect(countHomebrewUuidRefs(entities)).toEqual({ resolved: 1, broken: 1 });
  });

  it("recurses into lists/tables/asides, not just top-level paragraphs", () => {
    const crossref: CodexNode = {
      kind: "crossref",
      targetId: "condition/clumsy",
      display: "Clumsy",
    };
    const nested: BlockNode = {
      kind: "list",
      ordered: false,
      items: [[{ kind: "paragraph", children: [crossref as never] } as unknown as BlockNode]],
    } as unknown as BlockNode;
    expect(countHomebrewUuidRefs([withBody([nested])])).toEqual({ resolved: 1, broken: 0 });
  });

  it("zero refs on a plain entity", () => {
    const plain: BlockNode = {
      kind: "paragraph",
      children: [{ kind: "text", content: "Nothing here.", marks: {} } as never],
    } as unknown as BlockNode;
    expect(countHomebrewUuidRefs([withBody([plain])])).toEqual({ resolved: 0, broken: 0 });
  });
});
