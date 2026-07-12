import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type {
  PlayerFeatsSection,
  PlayerInventorySection,
  PlayerNotesSection,
  PlayerSkillsSection,
  PlayerSpellcastingEntryGroup,
  PlayerSpellRow,
  PlayerSpellsSection,
  PlayerStatsSection,
  PlayerSummarySection,
  QueryItemResult,
  QueryPartyResult,
  QueryRollsResult,
} from "@astra/portal-shared";
import { describe, expect, it } from "vitest";

import {
  htmlToMarkdown,
  renderQueryItem,
  renderQueryParty,
  renderQueryPlayer,
  renderQueryRolls,
} from "./markdown";

/** The same committed, live-derived Argyle fixture the module's `handlers.test.ts`
 * uses (0028 S2 provenance: a real `Actor.toObject()` pulled read-only through the
 * live bridge 2026-07-11 — the worst-case-scale PC, 196 spells / 39 feats). Loaded
 * here too so this file can (a) pull REAL HTML samples for the golden
 * `htmlToMarkdown` tests and (b) measure a REAL rendered-markdown size for the D28-11
 * cap, as the spec requires — portal-server has no dependency on portal-module (the
 * two packages are deliberately disjoint), so this mirrors `handlers.ts`'s
 * `buildSpells`/`buildFeats` grouping logic locally rather than importing it. */
function loadArgyleFixture(): { uuid: string; document: Record<string, unknown> } {
  const path = fileURLToPath(new URL("../../module/tests/fixtures/argyle.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as {
    uuid: string;
    document: Record<string, unknown>;
  };
}

/** Mirrors `handlers.ts`'s `buildSpells` (module-side, Foundry-ambient, not
 * importable here) closely enough to drive a REAL D28-11 size measurement against
 * Argyle's actual 196 spells — not synthetic data. */
function buildSpellsSectionFromFixture(document: Record<string, unknown>): PlayerSpellsSection {
  const items = document.items as Record<string, unknown>[];
  const entryItems = items.filter((i) => i.type === "spellcastingEntry");
  const spellItems = items.filter((i) => i.type === "spell");
  const entries: PlayerSpellcastingEntryGroup[] = entryItems.map((entry) => {
    const entryId = String(entry._id);
    const esys = entry.system as Record<string, unknown>;
    const slotsObj = (esys.slots ?? {}) as Record<string, unknown>;
    const rankGroups = new Map<number, PlayerSpellRow[]>();
    for (const spell of spellItems) {
      const ssys = spell.system as Record<string, unknown>;
      const location = (ssys.location as Record<string, unknown> | undefined)?.value;
      if (location !== entryId) continue;
      const spellId = String(spell._id);
      let slotRank: number | undefined;
      let expended = false;
      for (const [slotKey, slotVal] of Object.entries(slotsObj)) {
        const match = /^slot(\d+)$/.exec(slotKey);
        if (!match?.[1]) continue;
        const prepared = ((slotVal as Record<string, unknown>).prepared ?? []) as Record<
          string,
          unknown
        >[];
        const hit = prepared.find((p) => p.id === spellId);
        if (hit) {
          slotRank = Number(match[1]);
          expended = hit.expended === true;
        }
      }
      const ownRank = Number((ssys.level as Record<string, unknown> | undefined)?.value ?? 0);
      const rank = slotRank ?? ownRank;
      const traits = ((ssys.traits as Record<string, unknown> | undefined)?.value ??
        []) as string[];
      const bucket = rankGroups.get(rank) ?? [];
      bucket.push({
        id: spellId,
        name: String(spell.name),
        rank,
        traits,
        prepared: slotRank !== undefined,
        expended: slotRank !== undefined ? expended : undefined,
      });
      rankGroups.set(rank, bucket);
    }
    const ranks = Array.from(rankGroups.entries())
      .sort(([a], [b]) => a - b)
      .map(([rank, spells]) => {
        const slot = slotsObj[`slot${rank}`] as Record<string, unknown> | undefined;
        const slots =
          slot && typeof slot.max === "number"
            ? { value: Number(slot.value ?? 0), max: slot.max }
            : undefined;
        return { rank, slots, spells };
      });
    return {
      entryId,
      entryName: String(entry.name),
      tradition: (esys.tradition as Record<string, unknown> | undefined)?.value as
        | string
        | undefined,
      preparedType: (esys.prepared as Record<string, unknown> | undefined)?.value as
        | string
        | undefined,
      dc: (esys.spelldc as Record<string, unknown> | undefined)?.dc as number | undefined,
      ranks,
    };
  });
  return { section: "spells", entries };
}

function buildFeatsSectionFromFixture(document: Record<string, unknown>): PlayerFeatsSection {
  const items = document.items as Record<string, unknown>[];
  const feats = items
    .filter((i) => i.type === "feat")
    .map((f) => {
      const fsys = f.system as Record<string, unknown>;
      return {
        id: String(f._id),
        name: String(f.name),
        category: (fsys.category as string | undefined) ?? "other",
        level: (fsys.level as Record<string, unknown> | undefined)?.value as number | undefined,
      };
    });
  feats.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      (a.level ?? 0) - (b.level ?? 0) ||
      a.name.localeCompare(b.name),
  );
  return { section: "feats", feats };
}

