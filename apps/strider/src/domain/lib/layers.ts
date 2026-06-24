import {
  CURRENT_FACTION_BORDERS,
  CURRENT_FACTION_HEXES,
  CURRENT_FACTION_TERRITORY_BORDERS,
  CURRENT_REGIONS,
  CURRENT_SKEIN,
  CURRENT_UNOWNED_HEXES,
  LAYERS,
} from "@/generated/layers";
import {
  type Banner,
  type Change,
  type FactionFlipAnim,
  foldBanners,
  foldFactionOverrides,
  foldRegions,
  foldSkein,
  type Layer,
  type LayerAnimation,
  type Region,
  type SkeinConnection,
  type SkeinRegion,
  type SkeinState,
} from "./regions";

export type {
  Banner,
  Change,
  FactionFlipAnim,
  Layer,
  LayerAnimation,
  Region,
  SkeinConnection,
  SkeinRegion,
  SkeinState,
};
export {
  CURRENT_FACTION_BORDERS,
  CURRENT_FACTION_HEXES,
  CURRENT_FACTION_TERRITORY_BORDERS,
  CURRENT_UNOWNED_HEXES,
  foldBanners,
  foldFactionOverrides,
  foldRegions,
  foldSkein,
};

export async function getAllLayers(): Promise<Layer[]> {
  return LAYERS as Layer[];
}

export async function getCurrentRegions(): Promise<Region[]> {
  return CURRENT_REGIONS as Region[];
}

export async function getCurrentSkein(): Promise<SkeinState> {
  return CURRENT_SKEIN;
}
