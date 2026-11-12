// The builder's data shapes, shared by the server store, the server functions and the UI:
// the roster of invited players and the saved character document. Plain zod and constants,
// so the client bundle can import it.

import { z } from "zod";

import {
  ARCHETYPE_IDS,
  BACKGROUND_IDS,
  CLASS_IDS,
  OPTION_GROUP_KEYS,
  SPECIES_IDS,
} from "./contentTypes";

/** A player id: 128 random bits, base64url without padding (22 characters). */
export const PlayerId = z.string().regex(/^[A-Za-z0-9_-]{22}$/, "not a player id");
export type PlayerId = z.infer<typeof PlayerId>;

export const RosterEntry = z
  .object({
    id: PlayerId,
    name: z.string().min(1).max(80),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type RosterEntry = z.infer<typeof RosterEntry>;

export const Roster = z.array(RosterEntry);
export type Roster = z.infer<typeof Roster>;

/** The four starting archetypes; content/classes.ts says which classes each one offers. */
export const ARCHETYPES = [
  { id: "warrior", label: "Warrior", blurb: "Stands in front, hits hard and takes the hits." },
  {
    id: "scoundrel",
    label: "Scoundrel",
    blurb: "Sneaky, quick and clever; strikes where it hurts.",
  },
  { id: "mage", label: "Mage", blurb: "Bends the world with spells from a distance." },
  { id: "healer", label: "Healer", blurb: "Keeps friends standing and turns the tide with faith." },
] as const;

const Archetype = z.enum(ARCHETYPE_IDS);

/** A content id: a lower-case slug (a class option). */
const Slug = z.string().regex(/^[a-z0-9-]{1,40}$/, "not a content id");

/**
 * Every answer a player can give. Each is optional, so a half-finished character is valid, and
 * every string and array is bounded. Ids of curated content (class options) are slugs rather
 * than enums, so a document saved before a curation change still parses; `pruneAnswers`
 * (steps.ts) drops ids the content no longer offers. New steps add fields here; a change that
 * breaks old documents bumps `schemaVersion`. Spells and the species sub-choice are never
 * answers: the builder decides them (`spellPicks` and `speciesOptionOf` in content.ts).
 */
export const Answers = z
  .object({
    archetype: Archetype.optional(),
    classId: z.enum(CLASS_IDS).optional(),
    speciesId: z.enum(SPECIES_IDS).optional(),
    backgroundId: z.enum(BACKGROUND_IDS).optional(),
    /** Class option picks by group (fighting style, divine order, invocations, …). */
    options: z.partialRecord(z.enum(OPTION_GROUP_KEYS), z.array(Slug).max(6)).optional(),
    name: z.string().max(80).optional(),
    look: z.string().max(2000).optional(),
    personality: z.string().max(2000).optional(),
  })
  .strict();
export type Answers = z.infer<typeof Answers>;

/** `<data-dir>/characters/<id>.json`. */
export const CharacterDoc = z
  .object({
    schemaVersion: z.literal(1),
    updatedAt: z.iso.datetime(),
    answers: Answers,
  })
  .strict();
export type CharacterDoc = z.infer<typeof CharacterDoc>;

/**
 * The steps of the flow, in order. Whether a step applies and is complete depends on the content
 * (a Barbarian has no class options): see `stepStatuses` in steps.ts.
 */
export const STEPS = [
  { key: "archetype", label: "Archetype" },
  { key: "class", label: "Class" },
  { key: "species", label: "Species" },
  { key: "background", label: "Background" },
  { key: "options", label: "Class choices" },
  { key: "name", label: "Name" },
  { key: "look", label: "Look" },
  { key: "personality", label: "Personality" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];