describe("htmlToMarkdown (D28-6) — golden tests over real Argyle HTML samples", () => {
  it("strips <p>/<hr>/<strong> and never leaves raw HTML for a spell description", () => {
    // "Ancient Dust" — a real spell description from the Argyle fixture, chosen for
    // its <hr>-separated degree-of-success block and <strong> tags.
    const html =
      "<p>You cough up a cloud of gray soil. Each creature in the area takes void damage " +
      "equal to your spellcasting modifier.</p>\n<hr />\n<p><strong>Critical Success</strong> " +
      "The creature is unaffected.</p>\n<p><strong>Success</strong> The creature takes half " +
      "damage.</p>";
    const md = htmlToMarkdown(html);
    expect(md).not.toMatch(/<[a-z][\s\S]*>/i);
    expect(md).toContain("You cough up a cloud of gray soil.");
    expect(md).toContain("---");
    expect(md).toContain("**Critical Success**");
    expect(md).toContain("**Success**");
  });

  it("translates a labeled @UUID enricher to its label, dropping the compendium path", () => {
    // A real fragment from the Argyle fixture's "Breastplate" armor description.
    const html =
      "<p>Though referred to as a breastplate, this type of armor consists of several " +
      "pieces of plate or @UUID[Compendium.pf2e.equipment-srd.Item.pRoikbRo5HFW6YUB]" +
      "{Half Plate} armor that protect the torso.</p>";
    const md = htmlToMarkdown(html);
    expect(md).not.toMatch(/<[a-z][\s\S]*>/i);
    expect(md).not.toContain("@UUID");
    expect(md).not.toContain("Compendium.pf2e");
    expect(md).toContain("Half Plate");
  });

  it("handles a nested-bracket @Damage enricher (a real Argyle 'Restorative Familiar' fragment)", () => {
    const html =
      "<p>It restores a number of Hit Points equal to " +
      "@Damage[(max(floor(@actor.level/2),1))d8[healing]]{1d8 times half your level} " +
      "(minimum 1d8).</p>";
    const md = htmlToMarkdown(html);
    expect(md).not.toMatch(/<[a-z][\s\S]*>/i);
    expect(md).toContain("1d8 times half your level");
  });

  it("converts <h2> headings and multiple paragraphs (a real Argyle 'Deity (Cleric)' feat fragment)", () => {
    const html =
      "<p>As a cleric, you are a mortal servitor of a deity you revere above all others.</p>" +
      "<h2>Sanctification</h2>" +
      "<p>Depending on your deity, their sanctification can make you holy or unholy.</p>" +
      "<h2>Anathema</h2>" +
      "<p>Acts fundamentally opposed to your deity's ideals are anathema to your faith.</p>";
    const md = htmlToMarkdown(html);
    expect(md).not.toMatch(/<[a-z][\s\S]*>/i);
    expect(md).toContain("## Sanctification");
    expect(md).toContain("## Anathema");
    expect(md).toContain("mortal servitor of a deity");
  });

  it("decodes HTML entities and collapses runs of blank lines", () => {
    const md = htmlToMarkdown("<p>Tom &amp; Jerry</p>\n\n\n\n<p>&quot;quoted&quot;</p>");
    expect(md).toBe('Tom & Jerry\n\n"quoted"');
  });

  it("strips an unrecognized tag to its inner text (the lossy-but-safe backstop)", () => {
    const md = htmlToMarkdown('<div class="weird"><span data-x="1">plain text</span></div>');
    expect(md).not.toMatch(/<[a-z][\s\S]*>/i);
    expect(md).toBe("plain text");
  });

  it("returns an empty string for empty/undefined input", () => {
    expect(htmlToMarkdown("")).toBe("");
  });
});

