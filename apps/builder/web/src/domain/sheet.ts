// Turns a built `Character` into the plain words the sheet prints: when on a turn each thing
// is used, what to roll for an attack or a spell, and one card per feature and spell. Pure, so
// the player page, the DM page and the tests share it.

import type { Ability } from "./contentTypes";
import type { AttackLine, Character, FeatureLine, SpellEntry } from "./engine";

/** When a thing is used: on your action, bonus action or reaction, outside a fight, or always. */
type TurnSlot = "action" | "bonus" | "reaction" | "longer" | "always";

const SLOT_LABEL: Record<TurnSlot, string> = {
  action: "Your action",
  bonus: "Your bonus action",
  reaction: "Your reaction",
  longer: "Takes a minute or more",
  always: "Always on, or when it says",
};

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

/** "+3", "−1", "+0". */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** "d20 + 5", "d20 − 1". */
function d20(bonus: number): string {
  return bonus >= 0 ? `d20 + ${bonus}` : `d20 − ${Math.abs(bonus)}`;
}

/** A feature's slot, read from its plain summary ("As a bonus action, …"). */
export function featureSlot(summary: string): TurnSlot {
  const s = summary.toLowerCase();
  if (s.includes("bonus action")) return "bonus";
  if (/\breaction\b/.test(s)) return "reaction";
  if (/\bas an action\b|\bextra action\b|\battack action\b/.test(s)) return "action";
  return "always";
}

/** A spell's slot, from its casting time ("1 bonus action, which you take …"). */
export function spellSlot(time: string): TurnSlot {
  if (time.startsWith("1 bonus action")) return "bonus";
  if (time.startsWith("1 reaction")) return "reaction";
  if (time.startsWith("1 action")) return "action";
  return "longer";
}

/** The first sentence of a summary, for the short "On your turn" lines. */
export function firstSentence(text: string): string {
  const m = /^.+?[.!?](?=\s|$)/.exec(text);
  return m ? m[0] : text;
}

/**
 * A spell's first real sentence. Spell summaries open with their casting time ("Action.",
 * "Bonus action."), which the sheet already shows, so a bare one is skipped; a reaction's
 * opening sentence names its trigger and stays.
 */
export function spellGist(summary: string): string {
  return firstSentence(summary.replace(/^(?:Action|Bonus action)\.\s+/, ""));
}

/** "Roll a d20 + 5 to hit. On a hit, roll 2d6 + 3 Slashing damage." */
export function attackRoll(a: AttackLine): string {
  const dmg = `${a.damage} ${a.damageType}`.trim();
  if (a.toHit === undefined && a.save) {
    return `The target makes a ${ABILITY_NAMES[a.save.ability]} save against DC ${a.save.dc}. If it fails, it takes ${dmg} damage.`;
  }
  return `Roll a ${d20(a.toHit ?? 0)} to hit. On a hit, roll ${dmg} damage.`;
}

/** What to roll for a spell, or `undefined` when it needs no roll. */
export function spellRoll(s: SpellEntry): string | undefined {
  const at = s.attack;
  if (!at) return undefined;
  const dmg = at.damage ? `${at.damage} ${at.damageType ?? ""}`.trim() : undefined;
  if (at.toHit !== undefined) {
    return dmg
      ? `Roll a ${d20(at.toHit)} to hit. On a hit, roll ${dmg} damage.`
      : `Roll a ${d20(at.toHit)} to hit.`;
  }
  if (at.save) {
    const save = `Targets make a ${ABILITY_NAMES[at.save.ability]} save against DC ${at.save.dc}.`;
    return dmg ? `${save} On a failure, roll ${dmg} damage.` : save;
  }
  return undefined;
}

/** How often a spell can be cast, in plain words. */
export function spellUses(s: SpellEntry): string {
  if (s.level === 0) return "As often as you like";
  if (s.freeCasts) return `${s.freeCasts} without a slot, or spend a spell slot`;
  return "Spend a spell slot";
}

