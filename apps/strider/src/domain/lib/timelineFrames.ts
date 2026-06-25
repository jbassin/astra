import type { Faction } from "@/domain/lib/factions";
import {
  computeAssignmentBorders,
  computeBannerAssignments,
  computeEffectiveAssignments,
  type EdgeSegment,
  FACTION_HEXES,
  UNOWNED_BASE_HEXES,
} from "@/domain/lib/hexUtils";
import {
  type Banner,
  foldBanners,
  foldFactionOverrides,
  foldRegions,
  foldSkein,
  type Layer,
  type Region,
  type SkeinState,
} from "@/domain/lib/regions";

// The fully-derived map state at one timeline cursor. Precomputing the whole
// array up front turns scrubbing / jumping to any layer into an O(1) lookup
// instead of re-folding `layers.slice(0, index)` from scratch on every step
// (which was O(index) per step, O(n²) across a full replay).
export interface TimelineFrame {
  regions: Region[];
  skein: SkeinState;
  // Pre-banner effective assignment. Kept for the flip animation, which compares
  // a layer's hexes against the previous frame's per-hex owner.
  effectiveFactionHexes: Array<Array<[number, number]>>;
  unownedHexes: Array<[number, number]>;
  // The banner-merged state HexMap actually paints.
  renderFactions: Faction[];
  renderFactionHexes: Array<Array<[number, number]>>;
  factionBorders: EdgeSegment[];
  territoryBorders: EdgeSegment[][];
  activeBanners: Map<string, Banner>;
}

// A banner renders as a synthetic faction appended to the faction list, so the
// existing fill / border / hover / click machinery applies unchanged.
export function bannerPseudoFaction(banner: Banner, order: number): Faction {
  return {
    name: banner.name,
    slug: banner.slug,
    color: banner.color,
    order,
    symbol: banner.symbol,
    description: "",
  };
}

// Builds frame[0..layers.length] — frame[i] is the state with the first `i`
// layers applied. Pure + deterministic, so callers memoize it on the layer set.
export function buildTimelineFrames(
  layers: Layer[],
  factions: Faction[],
  factionSlugs: ReadonlyArray<string>,
): TimelineFrame[] {
  const frames: TimelineFrame[] = [];
  for (let i = 0; i <= layers.length; i++) {
    const prefix = layers.slice(0, i);
    const overrides = foldFactionOverrides(prefix);
    const effective = computeEffectiveAssignments(
      FACTION_HEXES,
      UNOWNED_BASE_HEXES,
      overrides,
      factionSlugs,
    );
    const banners = foldBanners(prefix);
    const { bannerGroups, remainingPerFaction } = computeBannerAssignments(
      effective.perFaction,
      factionSlugs,
      banners,
    );
    const pseudoFactions = banners.map((b, j) => bannerPseudoFaction(b, factions.length + j + 1));
    const renderFactionHexes = [...remainingPerFaction, ...bannerGroups.map((g) => g.hexes)];
    const { allBorders, perFaction } = computeAssignmentBorders(renderFactionHexes);
    frames.push({
      regions: foldRegions(prefix),
      skein: foldSkein(prefix),
      effectiveFactionHexes: effective.perFaction,
      unownedHexes: effective.unowned,
      renderFactions: [...factions, ...pseudoFactions],
      renderFactionHexes,
      factionBorders: allBorders,
      territoryBorders: perFaction,
      activeBanners: new Map(banners.map((b) => [b.slug, b])),
    });
  }
  return frames;
}
