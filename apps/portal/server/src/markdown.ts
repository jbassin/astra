/**
 * D28-6 — the four player-facing query tools return markdown, not JSON: the module
 * stays dumb (typed compact JSON over the wire, unchanged — see `handlers.ts`), this
 * file is where that JSON becomes LLM-friendly prose. Two concerns:
 *
 *  - {@link htmlToMarkdown}: a small, deliberately lossy-but-safe HTML+enricher->
 *    markdown pass for Foundry rich-text fields (item descriptions, biography prose).
 *    "Lossy-but-safe" (spec Risks): strip whatever it doesn't recognize down to plain
 *    text — it must NEVER leave raw HTML in the output, but a perfect roundtrip isn't
 *    the goal. No new dependency (verified: nothing HTML-to-markdown-shaped already
 *    lives in this repo) — regex-based, sized honestly at well under 150 lines.
 *  - the `render*` functions: one per `query-party`/`query-player` section, each a
 *    pure `(typed result) -> string` function (server-side, so it's unit-testable with
 *    no Foundry/bridge in the loop). `renderPlayerSpells`/`renderPlayerFeats` carry the
 *    D28-11 hard 12,000-char cap: a full render that would exceed it is discarded in
 *    favor of a deterministic group-level summary (names + counts, no cursor state)
 *    plus a line telling the caller how to narrow the next query.
 */
import type {
  PlayerFeatsSection,
  PlayerInventorySection,
  PlayerNotesSection,
  PlayerSkillsSection,
  PlayerSpellcastingEntryGroup,
  PlayerSpellsSection,
  PlayerStatsSection,
  PlayerSummarySection,
  QueryPartyResult,
  QueryPlayerResult,
} from "@astra/portal-shared";

// ---------------------------------------------------------------------------
// HTML + Foundry rich-text enricher -> markdown
// ---------------------------------------------------------------------------

const HTML_ENTITY_NAMES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return HTML_ENTITY_NAMES[code] ?? whole;
  });
}

/** Translates a Foundry rich-text enricher (`@UUID[...]{label}`, `@Check[...]{label}`,
 * `@Damage[...]{label}`, `@Localize[...]`, ...) to its human-readable label — falling
 * back to the last `.`/`:`-delimited segment of the bracket content (readable for a
 * uuid like `Compendium.pf2e.spells-srd.Item.xyz`) when there's no `{label}`, or the
 * raw content when neither applies. The content group allows ONE level of nested
 * `[...]` (`(?:[^[\]]|\[[^\]]*\])*`) — covers the common `@Damage[...d8[healing]]
 * {label}` shape (a damage formula with an inline `[type]` tag) verified live in the
 * Argyle fixture; deeper nesting is rare and degrades to leftover bracket text
 * (lossy-but-safe: never HTML, just imperfect enricher stripping). */
function stripEnrichers(html: string): string {
  return html.replace(
    /@[A-Za-z]+\[((?:[^[\]]|\[[^\]]*\])*)\](?:\{([^}]*)\})?/g,
    (_whole, content: string, label?: string) => {
      if (label) return label;
      const segments = content.split(/[.:]/);
      return segments.at(-1) || content;
    },
  );
}

/** Foundry rich-text HTML -> markdown (D28-6). Deliberately lossy-but-safe: known
 * block/inline tags become their markdown equivalent, everything else (including any
 * tag this function doesn't special-case) is stripped down to plain text — the output
 * NEVER contains a `<...>` tag. */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  let text = stripEnrichers(html);

  text = text.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_w, level: string, inner: string) => `\n${"#".repeat(Number(level))} ${inner.trim()}\n\n`,
  );
  text = text.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(
    /<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi,
    (_w, _tag: string, inner: string) => `**${inner.trim()}**`,
  );
  text = text.replace(
    /<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi,
    (_w, _tag: string, inner: string) => `*${inner.trim()}*`,
  );
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_w, inner: string) => `- ${inner.trim()}\n`);
  text = text.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");
  text = text.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, (_w, inner: string) => inner.trim());
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_w, inner: string) => `${inner.trim()}\n\n`);
  // Anything left (a tag this function doesn't special-case) — strip it to plain
  // text. This is the "never emit raw HTML" backstop.
  text = text.replace(/<[^>]+>/g, "");
  text = decodeHtmlEntities(text);
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// query-party
// ---------------------------------------------------------------------------