describe("renderQueryParty (D28-4)", () => {
  it("renders a PC table + a labeled companion row", () => {
    const result: QueryPartyResult = {
      partyName: "The Party",
      pcs: [
        {
          uuid: "Actor.a1",
          id: "a1",
          name: "Argyle",
          level: 8,
          hp: { value: 100, max: 120 },
          heroPoints: { value: 1, max: 3 },
          ancestry: "Elf",
          className: "Cleric",
          ownerPlayer: "PlayerOne",
        },
      ],
      companions: [
        { uuid: "Actor.o1", id: "o1", name: "Othello", type: "familiar", master: "Anzu" },
      ],
    };
    const md = renderQueryParty(result);
    expect(md).toContain("# The Party");
    expect(md).toContain("Argyle");
    expect(md).toContain("100/120");
    expect(md).toContain("Elf");
    expect(md).toContain("Cleric");
    expect(md).toContain("PlayerOne");
    expect(md).toContain("Othello (familiar, master: Anzu)");
  });

  it("renders '—' placeholders for a PC row with missing fields (fail-soft)", () => {
    const result: QueryPartyResult = {
      pcs: [{ uuid: "Actor.a1", id: "a1", name: "Anzu" }],
      companions: [],
    };
    const md = renderQueryParty(result);
    expect(md).toContain("Party Roster"); // no partyName -> the fallback title
    expect(md).toContain("Anzu");
    expect(md).toMatch(/\|\s*—\s*\|/);
  });
});

describe("renderQueryPlayer — summary/stats/skills/inventory/notes", () => {
  it("summary", () => {
    const s: PlayerSummarySection = {
      section: "summary",
      uuid: "Actor.a1",
      id: "a1",
      name: "Argyle",
      actorType: "character",
      level: 8,
      hp: { value: 100, max: 120, temp: 0 },
      heroPoints: { value: 1, max: 3 },
      ancestry: "Elf",
      className: "Cleric",
      deity: "The Judge of Ages",
      languages: ["chthonian"],
      alliance: "party",
    };
    const md = renderQueryPlayer(s, {});
    expect(md).toContain("# Argyle");
    expect(md).toContain("Level 8");
    expect(md).toContain("HP: 100/120");
    expect(md).toContain("Hero Points: 1/3");
    expect(md).toContain("Deity: The Judge of Ages");
  });

  it("stats — missing fields render as '—' and a fail-soft note is included", () => {
    const s: PlayerStatsSection = {
      section: "stats",
      ac: 21,
      perception: { value: 11, dc: 21 },
      saves: [
        { type: "fortitude", value: 8, dc: 18 },
        { type: "reflex", value: undefined, dc: undefined },
        { type: "will", value: 11, dc: 21 },
      ],
      abilityMods: { str: 1, wis: 4 },
      classDC: { value: 27, rank: 3 },
      spellDC: { value: undefined },
      warnings: ['query-player stats: missing/invalid derived path "system.spellDC.value"'],
    };
    const md = renderQueryPlayer(s, {});
    expect(md).toContain("AC: 21");
    expect(md).toContain("Reflex: — (DC —)");
    expect(md).toContain("WIS: +4");
    expect(md).toContain("Spell DC: —");
    expect(md).toContain("1 derived field(s) could not be read");
    // Player feedback fast-follow: the rank NAME alongside the number.
    expect(md).toContain("Class DC: 27 (Master)");
  });

  it("stats — an out-of-range classDC.rank falls back to the bare number", () => {
    const s: PlayerStatsSection = {
      section: "stats",
      perception: { value: undefined, dc: undefined },
      saves: [],
      abilityMods: {},
      classDC: { value: 10, rank: 9 },
      spellDC: { value: undefined },
      warnings: [],
    };
    const md = renderQueryPlayer(s, {});
    expect(md).toContain("Class DC: 10 (rank 9)");
  });

  it("skills", () => {
    const s: PlayerSkillsSection = {
      section: "skills",
      skills: [
        { slug: "religion", label: "Religion", rank: 3, value: 12, dc: 22, lore: false },
        { slug: "scribing", label: "Scribing", rank: 2, value: 8, dc: 18, lore: true },
      ],
    };
    const md = renderQueryPlayer(s, {});
    expect(md).toContain("Religion");
    expect(md).toContain("Scribing (lore)");
    // Player feedback fast-follow: skills show BOTH the rank name and the number.
    expect(md).toContain("Master (3)");
    expect(md).toContain("Expert (2)");
  });

  it("inventory", () => {
    const s: PlayerInventorySection = {
      section: "inventory",
      items: [
        {
          id: "i1",
          name: "Breastplate",
          type: "armor",
          carryType: "worn",
          invested: true,
          bulk: 2,
        },
      ],
    };
    const md = renderQueryPlayer(s, {});
    expect(md).toContain("Breastplate (bulk 2, worn, invested)");
  });

  it("notes renders HTML biography prose as markdown", () => {
    const s: PlayerNotesSection = {
      section: "notes",
      deity: "The Judge of Ages",
      backstory: "<p>Raised in the <strong>Cathedral</strong>.</p>",
    };
    const md = renderQueryPlayer(s, {});
    expect(md).toContain("**Deity:** The Judge of Ages");
    expect(md).toContain("## Backstory");
    expect(md).toContain("**Cathedral**");
    expect(md).not.toMatch(/<[a-z][\s\S]*>/i);
  });

  it("notes renders a 'no notes' placeholder when everything is empty", () => {
    const md = renderQueryPlayer({ section: "notes" }, {});
    expect(md).toContain("No notes recorded");
  });
});

