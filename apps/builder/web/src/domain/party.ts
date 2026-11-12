// The party phrase: the secret in the group link `/p/<phrase>`. Client-safe (no node imports),
// because the route and the "Not <name>?" link read what the browser remembers.

import { z } from "zod";

/** Lower-case letters and digits in groups joined by single hyphens. */
const PARTY_WORD_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Whether `s` is a party phrase: 3 to 64 characters in the shape above. */
export function isPartyWord(s: string): boolean {
  return s.length >= 3 && s.length <= 64 && PARTY_WORD_PATTERN.test(s);
}

const PartyWord = z.string().refine(isPartyWord, "not a party phrase");

/** `party.json`: the phrase and when it was set. */
export const PartyFile = z.object({ word: PartyWord, createdAt: z.iso.datetime() }).strict();
export type PartyFile = z.infer<typeof PartyFile>;

/** One player of the party, as the group page lists them. */
export interface PartyMember {
  id: string;
  name: string;
}

const STORAGE_KEY = "builder.party";

/** The player this browser remembers and the phrase they came by. */
const RememberedPlayer = z.object({ id: z.string(), word: PartyWord });
type RememberedPlayer = z.infer<typeof RememberedPlayer>;

/** What the browser remembers, or `undefined` (nothing stored, bad data, or no storage). */
export function readRemembered(): RememberedPlayer | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = RememberedPlayer.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Remembers the player and the phrase. A browser without storage just forgets. */
export function remember(player: RememberedPlayer): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(player));
  } catch {
    // No storage (private window, blocked): the pages work without it.
  }
}

/** Forgets the remembered player. */
export function forget(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No storage: nothing to forget.
  }
}
