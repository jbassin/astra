import { FACTIONS, factionBySlug } from "@/generated/factions";

export interface Faction {
  name: string;
  slug: string;
  color: string;
  order: number;
  symbol: string | null;
  /** The whole faction body, authored in vellum and rendered to static HTML. */
  description: string;
}

// oxlint-disable-next-line require-await -- route loaders call this as async; content is build-time today
export async function getAllFactions(): Promise<Faction[]> {
  return FACTIONS as Faction[];
}

// oxlint-disable-next-line require-await -- route loaders call this as async; content is build-time today
export async function getFactionBySlug(slug: string): Promise<Faction | null> {
  return factionBySlug(slug) ?? null;
}