export function renderQueryParty(result: QueryPartyResult): string {
  const lines = [`# ${result.partyName ?? "Party Roster"}\n`];
  if (result.pcs.length === 0 && result.companions.length === 0) {
    lines.push("_No party members found._");
    return lines.join("\n").trim();
  }
  if (result.pcs.length > 0) {
    lines.push("## Player Characters\n");
    lines.push("| Name | Level | HP | Hero Points | Ancestry | Class | Player |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const pc of result.pcs) {
      const hp = pc.hp ? `${pc.hp.value}/${pc.hp.max}` : "—";
      const hero = pc.heroPoints ? `${pc.heroPoints.value}/${pc.heroPoints.max}` : "—";
      lines.push(
        `| ${pc.name} | ${pc.level ?? "—"} | ${hp} | ${hero} | ${pc.ancestry ?? "—"} | ` +
          `${pc.className ?? "—"} | ${pc.ownerPlayer ?? "—"} |`,
      );
    }
    lines.push("");
  }
  if (result.companions.length > 0) {
    lines.push("## Companions\n");
    for (const c of result.companions) {
      lines.push(`- ${c.name} (${c.type}${c.master ? `, master: ${c.master}` : ""})`);
    }
  }
  return lines.join("\n").trim();
}

// ---------------------------------------------------------------------------
// query-player
// ---------------------------------------------------------------------------

function fmtNum(value: number | undefined): string {
  return value === undefined ? "—" : String(value);
}

function titleCase(slug: string): string {
  return slug.length > 0 ? slug.charAt(0).toUpperCase() + slug.slice(1) : slug;
}

function renderPlayerSummary(s: PlayerSummarySection): string {
  const lines = [`# ${s.name}\n`];
  const bits: string[] = [];
  if (s.level !== undefined) bits.push(`Level ${s.level}`);
  if (s.className) bits.push(s.className);
  if (s.ancestry) bits.push(s.ancestry);
  if (s.heritage) bits.push(s.heritage);
  if (s.background) bits.push(s.background);
  if (bits.length > 0) lines.push(`${bits.join(" · ")}\n`);
  if (s.hp) {
    const max = s.hp.max !== undefined ? `/${s.hp.max}` : "";
    const temp = s.hp.temp ? ` (+${s.hp.temp} temp)` : "";
    lines.push(`- HP: ${s.hp.value}${max}${temp}`);
  }
  if (s.heroPoints) lines.push(`- Hero Points: ${s.heroPoints.value}/${s.heroPoints.max}`);
  if (s.xp) lines.push(`- XP: ${s.xp.value}/${s.xp.max}`);
  if (s.deity) lines.push(`- Deity: ${s.deity}`);
  if (s.languages && s.languages.length > 0) lines.push(`- Languages: ${s.languages.join(", ")}`);
  if (s.alliance) lines.push(`- Alliance: ${s.alliance}`);
  if (s.master) lines.push(`- Master: ${s.master}`);
  return lines.join("\n").trim();
}

function renderPlayerStats(s: PlayerStatsSection): string {
  const lines = ["# Stats (derived, live)\n"];
  lines.push(`- AC: ${fmtNum(s.ac)}`);
  lines.push(`- Perception: ${fmtNum(s.perception.value)} (DC ${fmtNum(s.perception.dc)})`);
  lines.push("");
  lines.push("## Saving Throws\n");
  for (const save of s.saves) {
    lines.push(`- ${titleCase(save.type)}: ${fmtNum(save.value)} (DC ${fmtNum(save.dc)})`);
  }
  lines.push("");
  lines.push("## Ability Modifiers\n");
  for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
    const mod = s.abilityMods[key];
    if (mod === undefined) continue;
    lines.push(`- ${key.toUpperCase()}: ${mod >= 0 ? "+" : ""}${mod}`);
  }
  lines.push("");
  const classDcRank = s.classDC.rank !== undefined ? ` (rank ${s.classDC.rank})` : "";
  lines.push(`- Class DC: ${fmtNum(s.classDC.value)}${classDcRank}`);
  lines.push(`- Spell DC: ${fmtNum(s.spellDC.value)}`);
  if (s.warnings.length > 0) {
    lines.push("");
    lines.push(
      `_${s.warnings.length} derived field(s) could not be read on this actor and render as "—".` +
        "_",
    );
  }
  return lines.join("\n").trim();
}

