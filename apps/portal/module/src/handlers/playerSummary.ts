/**
 * `query-player`'s `summary` and `notes` sections: who the character is, read from the
 * stored source plus the live hp. Also the wire's pool shape, which `query-party` shares.
 */
import { type PlayerNotesSection, type PlayerSummarySection } from "@astra/portal-shared";

import {
  actorAlliance,
  actorBiography,
  actorHeroPoints,
  actorHp,
  actorLanguages,
  actorLevel,
  actorXp,
  type BiographySection,
  familiarMasterId,
  firstItemName,
  liveSystem,
  type Pf2eSource,
  type Pf2eSystem,
  sourceSystem,
} from "../pf2e";

/** `{value, max}` when both are numbers, else `undefined` (the wire's pool shape). */
export function fullPool(
  pool: { value?: number; max?: number } | undefined,
): { value: number; max: number } | undefined {
  return pool?.value !== undefined && pool.max !== undefined
    ? { value: pool.value, max: pool.max }
    : undefined;
}

export function buildSummary(doc: FoundryDocumentLike, src: Pf2eSource): PlayerSummarySection {
  const source = sourceSystem(src);
  // Prefer the live `system` (has derived hp.max) but fall back to the stored source
  // (familiars/edge cases where the live surface isn't stubbed, e.g. in tests).
  const system: Pf2eSystem = liveSystem(doc) ?? source;
  const hp = actorHp(system);
  const masterId = familiarMasterId(system);
  // Resolve the master's NAME like the party companion row does — an id is useless
  // to a player-facing render (S4 live-gate find).
  const master = masterId !== undefined ? (game.actors.get(masterId)?.name ?? masterId) : undefined;

  return {
    section: "summary",
    uuid: doc.uuid,
    id: doc.id,
    name: doc.name,
    actorType: doc.type ?? "unknown",
    level: actorLevel(system),
    xp: fullPool(actorXp(system)),
    hp: hp?.value !== undefined ? { value: hp.value, max: hp.max, temp: hp.temp } : undefined,
    // Hero points come from the stored source (pf2e zeroes the live value; 0/0 rendered at
    // the 0028 S4 live gate while the source said 1/3).
    heroPoints: fullPool(actorHeroPoints(source, system)),
    ancestry: firstItemName(src, "ancestry"),
    heritage: firstItemName(src, "heritage"),
    background: firstItemName(src, "background"),
    className: firstItemName(src, "class"),
    deity: firstItemName(src, "deity"),
    languages: actorLanguages(system),
    alliance: actorAlliance(system),
    master,
  };
}

/** `query-player`'s `notes` section (0028 S2, S3-amended) — deity (an embedded
 * `deity`-type item's name, never gated) plus non-empty biography prose fields,
 * EXCLUDING any subsection the GM has left/set GM-only via pf2e's own biography
 * visibility toggles (`actorBiography(...).visible`, `pf2e/actor.ts`). Two of the
 * four prose fields (`likes`/`dislikes` under `personality`; `campaignNotes` under
 * `campaign`) share a flag with sibling fields this section doesn't surface; gating by
 * that shared flag is correct, it's the section pf2e itself groups them under.
 * D28-5's uniform rationale
 * — the bridge runs as GM and must not leak GM-hidden content in ANY scope —
 * applies here too (the S2-amendment gap this fixes): the shared player key having
 * no per-player identity (D28-1) means "hide this from players" always means
 * "hide from every holder of this key", the same posture as a GM-hidden world item
 * or a spoiler compendium pack. */
export function buildNotes(src: Pf2eSource): PlayerNotesSection {
  const bio = actorBiography(sourceSystem(src));
  const visibleProse = (v: string | undefined, section: BiographySection): string | undefined =>
    v !== undefined && v.length > 0 && bio.visible(section) ? v : undefined;
  return {
    section: "notes",
    deity: firstItemName(src, "deity"),
    appearance: visibleProse(bio.appearance, "appearance"),
    backstory: visibleProse(bio.backstory, "backstory"),
    likes: visibleProse(bio.likes, "personality"),
    dislikes: visibleProse(bio.dislikes, "personality"),
    campaignNotes: visibleProse(bio.campaignNotes, "campaign"),
  };
}