describe("D28-11 hard 12,000-char cap — measured against the real Argyle fixture", () => {
  const { document } = loadArgyleFixture();

  it("feats (39 real feats) render in full, comfortably under the cap", () => {
    const section = buildFeatsSectionFromFixture(document);
    expect(section.feats).toHaveLength(39);
    const md = renderQueryPlayer(section, {});
    expect(md).not.toContain("summary — the full render exceeded");
    expect(md.length).toBeLessThan(12_000);
  });

  it("spells (196 real spells, 189 linked to the 2 entries): an UNFILTERED request always gets the group summary (D28-11 as amended 2026-07-11)", () => {
    const section = buildSpellsSectionFromFixture(document);
    const totalSpells = section.entries.reduce(
      (n, e) => n + e.ranks.reduce((m, r) => m + r.spells.length, 0),
      0,
    );
    // 7 of Argyle's 196 spell items carry no system.location.value at all (verified:
    // unlinked to either spellcasting entry — e.g. a scroll's embedded spell) and
    // correctly never appear under any entry — the module's buildSpells groups by
    // entry, it doesn't invent a bucket for orphaned spells.
    expect(totalSpells).toBe(189);

    const md = renderQueryPlayer(section, {});
    expect(md.length).toBeLessThan(12_000);
    // Default-summary, not a cap fallback: neutral header + the drill-down hint.
    expect(md).toContain("# Spells (summary)");
    expect(md).not.toContain("exceeded the size limit");
    expect(md).toContain("Re-query query-player");
    expect(md).not.toMatch(/<[a-z][\s\S]*>/i);
  });

  it("a broad FILTERED spells render that still exceeds the cap falls back to the summary with the over-cap wording", () => {
    // Simulate a filter broad enough to match everything (the module filters
    // module-side; the server only sees the echoed params) — Argyle's own 189-spell
    // full render measures ABOVE the cap (verified: ~12.4-13.5 KB depending on
    // trait/slot-label overhead) — this real actor is the case the cap backstop
    // exists for, not a synthetic worst case.
    const section = buildSpellsSectionFromFixture(document);
    const md = renderQueryPlayer(section, { entry: "spells" });
    expect(md.length).toBeLessThan(12_000);
    expect(md).toContain("summary — the full render exceeded");
    expect(md).toContain("Narrow further");
  });

  it("the entry/rank-filtered spells render (post-filter, module-side) stays comfortably under the cap", () => {
    const section = buildSpellsSectionFromFixture(document);
    const filtered = {
      ...section,
      entries: section.entries.filter((e) => e.entryName === "Cleric Font"),
    };
    const md = renderQueryPlayer(filtered, { entry: "Cleric Font" });
    expect(md).not.toContain("summary — the full render exceeded");
    expect(md.length).toBeLessThan(12_000);
  });
});