export interface TurnItem {
  id: string;
  name: string;
  detail: string;
  uses?: string;
}

interface TurnPlan {
  action: TurnItem[];
  bonus: TurnItem[];
  reaction: TurnItem[];
  always: TurnItem[];
  /** Spells cast with an action, named in one line under the action. */
  actionSpells: string[];
}

/** Every spell the character can cast (not the Wizard's unprepared spellbook), deduplicated. */
function allSpells(c: Character): SpellEntry[] {
  const seen = new Set<string>();
  const out: SpellEntry[] = [];
  for (const block of c.spellcasting) {
    for (const s of [...block.cantrips, ...block.spells]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}

function featureItem(f: FeatureLine): TurnItem {
  return { id: f.id, name: f.name, detail: firstSentence(f.summary), uses: f.uses };
}

/** The "On your turn" layout: features and spells grouped by when they're used. */
export function turnPlan(c: Character): TurnPlan {
  const plan: TurnPlan = { action: [], bonus: [], reaction: [], always: [], actionSpells: [] };
  for (const f of c.features) {
    const slot = featureSlot(f.summary);
    if (slot !== "longer") plan[slot].push(featureItem(f));
  }
  for (const s of allSpells(c)) {
    const slot = spellSlot(s.time);
    if (slot === "action") {
      // Cantrips that attack already appear as attacks.
      if (!(s.level === 0 && s.attack?.damage)) plan.actionSpells.push(s.name);
    } else if (slot === "bonus" || slot === "reaction") {
      plan[slot].push({
        id: `spell-${s.id}`,
        name: s.name,
        detail: spellGist(s.summary),
        uses: spellUses(s),
      });
    }
  }
  return plan;
}

interface SheetCard {
  id: string;
  name: string;
  /** "Feature", "Cantrip", "Level 1 spell". */
  kind: string;
  when: string;
  roll?: string;
  uses?: string;
  text: string;
  /** Small print: range, duration, concentration. */
  meta?: string;
}

function spellMeta(s: SpellEntry): string {
  const parts = [`Range ${s.range}`, s.duration];
  if (s.concentration)
    parts.push("Concentration: it ends if you cast another such spell or lose focus");
  if (s.ritual) parts.push("Can be cast as a ritual (10 extra minutes, no slot)");
  return parts.join(" · ");
}

/** One cut-out card per feature and per spell, in sheet order. */
export function sheetCards(c: Character): SheetCard[] {
  const features: SheetCard[] = c.features.map((f) => ({
    id: f.id,
    name: f.name,
    kind: "Feature",
    when: SLOT_LABEL[featureSlot(f.summary)],
    uses: f.uses,
    text: f.summary,
  }));
  const spells: SheetCard[] = allSpells(c).map((s) => {
    return {
      id: `spell-${s.id}`,
      name: s.name,
      kind: s.level === 0 ? "Cantrip" : "Level 1 spell",
      when: SLOT_LABEL[spellSlot(s.time)],
      roll: spellRoll(s),
      uses: spellUses(s),
      text: s.note ? `${s.summary} (${s.note})` : s.summary,
      meta: spellMeta(s),
    };
  });
  return [...features, ...spells];
}

/** Proficient skills, best first ("things you're good at"). */
export function goodAt(c: Character): Character["skills"] {
  return c.skills.filter((s) => s.proficient).toSorted((a, b) => b.bonus - a.bonus);
}

/** "2 level 1 spell slots; they all come back after a Long Rest." */
export function slotLine(
  slots: number[] | undefined,
  pactSlotLevel: number | undefined,
): string | undefined {
  const n = slots?.[0];
  if (!n) return undefined;
  const level = pactSlotLevel ?? 1;
  const rest = pactSlotLevel !== undefined ? "a Short or Long Rest" : "a Long Rest";
  return `${n} level ${level} spell slot${n === 1 ? "" : "s"}; they all come back after ${rest}.`;
}
