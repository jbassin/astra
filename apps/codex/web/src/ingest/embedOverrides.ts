import type { InlineNode } from "../schema/nodes";

/**
 * D29-134 (P14 S1): a hand-curated dead-embed-target → real-id override
 * table — the `join-aliases.json` pattern (a small, committed, per-entry-
 * justified hand-curated map), but a plain TS module rather than a JSON
 * file: `drop.ts` (this table's sole consumer, `reconcileInline`'s embed
 * case) is pure/no-disk-I/O by its own file header, and this table is only
 * ever read, never round-tripped through a build script the way
 * `join-aliases.json` is.
 *
 * Each `from` is the raw pre-collision embed target id these AoN loreBody/
 * body `<document>` embeds actually carry (orchestrator-verified on disk
 * 2026-07-19). The Foundry Item doc that id names is a JOINABLE draft that
 * D29-14's AoN-primary drop removes as unjoined `class-feature`/`feat`
 * residue (`join.ts`'s `CLASS_SUBSYSTEM_CATEGORIES` (`join.ts:182-210`)
 * omits `feat`/`rules`/`eidolon`, and `qualifierCandidates`
 * (`join.ts:92-112`) strips only parenthetical qualifiers, not trailing
 * "Innovation"/"Eidolon" words — the two join-time gaps this round does NOT
 * fix, D29-134's "no URL churn" call). `to` is the real surviving corpus
 * entity that holds the same content under a different id/category (all 20
 * repoint targets orchestrator-verified to exist on disk 2026-07-19). One
 * entry (`feat/innate-venom`, vishkanya's self-embed) is `kind: "suppress"`
 * instead — its text is already inline in its own body, so the embed is
 * pure redundancy; see `drop.ts`'s `reconcileInline` for how a `suppress`
 * entry is applied (replaced with an inert empty text node, since a repoint
 * map has no way to DELETE a children-array entry).
 */
export type EmbedOverrideEntry =
  | { from: string; kind: "repoint"; to: string; note: string }
  | { from: string; kind: "suppress"; note: string };

const EIDOLON_SLUGS: readonly string[] = [
  "angel",
  "anger-phantom",
  "beast",
  "construct",
  "demon",
  "devotion-phantom",
  "dragon",
  "elemental",
  "fey",
  "plant",
  "psychopomp",
  "swarm",
  "undead",
];

function eidolonEntries(): EmbedOverrideEntry[] {
  return EIDOLON_SLUGS.map((slug) => ({
    from: `class-feature/${slug}-eidolon`,
    kind: "repoint" as const,
    to: `eidolon/${slug}`,
    note: "summoner's per-eidolon embed — the eidolon's own real category, never joined (feat/rules/eidolon omitted from CLASS_SUBSYSTEM_CATEGORIES).",
  }));
}

export const EMBED_OVERRIDES: readonly EmbedOverrideEntry[] = [
  ...eidolonEntries(),
  {
    from: "class-feature/armor-innovation",
    kind: "repoint",
    to: "innovation/armor",
    note: "inventor's per-innovation embed — the innovation's own real category.",
  },
  {
    from: "class-feature/construct-innovation",
    kind: "repoint",
    to: "innovation/construct",
    note: "inventor's per-innovation embed — the innovation's own real category.",
  },
  {
    from: "class-feature/weapon-innovation",
    kind: "repoint",
    to: "innovation/weapon",
    note: "inventor's per-innovation embed — the innovation's own real category.",
  },
  {
    from: "class-feature/advanced-alchemy",
    kind: "repoint",
    to: "feat/advanced-alchemy",
    note: "alchemist's class-features embed a Foundry class-feature draft that never joined; the real content lives as a feat.",
  },
  {
    from: "class-feature/quick-alchemy",
    kind: "repoint",
    to: "action/quick-alchemy",
    // D29-134 / risk register: two real candidates exist (`feat/` and
    // `action/`) — `action/` is chosen because the SAME page's other
    // Quick Alchemy embed already links `action/quick-alchemy` (the page
    // precedent this table follows, not a coin flip). If a future review
    // finds `feat/` the richer target, STOP and record — do not silently
    // swap (spec §6 risk note).
    note: "TWO real candidates exist (feat/ and action/) — action/ chosen: the same page's other embed already links action/quick-alchemy.",
  },
  {
    from: "feat/basic-undead-benefits",
    kind: "repoint",
    to: "rules/basic-undead-benefits",
    note: "the ghoul-heritage rules page's benefits table lives under rules/, not feat/.",
  },
  {
    from: "feat/advanced-undead-benefits",
    kind: "repoint",
    to: "rules/advanced-undead-benefits",
    note: "the ghoul-heritage rules page's benefits table lives under rules/, not feat/.",
  },
  {
    from: "feat/innate-venom",
    kind: "suppress",
    note: "vishkanya's self-embed — Innate Venom's text is already inline in its own body; the embed is pure redundancy, not a broken cross-link.",
  },
];

/** `from` -> entry, built once at module load (a small, fixed, hand-curated
 * table — no need to rebuild per call). Throws at import time on a
 * duplicate `from` key, the same "fail loudly on drift" posture
 * `join.ts`/`categoryMap.ts` use for their own hand-curated tables. */
function buildOverrideMap(): ReadonlyMap<string, EmbedOverrideEntry> {
  const map = new Map<string, EmbedOverrideEntry>();
  for (const entry of EMBED_OVERRIDES) {
    if (map.has(entry.from)) {
      throw new Error(`embedOverrides: duplicate "from" key "${entry.from}"`);
    }
    map.set(entry.from, entry);
  }
  return map;
}

const OVERRIDE_MAP = buildOverrideMap();

/** The one inert node a `suppress` entry replaces an embed with — an empty
 * text run (the schema's minimal valid `InlineNode`), never rendered as
 * visible content and never counted as an unresolved embed. */
export const SUPPRESSED_EMBED_NODE: InlineNode = {
  kind: "text",
  content: "",
  marks: { bold: false, italic: false, superscript: false },
};

/** Looks up `target` (an embed node's raw `target` string, pre-override) in
 * the D29-134 table — `undefined` when `target` has no override entry
 * (the normal case for every embed NOT in the hand-curated table). */
export function lookupEmbedOverride(target: string): EmbedOverrideEntry | undefined {
  return OVERRIDE_MAP.get(target);
}
