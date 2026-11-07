// The builder's data shapes, shared by the server store, the server functions and the UI:
// the roster of invited players and the saved character document. Plain zod and constants,
// so the client bundle can import it.

import { z } from "zod";

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

/** The four starting archetypes; Josh narrows each to classes later. */
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

const Archetype = z.enum(["warrior", "scoundrel", "mage", "healer"]);

/**
 * Every answer a player can give. Each is optional, so a half-finished character is valid.
 * New steps add fields here; a change that breaks old documents bumps `schemaVersion`.
 */
export const Answers = z
  .object({
    archetype: Archetype.optional(),
    name: z.string().max(80).optional(),
    look: z.string().max(2000).optional(),
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

/** The steps of the flow, in order, and whether each is answered. */
export const STEPS = [
  { key: "archetype", label: "Archetype" },
  { key: "name", label: "Name" },
  { key: "look", label: "Look" },
] as const satisfies ReadonlyArray<{ key: keyof Answers; label: string }>;

export type StepKey = (typeof STEPS)[number]["key"];

export function isAnswered(answers: Answers, key: StepKey): boolean {
  const value = answers[key];
  return typeof value === "string" && value.trim() !== "";
}

/** The keys of the answered steps, in flow order. */
export function answeredSteps(answers: Answers): StepKey[] {
  return STEPS.filter((s) => isAnswered(answers, s.key)).map((s) => s.key);
}