function renderPlayerSkills(s: PlayerSkillsSection): string {
  const lines = ["# Skills\n", "| Skill | Rank | Total | DC |", "| --- | --- | --- | --- |"];
  for (const skill of s.skills) {
    const label = (skill.label ?? skill.slug) + (skill.lore ? " (lore)" : "");
    lines.push(
      `| ${label} | ${fmtNum(skill.rank)} | ${fmtNum(skill.value)} | ${fmtNum(skill.dc)} |`,
    );
  }
  return lines.join("\n").trim();
}

const MARKDOWN_CHAR_CAP = 12_000;

function renderSpellRow(
  spell: PlayerSpellcastingEntryGroup["ranks"][number]["spells"][number],
): string {
  const traits = spell.traits.length > 0 ? ` [${spell.traits.join(", ")}]` : "";
  const state = spell.prepared === undefined ? "" : spell.expended ? " (expended)" : " (prepared)";
  return `- ${spell.name}${traits}${state}`;
}

function renderSpellsFull(section: PlayerSpellsSection): string {
  const lines = ["# Spells\n"];
  if (section.entries.length === 0) return `${lines.join("\n")}\n_No spellcasting entries found._`;
  for (const entry of section.entries) {
    lines.push(`## ${entry.entryName}`);
    const meta: string[] = [];
    if (entry.tradition) meta.push(`tradition: ${entry.tradition}`);
    if (entry.preparedType) meta.push(`type: ${entry.preparedType}`);
    if (entry.dc !== undefined) meta.push(`DC ${entry.dc}`);
    if (meta.length > 0) lines.push(`_${meta.join(" · ")}_`);
    if (entry.ranks.length === 0) {
      lines.push("_No spells._");
      continue;
    }
    for (const rankGroup of entry.ranks) {
      const rankLabel = rankGroup.rank === 0 ? "Cantrips" : `Rank ${rankGroup.rank}`;
      const slotLabel = rankGroup.slots
        ? ` (${rankGroup.slots.value}/${rankGroup.slots.max} slots)`
        : "";
      lines.push(`### ${rankLabel}${slotLabel}`);
      for (const spell of rankGroup.spells) lines.push(renderSpellRow(spell));
    }
    lines.push("");
  }
  lines.push("Full spell descriptions: use query-item with a spell's id (S3).");
  return lines.join("\n").trim();
}

/** D28-11's group-level fallback: names + counts only, no traits/prepared state, plus
 * the explicit re-query instruction — deterministic, no cursor state. */
function renderSpellsSummary(
  section: PlayerSpellsSection,
  filters: { entry?: string; rank?: number },
): string {
  const lines = ["# Spells (summary — the full render exceeded the size limit)\n"];
  for (const entry of section.entries) {
    lines.push(`## ${entry.entryName}`);
    for (const rankGroup of entry.ranks) {
      const rankLabel = rankGroup.rank === 0 ? "Cantrips" : `Rank ${rankGroup.rank}`;
      const names = rankGroup.spells.map((sp) => sp.name).join(", ");
      lines.push(`- ${rankLabel} (${rankGroup.spells.length}): ${names}`);
    }
  }
  lines.push("");
  const hint =
    filters.entry !== undefined || filters.rank !== undefined
      ? "Narrow further with a more specific `entry`/`rank` filter to see full spell details."
      : 'Re-query query-player with section="spells" and an `entry` and/or `rank` filter to ' +
        "see full details for one group.";
  lines.push(hint);
  return lines.join("\n").trim();
}

function renderPlayerSpells(
  section: PlayerSpellsSection,
  filters: { entry?: string; rank?: number },
): string {
  const full = renderSpellsFull(section);
  return full.length <= MARKDOWN_CHAR_CAP ? full : renderSpellsSummary(section, filters);
}

