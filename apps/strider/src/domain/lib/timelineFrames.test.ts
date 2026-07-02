import { describe, expect, it } from "vitest";

import {
  computeEffectiveAssignments,
  FACTION_HEXES,
  UNOWNED_BASE_HEXES,
} from "@/domain/lib/hexUtils";
import { foldFactionOverrides, foldRegions, foldSkein } from "@/domain/lib/regions";
import { FACTIONS } from "@/generated/factions";
import { LAYERS } from "@/generated/layers";

import { buildTimelineFrames } from "./timelineFrames";

const factions = [...FACTIONS];
const layers = [...LAYERS];
const slugs = factions.map((f) => f.slug);

describe("buildTimelineFrames", () => {
  const frames = buildTimelineFrames(layers, factions, slugs);

  it("produces one frame per cursor position (0..layerCount)", () => {
    expect(frames.length).toBe(layers.length + 1);
  });

  it("frame[0] is the empty base state with no banners or events", () => {
    const base = frames[0]!;
    expect(base.renderFactions.length).toBe(factions.length); // no banner pseudo-factions
    expect(base.activeBanners.size).toBe(0);
    expect(base.regions.length).toBe(0);
    expect(base.skein.regions.length).toBe(0);
  });

  // The precomputed frame must equal folding the prefix directly — verified at
  // the start, a midpoint, and the final cursor.
  for (const i of [0, Math.floor(layers.length / 2), layers.length]) {
    it(`frame[${i}] matches a direct fold of layers.slice(0, ${i})`, () => {
      const frame = frames[i]!;
      const prefix = layers.slice(0, i);
      const expectedEffective = computeEffectiveAssignments(
        FACTION_HEXES,
        UNOWNED_BASE_HEXES,
        foldFactionOverrides(prefix),
        slugs,
      );
      expect(frame.effectiveFactionHexes).toEqual(expectedEffective.perFaction);
      expect(frame.unownedHexes).toEqual(expectedEffective.unowned);
      expect(frame.regions).toEqual(foldRegions(prefix));
      expect(frame.skein).toEqual(foldSkein(prefix));
    });
  }
});