describe("renderQueryItem (0028 S3, D28-5/D28-6)", () => {
  it("renders a provenance-labeled hit list, never a single item even for one hit", () => {
    const result: QueryItemResult = {
      kind: "hits",
      hits: [
        { uuid: "Item.w1", id: "w1", name: "Dagger", type: "weapon", provenance: "world" },
        {
          uuid: "Actor.a1.Item.i1",
          id: "i1",
          name: "Holy Symbol",
          type: "equipment",
          provenance: "embedded",
          ownerActor: "Argyle",
        },
        {
          uuid: "Compendium.pf2e.spells-srd.Item.s1",
          id: "s1",
          name: "Fireball",
          type: "spell",
          provenance: "compendium",
          pack: "pf2e.spells-srd",
          packLabel: "Spells",
        },
      ],
    };
    const md = renderQueryItem(result);
    expect(md).toContain("# Item Search");
    expect(md).toContain("Dagger");
    expect(md).toContain("world");
    expect(md).toContain("embedded (Argyle)");
    expect(md).toContain("compendium — Spells");
    expect(md).toContain("Fetch one item's full detail");
  });

  it("renders an empty hit list without crashing", () => {
    const md = renderQueryItem({ kind: "hits", hits: [] });
    expect(md).toContain("No items matched");
  });

  it("renders a single item's full detail, HTML description -> markdown, never raw HTML", () => {
    const result: QueryItemResult = {
      kind: "item",
      item: {
        uuid: "Item.w1",
        id: "w1",
        name: "Bastard Sword",
        type: "weapon",
        provenance: "world",
        level: 0,
        traits: ["two-hand-d12"],
        rarity: "common",
        price: "4 gp",
        bulk: 1,
        damage: "1d8 slashing",
        description: "<p>A <strong>fine</strong> blade.</p>",
      },
    };
    const md = renderQueryItem(result);
    expect(md).toContain("# Bastard Sword");
    expect(md).toContain("weapon");
    expect(md).toContain("common");
    expect(md).toContain("Traits: two-hand-d12");
    expect(md).toContain("Price: 4 gp");
    expect(md).toContain("Bulk: 1");
    expect(md).toContain("Damage: 1d8 slashing");
    expect(md).toContain("**fine**");
    expect(md).not.toMatch(/<[a-z][\s\S]*>/i);
  });

  it("labels a compendium item's source with its pack", () => {
    const result: QueryItemResult = {
      kind: "item",
      item: {
        uuid: "Compendium.pf2e.spells-srd.Item.s1",
        id: "s1",
        name: "Fireball",
        type: "spell",
        provenance: "compendium",
        pack: "pf2e.spells-srd",
        packLabel: "Spells (SRD)",
      },
    };
    const md = renderQueryItem(result);
    expect(md).toContain("Source: compendium — Spells (SRD)");
  });

  it("labels an embedded item's owner", () => {
    const result: QueryItemResult = {
      kind: "item",
      item: {
        uuid: "Actor.a1.Item.i1",
        id: "i1",
        name: "Holy Symbol",
        type: "equipment",
        provenance: "embedded",
        ownerActor: "Argyle",
      },
    };
    const md = renderQueryItem(result);
    expect(md).toContain("Source: embedded (Argyle)");
  });

  it("truncates an oversized description rather than dropping the structured fields above it", () => {
    const result: QueryItemResult = {
      kind: "item",
      item: {
        uuid: "Item.w1",
        id: "w1",
        name: "Verbose Tome",
        type: "equipment",
        provenance: "world",
        price: "4 gp",
        description: `<p>${"word ".repeat(4000)}</p>`,
      },
    };
    const md = renderQueryItem(result);
    expect(md).toContain("# Verbose Tome");
    expect(md).toContain("Price: 4 gp");
    expect(md.length).toBeLessThan(12_100);
    expect(md).toContain("truncated at the size limit");
  });
});