function renderFeatsFull(section: PlayerFeatsSection): string {
  const lines = ["# Feats\n"];
  if (section.feats.length === 0) return `${lines.join("\n")}\n_No feats._`;
  let currentCategory: string | undefined;
  for (const feat of section.feats) {
    if (feat.category !== currentCategory) {
      currentCategory = feat.category;
      lines.push(`## ${titleCase(currentCategory)}`);
    }
    const level = feat.level !== undefined ? ` (level ${feat.level})` : "";
    lines.push(`- ${feat.name}${level}`);
  }
  return lines.join("\n").trim();
}

/** D28-11's group-level fallback for feats: per-category names + counts only. */
function renderFeatsSummary(section: PlayerFeatsSection): string {
  const lines = ["# Feats (summary — the full render exceeded the size limit)\n"];
  const byCategory = new Map<string, string[]>();
  for (const feat of section.feats) {
    const bucket = byCategory.get(feat.category) ?? [];
    bucket.push(feat.name);
    byCategory.set(feat.category, bucket);
  }
  for (const [category, names] of byCategory) {
    lines.push(`- ${titleCase(category)} (${names.length}): ${names.join(", ")}`);
  }
  lines.push("");
  lines.push(
    'Re-query query-player with section="feats" — feats have no category/level filter of ' +
      "their own; this summary is the full picture.",
  );
  return lines.join("\n").trim();
}

function renderPlayerFeats(section: PlayerFeatsSection): string {
  const full = renderFeatsFull(section);
  return full.length <= MARKDOWN_CHAR_CAP ? full : renderFeatsSummary(section);
}

function renderPlayerInventory(s: PlayerInventorySection): string {
  const lines = ["# Inventory\n"];
  if (s.items.length === 0) return `${lines.join("\n")}\n_No items._`;
  for (const item of s.items) {
    const bits: string[] = [];
    if (item.quantity !== undefined && item.quantity !== 1) bits.push(`x${item.quantity}`);
    if (item.bulk !== undefined) bits.push(`bulk ${item.bulk}`);
    if (item.carryType) bits.push(item.carryType);
    if (item.invested) bits.push("invested");
    if (item.runes && item.runes.length > 0) bits.push(item.runes.join(", "));
    const suffix = bits.length > 0 ? ` (${bits.join(", ")})` : "";
    lines.push(`- ${item.name}${suffix}`);
  }
  return lines.join("\n").trim();
}

function renderPlayerNotes(s: PlayerNotesSection): string {
  const lines = ["# Notes\n"];
  const startLength = lines.length;
  if (s.deity) lines.push(`**Deity:** ${s.deity}\n`);
  if (s.appearance) lines.push(`## Appearance\n\n${htmlToMarkdown(s.appearance)}\n`);
  if (s.backstory) lines.push(`## Backstory\n\n${htmlToMarkdown(s.backstory)}\n`);
  if (s.likes) lines.push(`**Likes:** ${htmlToMarkdown(s.likes)}\n`);
  if (s.dislikes) lines.push(`**Dislikes:** ${htmlToMarkdown(s.dislikes)}\n`);
  if (s.campaignNotes) lines.push(`## Campaign Notes\n\n${htmlToMarkdown(s.campaignNotes)}\n`);
  if (lines.length === startLength) lines.push("_No notes recorded._");
  return lines.join("\n").trim();
}

function extractSpellFilters(params: unknown): { entry?: string; rank?: number } {
  const p = params as { entry?: unknown; rank?: unknown } | null;
  return {
    entry: typeof p?.entry === "string" ? p.entry : undefined,
    rank: typeof p?.rank === "number" ? p.rank : undefined,
  };
}

/** `query-player`'s render dispatch — one function per section, plumbed through
 * `mcp.ts`'s `registerBridgeTool` `render` config. `params` is the tool call's raw
 * (already zod-parsed) arguments, needed only by the `spells` section to echo the
 * caller's own entry/rank filter back in the D28-11 cap-fallback hint text. */
export function renderQueryPlayer(result: QueryPlayerResult, params: unknown): string {
  switch (result.section) {
    case "summary":
      return renderPlayerSummary(result);
    case "stats":
      return renderPlayerStats(result);
    case "skills":
      return renderPlayerSkills(result);
    case "spells":
      return renderPlayerSpells(result, extractSpellFilters(params));
    case "feats":
      return renderPlayerFeats(result);
    case "inventory":
      return renderPlayerInventory(result);
    case "notes":
      return renderPlayerNotes(result);
  }
}
