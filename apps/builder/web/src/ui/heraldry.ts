// Presentation only: the icon and heraldic hue for every class, archetype, species,
// background, ability, damage type, spell school and turn slot. Each class keeps one hue and
// one icon everywhere it appears (its choice card, the sheet banner, its cards).

import type { CSSProperties } from "react";

import type { Ability, ArchetypeId, BackgroundId, ClassId, SpeciesId } from "@/domain/contentTypes";
import type { IconName } from "@/generated/icons";

interface Tincture {
  icon: IconName;
  /** OKLCH hue angle. */
  hue: number;
  /** OKLCH chroma at the fill's lightness. */
  chroma: number;
}

export const CLASS_HERALDRY: Record<ClassId, Tincture> = {
  barbarian: { icon: "battle-axe", hue: 28, chroma: 0.15 },
  bard: { icon: "lyre", hue: 350, chroma: 0.13 },
  cleric: { icon: "holy-symbol", hue: 225, chroma: 0.11 },
  druid: { icon: "oak-leaf", hue: 150, chroma: 0.12 },
  fighter: { icon: "swords-emblem", hue: 245, chroma: 0.06 },
  monk: { icon: "mailed-fist", hue: 185, chroma: 0.1 },
  paladin: { icon: "templar-shield", hue: 262, chroma: 0.16 },
  ranger: { icon: "bow-arrow", hue: 125, chroma: 0.11 },
  rogue: { icon: "hooded-assassin", hue: 260, chroma: 0.025 },
  sorcerer: { icon: "fire-spell-cast", hue: 50, chroma: 0.15 },
  warlock: { icon: "warlock-eye", hue: 322, chroma: 0.15 },
  wizard: { icon: "pointy-hat", hue: 290, chroma: 0.16 },
};

export const ARCHETYPE_HERALDRY: Record<ArchetypeId, Tincture> = {
  warrior: { icon: "crossed-swords", hue: 28, chroma: 0.15 },
  scoundrel: { icon: "cloak-dagger", hue: 260, chroma: 0.03 },
  mage: { icon: "wizard-staff", hue: 290, chroma: 0.16 },
  healer: { icon: "healing", hue: 150, chroma: 0.12 },
};

/** The neutral tincture: the page's gilt, for things with no class of their own. */
const GILT: Tincture = { icon: "wax-seal", hue: 75, chroma: 0.1 };

/** The CSS custom properties a hued element reads (`--h`, `--c`; see tokens.css). */
export function hueStyle(t: Pick<Tincture, "hue" | "chroma"> | undefined): CSSProperties {
  const { hue, chroma } = t ?? GILT;
  const style: CSSProperties & { "--h": number; "--c": number } = { "--h": hue, "--c": chroma };
  return style;
}

const BY_CLASS_ID = new Map<string, Tincture>(Object.entries(CLASS_HERALDRY));

/** A built character's class (a plain string id) to its tincture. */
export function classTincture(id: string | undefined): Tincture | undefined {
  return id === undefined ? undefined : BY_CLASS_ID.get(id);
}

export const SPECIES_ICON: Record<SpeciesId, IconName> = {
  aasimar: "angel-wings",
  dragonborn: "dragon-head",
  dwarf: "dwarf-face",
  elf: "woman-elf-face",
  gnome: "gears",
  goliath: "mountains",
  halfling: "barefoot",
  human: "village",
  orc: "orc-head",
  tiefling: "devil-mask",
};

const BY_SPECIES_ID = new Map<string, IconName>(Object.entries(SPECIES_ICON));

/** A built character's species id to its icon. */
export function speciesIcon(id: string): IconName {
  return BY_SPECIES_ID.get(id) ?? "village";
}

export const BACKGROUND_ICON: Record<BackgroundId, IconName> = {
  acolyte: "candle-holder",
  artisan: "anvil",
  charlatan: "domino-mask",
  criminal: "lockpicks",
  entertainer: "juggling-clubs",
  farmer: "wheat",
  guard: "spear-hook",
  guide: "compass",
  hermit: "lantern-flame",
  merchant: "two-coins",
  noble: "crown",
  sage: "open-book",
  sailor: "anchor",
  scribe: "quill-ink",
  soldier: "visored-helm",
  wayfarer: "walking-boot",
};

const BY_BACKGROUND_ID = new Map<string, IconName>(Object.entries(BACKGROUND_ICON));

/** A built character's background id to its icon. */
export function backgroundIcon(id: string): IconName {
  return BY_BACKGROUND_ID.get(id) ?? "scroll-unfurled";
}

export const ABILITY_ICON: Record<Ability, IconName> = {
  str: "biceps",
  dex: "feather",
  con: "heart-beats",
  int: "brain",
  wis: "owl",
  cha: "smitten",
};

const DAMAGE_ICON: Record<string, IconName> = {
  slashing: "sword-slice",
  piercing: "arrowhead",
  bludgeoning: "flat-hammer",
  fire: "fire",
  cold: "snowflake-1",
  lightning: "lightning-arc",
  thunder: "sonic-boom",
  radiant: "sun",
  necrotic: "death-zone",
  poison: "poison-bottle",
  acid: "acid",
  psychic: "brain",
  force: "magic-swirl",
};

/** The icon for a damage type ("Slashing"), or the d20 when the type is unknown. */
export function damageIcon(type: string | undefined): IconName {
  return DAMAGE_ICON[(type ?? "").toLowerCase()] ?? "dice-twenty-faces-twenty";
}

const SCHOOL_ICON: Record<string, IconName> = {
  abjuration: "magic-shield",
  conjuration: "magic-portal",
  divination: "crystal-ball",
  enchantment: "smitten",
  evocation: "fireball",
  illusion: "ink-swirl",
  necromancy: "death-skull",
  transmutation: "transform",
};

export function schoolIcon(school: string | undefined): IconName {
  return SCHOOL_ICON[(school ?? "").toLowerCase()] ?? "spell-book";
}

type TurnSlotKey = "action" | "bonus" | "reaction" | "always" | "longer";

export const SLOT_ICON: Record<TurnSlotKey, IconName> = {
  action: "sword-brandish",
  bonus: "lightning-trio",
  reaction: "shield-reflect",
  always: "aura",
  longer: "hourglass",
};

/** The slot key behind sheet.ts's card label ("Your bonus action" → "bonus"). */
export function slotOfLabel(label: string): TurnSlotKey {
  const l = label.toLowerCase();
  if (l.includes("bonus")) return "bonus";
  if (l.includes("reaction")) return "reaction";
  if (l.includes("action")) return "action";
  if (l.includes("minute")) return "longer";
  return "always";
}
