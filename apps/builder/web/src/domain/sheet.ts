// Turns a built `Character` into the plain words the sheet prints: when on a turn each thing
// is used, what to roll for an attack or a spell, and one card per feature and spell. Each
// thing is described once, on its card; "On your turn" names it and says how often. Pure, so
// the player page, the DM page and the tests share it.

import type { Ability, Activation } from "./contentTypes";
import {
  type AttackLine,
  type Character,
  type FeatureLine,
  isAttackCantrip,
  type SpellEntry,
} from "./engine";

/** Where the sheet lists each activation; the curation and the spell data set it, never the
 * wording of a summary. */
const ACTIVATION_LABEL: Record<Activation, string> = {
  action: "Your action",
  bonus: "Your bonus action",
  reaction: "Your reaction",
  minute: "Takes a minute or more",
  passive: "Always on, or when it says",
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

/** "Roll a d20 + 5 to hit. On a hit, roll 2d6 + 3 Slashing damage." */
export function attackRoll(a: AttackLine): string {
  const dmg = `${a.damage} ${a.damageType}`.trim();
  if (a.toHit === undefined && a.save) {
    return `The target makes a ${ABILITY_NAMES[a.save.ability]} save against DC ${a.save.dc}. If it fails, it takes ${dmg} damage.`;
  }
  return `Roll a ${d20(a.toHit ?? 0)} to hit. On a hit, roll ${dmg} damage.`;
}

/** The damage sentence for one way a spell's damage lands. */
function damageSentence(at: NonNullable<SpellEntry["attack"]>, dmg: string): string {
  switch (at.damageOn) {
    case "attack":
      return `Roll a ${d20(at.toHit ?? 0)} to hit. On a hit, roll ${dmg} damage.`;
    case "save": {
      const half = at.halfOnSave ? "; on a success, half as much" : "";
      return `On a failure, roll ${dmg} damage${half}.`;
    }
    case "weapon-hit":
      return `When your attack hits, add ${dmg} damage.`;
    case "each-turn":
      return `On a failure, the target takes ${dmg} damage at the start of each of its turns while the spell lasts.`;
    case "weapon-die":
      return `While it lasts, the weapon rolls ${at.damage ?? dmg} for damage instead of its own die.`;
    default:
      return `It hits with no roll: roll ${dmg} damage.`;
  }
}

/**
 * What to roll for a spell, or `undefined` when it needs no roll: the attack or save, the
 * damage with how it lands, the healing, then any roll the first can't say (`rollNote`).
 */
export function spellRoll(s: SpellEntry): string | undefined {
  const { first, last } = s.attack ? attackSentences(s.attack) : { first: [], last: [] };
  const parts = [
    ...first,
    ...(s.healing ? [`The creature regains ${s.healing} Hit Points.`] : []),
    ...(s.rollNote ? [s.rollNote] : []),
    ...last,
  ];
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/** A spell's attack, save and damage sentences; `last` goes after the roll note. */
function attackSentences(at: NonNullable<SpellEntry["attack"]>): {
  first: string[];
  last: string[];
} {
  const dmg = at.damage ? `${at.damage} ${at.damageType ?? ""}`.trim() : undefined;
  const save = at.save
    ? [`Targets make a ${ABILITY_NAMES[at.save.ability]} save against DC ${at.save.dc}.`]
    : [];
  if (!dmg) {
    const hit = at.toHit === undefined ? [] : [`Roll a ${d20(at.toHit)} to hit.`];
    return { first: [...hit, ...save], last: [] };
  }
  if (at.damageOn === "save" || at.damageOn === "each-turn") {
    return { first: [...save, damageSentence(at, dmg)], last: [] };
  }
  // A save the damage doesn't hang on (Ice Knife's burst, Searing Smite's flames): the note
  // says what it is for, so its numbers follow the note.
  const later = at.save
    ? [`The ${ABILITY_NAMES[at.save.ability]} save is against DC ${at.save.dc}.`]
    : [];
  return { first: [damageSentence(at, dmg)], last: later };
}

/** How often a spell can be cast, in plain words. */
function spellUses(s: SpellEntry): string {
  if (s.level === 0) return "As often as you like";
  if (s.freeCasts) return `${s.freeCasts} without a slot, or spend a spell slot`;
  return "Spend a spell slot";
}

/** An "On your turn" entry: a name and how often. What it does is on its card. */
export interface TurnItem {
  id: string;
  name: string;
  uses?: string;
}

interface TurnPlan {
  action: TurnItem[];
  bonus: TurnItem[];
  reaction: TurnItem[];
  always: TurnItem[];
  /** Spells cast with an action, named in one line under the action; `id` is the spell's card. */
  actionSpells: TurnItem[];
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

/** The card id of the cantrip an attack line is, or `undefined` for a weapon or unarmed
 * attack, which have no card. */
export function attackCardId(c: Character, a: AttackLine): string | undefined {
  if (a.kind !== "cantrip") return undefined;
  const spell = allSpells(c).find((s) => s.name === a.name);
  return spell ? `spell-${spell.id}` : undefined;
}

function featureItem(f: FeatureLine): TurnItem {
  return { id: f.id, name: f.name, ...(f.uses && { uses: f.uses }) };
}

/** The "On your turn" layout: features and spells grouped by when they're used. */
export function turnPlan(c: Character): TurnPlan {
  const plan: TurnPlan = { action: [], bonus: [], reaction: [], always: [], actionSpells: [] };
  for (const f of c.features) {
    // Something that takes a minute or more isn't used on a turn; its card still says so.
    if (f.activation === "minute") continue;
    plan[f.activation === "passive" ? "always" : f.activation].push(featureItem(f));
  }
  for (const s of allSpells(c)) {
    const slot = s.activation;
    if (slot === "action") {
      // Cantrips that attack already appear as attacks.
      if (!isAttackCantrip(s)) plan.actionSpells.push({ id: `spell-${s.id}`, name: s.name });
    } else if (slot === "bonus" || slot === "reaction") {
      plan[slot].push({ id: `spell-${s.id}`, name: s.name, uses: spellUses(s) });
    }
  }
  return plan;
}

export interface SheetCard {
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

/**
 * One cut-out card per feature and per spell, in sheet order: the one place the sheet says
 * what each does. A feature's text is its summary; a spell's is its one-line gist, since the
 * card's roll, chips and small print carry the rest.
 */
export function sheetCards(c: Character): SheetCard[] {
  const features: SheetCard[] = c.features.map((f) => ({
    id: f.id,
    name: f.name,
    kind: "Feature",
    when: ACTIVATION_LABEL[f.activation],
    uses: f.uses,
    text: f.summary,
  }));
  const spells: SheetCard[] = allSpells(c).map((s) => {
    return {
      id: `spell-${s.id}`,
      name: s.name,
      kind: s.level === 0 ? "Cantrip" : "Level 1 spell",
      when: ACTIVATION_LABEL[s.activation],
      roll: spellRoll(s),
      uses: spellUses(s),
      text: s.note ? `${s.gist} (${s.note})` : s.gist,
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
