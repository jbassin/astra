import type { Facets, Stats } from "../../schema/entity";
import type { CodexNode } from "../../schema/nodes";

/** Shared tiny text helpers for the render layer (kept dependency-free/pure so
 * every render module — nodes/statblock/facetHeader/traits — can share one
 * definition instead of re-deriving it). */
export function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/** `"fooBarBaz"` -> "Foo Bar Baz" — a best-effort humanizer for facet keys
 * whose real display label the corpus doesn't carry (only AoN/Foundry's own
 * internal field name does). A small override table catches the common
 * PF2e-specific acronyms a naive splitter would mangle (`ac` -> "Ac"). */
const KEY_OVERRIDES: Readonly<Record<string, string>> = {
  ac: "AC",
  hp: "HP",
  dc: "DC",
};

export function humanizeFacetKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter((w) => w.length > 0);
  return words.map((w) => KEY_OVERRIDES[w.toLowerCase()] ?? capitalize(w)).join(" ");
}

/** `"reach-15"` -> "Reach 15"; `"creature-ability"` -> "Creature Ability". A plain
 * hyphen-split humanizer (no camelCase boundary handling, unlike
 * `humanizeFacetKey` above — trait tokens and corpus `category` strings are
 * already lowercase-hyphenated, never camelCase) shared by `traits.tsx`
 * (trait-token display names) and S3's category directory/listing pages
 * (category display names) so the two don't drift into two copies of the same
 * five-line function. */
export function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => capitalize(part))
    .join(" ");
}

// ---------------------------------------------------------------------------
// S2: plain-text extraction — the route head/meta `<meta name="description">`
// needs a plain string, not React nodes, so this is a SEPARATE small total
// switch over `CodexNode` (not a reuse of `nodes.tsx`'s `renderNode`, which
// returns `ReactNode` and is keyed for React reconciliation, not string
// concatenation). Pure, total — same "every kind, never throw" posture as the
// renderer.
// ---------------------------------------------------------------------------

/**
 * `includeTables` splits this one switch between two callers with genuinely
 * different postures: `firstParagraphSummary` wants a short "description"
 * fragment (a table's cell text was never a natural summary line, D29-26's
 * own reasoning below); `collectText` (S2, D29-34) wants EVERY word on the
 * page indexed for search, table cells included — a creature's resistance
 * table or a class-feature's progression table is real searchable content.
 */
function collectNodeText(node: CodexNode, includeTables: boolean): string {
  switch (node.kind) {
    case "text":
      return node.content;
    case "crossref":
    case "brokenRef":
      return node.display;
    case "check":
      return node.label ?? "";
    case "damage":
      return node.label ?? node.display;
    case "inlineRoll":
      return node.label ?? node.formula;
    case "inlineAction":
      return node.label ?? node.action;
    case "template":
      return node.label ?? "";
    case "actionGlyph":
      return "";
    case "embed":
      return node.display ?? "";
    case "localizedBoilerplate":
      return node.children.map((n) => collectNodeText(n, includeTables)).join("");
    case "paragraph":
    case "heading":
      return node.children.map((n) => collectNodeText(n, includeTables)).join("");
    case "list":
      return node.items
        .map((item) => item.map((n) => collectNodeText(n, includeTables)).join(" "))
        .join(" ");
    case "table":
      // A table's cell text isn't a natural "description" fragment (D29-26's own
      // `body` prose is what a summary line is for) — deliberately excluded from
      // `firstParagraphSummary`, same as the renderer's own posture of never
      // dumping structural content flat. `collectText` opts back in.
      if (!includeTables) return "";
      return node.rows
        .map((row) =>
          row.cells
            .map((cell) => cell.map((n) => collectNodeText(n, includeTables)).join(" "))
            .join(" "),
        )
        .join(" ");
    case "blockquote":
    case "aside":
      return node.children.map((n) => collectNodeText(n, includeTables)).join("");
    case "divider":
      return "";
  }
}

/**
 * The route head/meta description (spec S2 bullet: "description from
 * first-paragraph collectText"): plain text of the entity's FIRST top-level
 * `paragraph` node, whitespace-collapsed and length-capped. Returns `""` for a
 * body with no paragraph at all (e.g. an entity whose body opens with a table or
 * list) — the route omits the meta tag rather than render an empty one.
 */