describe("renderQueryRolls (0028 S3, D28-3/D28-10/D28-12)", () => {
  it("renders a table with speaker/check/type/outcome/formula-total/dice + the totalMessages footer", () => {
    const result: QueryRollsResult = {
      rows: [
        {
          id: "m1",
          timestamp: Date.parse("2026-07-01T12:00:00Z"),
          speakerAlias: "Argyle",
          speakerActorId: "a1",
          checkName: "Religion",
          rollType: "skill-check",
          outcome: "success",
          dcValue: 18,
          formula: "1d20+7",
          total: 21,
          dice: [{ faces: 20, results: [{ result: 14 }] }],
        },
      ],
      totalMessages: 42,
      hasMore: false,
    };
    const md = renderQueryRolls(result);
    expect(md).toContain("# Roll History");
    expect(md).toContain("Argyle");
    expect(md).toContain("Religion");
    expect(md).toContain("skill-check");
    expect(md).toContain("Success (DC 18)");
    expect(md).toContain("1d20+7 → 21");
    expect(md).toContain("d20[14]");
    expect(md).toContain("Showing 1 row(s); 42 total messages");
  });

  it("marks a discarded die compactly", () => {
    const result: QueryRollsResult = {
      rows: [
        {
          id: "m1",
          timestamp: 1000,
          rollType: "roll",
          formula: "2d20kl1",
          total: 8,
          dice: [
            {
              faces: 20,
              results: [{ result: 14, discarded: true }, { result: 8 }],
            },
          ],
        },
      ],
      totalMessages: 1,
      hasMore: false,
    };
    const md = renderQueryRolls(result);
    expect(md).toContain("d20[~14~,8]");
  });

  it("omits the DC when dcValue is absent and renders '—' for an outcome-less roll", () => {
    const result: QueryRollsResult = {
      rows: [{ id: "m1", timestamp: 1000, rollType: "roll", formula: "1d20", total: 12, dice: [] }],
      totalMessages: 1,
      hasMore: false,
    };
    const md = renderQueryRolls(result);
    expect(md).toMatch(/\|\s*—\s*\|/);
  });

  it("includes the nextCursor hint when hasMore is true", () => {
    const result: QueryRollsResult = {
      rows: [],
      totalMessages: 5,
      hasMore: true,
      nextCursor: "1000:m1",
    };
    const md = renderQueryRolls(result);
    expect(md).toContain('cursor="1000:m1"');
  });

  it("renders a 'no matching rolls' placeholder for an empty page", () => {
    const md = renderQueryRolls({ rows: [], totalMessages: 0, hasMore: false });
    expect(md).toContain("No matching public rolls found");
  });

  it("appends a compact modifier breakdown column when a row carries modifiers (player feedback)", () => {
    const result: QueryRollsResult = {
      rows: [
        {
          id: "m1",
          timestamp: 1000,
          speakerAlias: "Anzu",
          checkName: "Occultism",
          rollType: "skill-check",
          formula: "1d20+20",
          total: 27,
          dice: [],
          modifiers: [
            { label: "Intelligence", value: 4, type: "ability" },
            { label: "Master Proficiency", value: 13, type: "proficiency" },
            { label: "Pendant of the Occult", value: 1, type: "item" },
            { label: "Guidance", value: 1, type: "status" },
            { label: "Aid", value: 1, type: "circumstance" },
          ],
        },
      ],
      totalMessages: 1,
      hasMore: false,
    };
    const md = renderQueryRolls(result);
    expect(md).toContain("Breakdown");
    expect(md).toContain(
      "Intelligence +4 · Master Proficiency +13 · Pendant of the Occult +1 · Guidance +1 · Aid +1",
    );
  });

  it("omits the Breakdown column entirely when no row carries modifiers", () => {
    const result: QueryRollsResult = {
      rows: [{ id: "m1", timestamp: 1000, rollType: "roll", formula: "1d20", total: 12, dice: [] }],
      totalMessages: 1,
      hasMore: false,
    };
    const md = renderQueryRolls(result);
    expect(md).not.toContain("Breakdown");
  });

  it("renders a negative modifier with its sign", () => {
    const result: QueryRollsResult = {
      rows: [
        {
          id: "m1",
          timestamp: 1000,
          rollType: "skill-check",
          formula: "1d20-2",
          total: 10,
          dice: [],
          modifiers: [{ label: "Enfeebled", value: -2, type: "status" }],
        },
      ],
      totalMessages: 1,
      hasMore: false,
    };
    const md = renderQueryRolls(result);
    expect(md).toContain("Enfeebled -2");
  });

  it('format="json" returns the typed result verbatim as pretty-printed JSON, not markdown', () => {
    const result: QueryRollsResult = {
      rows: [
        {
          id: "m1",
          timestamp: 1000,
          rollType: "skill-check",
          formula: "1d20+7",
          total: 21,
          dice: [{ faces: 20, results: [{ result: 14 }] }],
        },
      ],
      totalMessages: 1,
      hasMore: false,
    };
    const md = renderQueryRolls(result, { format: "markdown" });
    expect(md).toContain("# Roll History");

    const json = renderQueryRolls(result, { format: "json" });
    expect(json).not.toContain("# Roll History");
    expect(JSON.parse(json)).toEqual(result);
  });

  it("format is optional — an undefined params argument still renders markdown (back-compat)", () => {
    const md = renderQueryRolls({ rows: [], totalMessages: 0, hasMore: false });
    expect(md).toContain("# Roll History");
  });
});
