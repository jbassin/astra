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

export async function getAllFactions(): Promise<Faction[]> {
  return FACTIONS as Faction[];
}

export async function getFactionBySlug(slug: string): Promise<Faction | null> {
  return factionBySlug(slug) ?? null;
}