export function firstParagraphSummary(body: readonly CodexNode[], maxLen = 200): string {
  const first = body.find((n) => n.kind === "paragraph");
  if (!first) return "";
  const collapsed = collectNodeText(first, false).trim().replace(/\s+/g, " ");
  if (collapsed.length <= maxLen) return collapsed;
  return `${collapsed.slice(0, maxLen - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// S2 (D29-34, adversarial N9): full-document plain-text extraction for the
// Pagefind index build (`scripts/build-search.ts`) — no `collectText`/
// `statsText` symbol existed before this slice.
// ---------------------------------------------------------------------------

/**
 * The whole-document counterpart to `firstParagraphSummary`: every node in
 * `nodes` (typically an entity's `body` or `loreBody`), full-tree, table
 * cells included, whitespace-collapsed. Pure, total — same "every kind,
 * never throw" posture as the renderer and `firstParagraphSummary`.
 */
export function collectText(nodes: readonly CodexNode[]): string {
  return nodes
    .map((n) => collectNodeText(n, true))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"] as const;

/**
 * A plain-text rendering of a creature/hazard's structured statblock (the
 * `hp`/`ac`/saves/`perception`/`size` scalar `Facets` plus the discriminated
 * `Stats` union — speeds/ability mods/senses/languages/immunities/
 * resistances/weaknesses/skills for creature; hardness/stealth/isComplex/
 * disable-routine-reset for hazard) for the search index, so a query for a
 * specific resistance type or a hazard's disable text actually matches.
 * Mirrors `statblock.tsx`'s React rows field-for-field (kept as a separate,
 * plain-text implementation — React reconciliation output isn't a string);
 * every other category's `Facets` (price/bulk/traditions/...) is
 * deliberately out of scope here, per the spec's own "creature/hazard
 * stats" framing — those scalar values are thin enough to live as filters
 * only. NOT safe to call unconditionally across categories: since P3 S1's
 * gap extractors, `hp`/`size` (ancestry), `hp` (class), and `hp`/`ac`/
 * `fortitudeSave`/`size` (vehicle, warfare-army) appear on non-statblock
 * categories too — the caller (`scripts/build-search.ts`) gates on
 * `category === "creature" || "hazard"` per D29-34's own scoping.
 */
export function statsText(facets: Facets, stats: Stats | undefined): string {
  const parts: string[] = [];
  if (facets.hp !== undefined) parts.push(`HP ${facets.hp}`);
  if (facets.ac !== undefined) parts.push(`AC ${facets.ac}`);
  if (facets.fortitudeSave !== undefined) parts.push(`Fort ${fmtMod(facets.fortitudeSave)}`);
  if (facets.reflexSave !== undefined) parts.push(`Ref ${fmtMod(facets.reflexSave)}`);
  if (facets.willSave !== undefined) parts.push(`Will ${fmtMod(facets.willSave)}`);
  if (facets.perception !== undefined) parts.push(`Perception ${fmtMod(facets.perception)}`);
  if (facets.size !== undefined) parts.push(`Size ${facets.size}`);
  if (facets.family !== undefined) parts.push(`Family ${facets.family}`);

  if (stats?.kind === "creature") {
    if (stats.speeds?.base !== undefined) parts.push(`Speed ${stats.speeds.base} feet`);
    for (const s of stats.speeds?.other ?? []) parts.push(`${s.type} Speed ${s.value} feet`);
    for (const k of ABILITY_ORDER) {
      const v = stats.abilityMods?.[k];
      if (v !== undefined) parts.push(`${k.toUpperCase()} ${fmtMod(v)}`);
    }
    if (stats.senses?.details !== undefined) parts.push(stats.senses.details);
    for (const s of stats.senses?.list ?? []) {
      const acuity = s.acuity !== undefined ? `${s.acuity} ` : "";
      const range = s.range !== undefined ? ` ${s.range} feet` : "";
      parts.push(`${acuity}${s.type}${range}`);
    }
    if (stats.languages && stats.languages.length > 0) {
      parts.push(`Languages ${stats.languages.join(", ")}`);
    }
    if (stats.immunities && stats.immunities.length > 0) {
      parts.push(`Immunities ${stats.immunities.join(", ")}`);
    }
    for (const r of stats.resistances ?? []) {
      parts.push(
        r.value !== undefined ? `Resistance ${r.type} ${r.value}` : `Resistance ${r.type}`,
      );
    }
    for (const w of stats.weaknesses ?? []) {
      parts.push(w.value !== undefined ? `Weakness ${w.type} ${w.value}` : `Weakness ${w.type}`);
    }
    if (stats.skills) {
      // D29-74 (P7): `humanizeSlug`, not first-char `capitalize` — `skills`
      // keys include multi-word lore slugs since the lore merge
      // ("gambling-lore" must index as "Gambling Lore", never
      // "Gambling-lore"); single-word core skills are unchanged. Mirrors
      // `statblock.tsx`'s SkillsRow, same D29-74 render blocker.
      for (const [name, mod] of Object.entries(stats.skills)) {
        parts.push(`${humanizeSlug(name)} ${fmtMod(mod)}`);
      }
    }
  } else if (stats?.kind === "hazard") {
    if (stats.hardness !== undefined) parts.push(`Hardness ${stats.hardness}`);
    if (stats.stealth?.value !== undefined) parts.push(`Stealth ${fmtMod(stats.stealth.value)}`);
    if (stats.stealth?.details !== undefined) parts.push(stats.stealth.details);
    if (stats.isComplex !== undefined) parts.push(stats.isComplex ? "Complex" : "Simple");
    if (stats.disable !== undefined) parts.push(`Disable ${collectText(stats.disable)}`);
    if (stats.routine !== undefined) parts.push(`Routine ${collectText(stats.routine)}`);
    if (stats.reset !== undefined) parts.push(`Reset ${collectText(stats.reset)}`);
  }

  return parts.join("; ");
}
