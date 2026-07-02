import type { Banner } from "./regions";

export const GRID_RADIUS = 35;
export const HEX_SIZE = 2; // pixels per axial unit — the single source of truth
const RING_RADIUS = 85; // pixel distance from center to each faction center
const TERRITORY_RADIUS = 38; // pixel radius of each faction's territory; visual tuning parameter

// Pixel center of a hex in flat-top SVG coordinates (y-down)
export function hexPixel(q: number, r: number): [number, number] {
  return [1.5 * q * HEX_SIZE, Math.sqrt(3) * (q / 2 + r) * HEX_SIZE];
}

// Pixel center of faction i's territory (0-based index).
// Clock arrangement: faction index 19 (order 20) at 12 o'clock, then 0,1,2... clockwise.
// angle(k) = π/2 − k·(π/10); k = (i+1) % 20
function factionCenterPixel(i: number): [number, number] {
  const k = (i + 1) % 20;
  const angle = Math.PI / 2 - k * (Math.PI / 10);
  return [RING_RADIUS * Math.cos(angle), -RING_RADIUS * Math.sin(angle)];
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

// Pre-compute the hex-to-faction assignment once. A hex is assigned to its nearest
// faction center if that center is within TERRITORY_RADIUS; otherwise it falls to
// the Harlequins (index 19), who claim the central donut hole the ring can't reach.
const HARLEQUINS_INDEX = 19;

function computeAssignments(): {
  factionHexes: Array<Array<readonly [number, number]>>;
  unownedBase: Array<readonly [number, number]>;
} {
  const factionHexes: Array<Array<readonly [number, number]>> = Array.from(
    { length: 20 },
    () => [],
  );

  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    for (
      let r = Math.max(-GRID_RADIUS, -q - GRID_RADIUS);
      r <= Math.min(GRID_RADIUS, -q + GRID_RADIUS);
      r++
    ) {
      const [px, py] = hexPixel(q, r);
      let nearestIdx = -1;
      let nearestDist = Infinity;
      for (let i = 0; i < 20; i++) {
        const [cx, cy] = factionCenterPixel(i);
        const d = dist(px, py, cx, cy);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }
      if (nearestDist <= TERRITORY_RADIUS) {
        factionHexes[nearestIdx]!.push([q, r]);
      } else {
        factionHexes[HARLEQUINS_INDEX]!.push([q, r]);
      }
    }
  }

  // The base map only owns the Harlequins' donut hole. Everything the
  // geometric algorithm assigned to the ring factions starts unowned and is
  // moved into faction control by `claim` layers.
  const unownedBase: Array<readonly [number, number]> = [];
  for (let i = 0; i < factionHexes.length; i++) {
    if (i === HARLEQUINS_INDEX) continue;
    unownedBase.push(...factionHexes[i]!);
    factionHexes[i] = [];
  }

  return { factionHexes, unownedBase };
}

const { factionHexes, unownedBase } = computeAssignments();

// Static hex assignments. Each inner array contains [q, r] coords for that faction (0-based index).
// Computed at module load and never recalculated at render time. Only the
// Harlequins (index 19) have a non-empty base segment; the other 19 factions
// hold no territory until their `*-arrives.kdl` claim layer fires.
export const FACTION_HEXES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = factionHexes;

// Hexes that the geometric algorithm assigns to factions 0-18 — i.e. every
// hex on the map outside the Harlequins' donut hole. They start unowned and
// are moved into faction control by claim overrides.
export const UNOWNED_BASE_HEXES: ReadonlyArray<readonly [number, number]> = unownedBase;

export type EdgeSegment = readonly [number, number, number, number]; // [x1, y1, x2, y2]

// The six flat-top hex corner points, in fixed order. A fixed-length tuple so
// indexing by a HEX_NEIGHBORS vertex index (0–5) is provably in-bounds under
// noUncheckedIndexedAccess.
type Pt = [number, number];
export type HexVerts = [Pt, Pt, Pt, Pt, Pt, Pt];

const HEX_CORNER_HEIGHT = (Math.sqrt(3) / 2) * HEX_SIZE;

// Six flat-top hex corners around a pixel center, in fixed order — the ONE
// definition of hex corner geometry, shared by the border walks (below) and the
// Pixi renderer (pixiScene.hexVertsAtPixel).
export function hexCornersAtPixel(px: number, py: number): HexVerts {
  return [
    [px + HEX_SIZE, py],
    [px + HEX_SIZE / 2, py + HEX_CORNER_HEIGHT],
    [px - HEX_SIZE / 2, py + HEX_CORNER_HEIGHT],
    [px - HEX_SIZE, py],
    [px - HEX_SIZE / 2, py - HEX_CORNER_HEIGHT],
    [px + HEX_SIZE / 2, py - HEX_CORNER_HEIGHT],
  ];
}

// Corners of the hex at axial (q, r).
export function hexCorners(q: number, r: number): HexVerts {
  const [px, py] = hexPixel(q, r);
  return hexCornersAtPixel(px, py);
}

// Each entry: [dq, dr, vertexA, vertexB] — the neighbor in direction (dq, dr)
// shares the edge between corners vertexA and vertexB. The ONE neighbor/edge
// table for both border walks.
export const HEX_NEIGHBORS = [
  [+1, 0, 0, 1],
  [0, +1, 1, 2],
  [-1, +1, 2, 3],
  [-1, 0, 3, 4],
  [0, -1, 4, 5],
  [+1, -1, 5, 0],
] as const;

// Border computation, parameterized so it can be applied to either the static
// base assignment or the effective (claim-folded) assignment.
export function computeAssignmentBorders(
  assignments: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
): {
  allBorders: EdgeSegment[];
  perFaction: EdgeSegment[][];
} {
  const hexFaction = new Map<string, number>();
  for (let i = 0; i < assignments.length; i++) {
    for (const [q, r] of assignments[i]!) {
      hexFaction.set(`${q},${r}`, i);
    }
  }

  const allEdgeSet = new Set<string>();
  const allBorders: EdgeSegment[] = [];
  const perFaction: EdgeSegment[][] = Array.from({ length: assignments.length }, () => []);

  for (let fi = 0; fi < assignments.length; fi++) {
    const factionEdgeSet = new Set<string>();
    for (const [q, r] of assignments[fi]!) {
      const v = hexCorners(q, r);
      for (const [dq, dr, va, vb] of HEX_NEIGHBORS) {
        const nfi = hexFaction.get(`${q + dq},${r + dr}`) ?? -1;
        if (nfi === fi) continue;

        const seg: EdgeSegment = [v[va][0], v[va][1], v[vb][0], v[vb][1]];

        const fKey = `${v[va][0]},${v[va][1]},${v[vb][0]},${v[vb][1]}`;
        if (!factionEdgeSet.has(fKey)) {
          factionEdgeSet.add(fKey);
          perFaction[fi]!.push(seg);
        }

        // Canonical key so the A→B edge and B→A edge deduplicate to one entry
        if (fi < nfi || nfi === -1) {
          if (!allEdgeSet.has(fKey)) {
            allEdgeSet.add(fKey);
            allBorders.push(seg);
          }
        }
      }
    }
  }

  return { allBorders, perFaction };
}

const { allBorders, perFaction: borderPerFaction } = computeAssignmentBorders(factionHexes);

// All unique faction-boundary edge segments (for the always-visible dark base border layer).
export const FACTION_BORDERS: ReadonlyArray<EdgeSegment> = allBorders;

// Per-faction boundary edges (index = faction index). Used for the hover glow overlay.
// Edges shared between two factions appear in both factions' arrays.
export const FACTION_TERRITORY_BORDERS: ReadonlyArray<ReadonlyArray<EdgeSegment>> =
  borderPerFaction;

// Perimeter edges for an arbitrary hex set (e.g. a region). Same edge-walk as
// computeBorders, but standalone so it can be called per-region at render time.
export function computeRegionBorders(
  regionHexes: ReadonlyArray<readonly [number, number]>,
): EdgeSegment[] {
  const inRegion = new Set(regionHexes.map(([q, r]) => `${q},${r}`));

  const seen = new Set<string>();
  const edges: EdgeSegment[] = [];
  for (const [q, r] of regionHexes) {
    const v = hexCorners(q, r);
    for (const [dq, dr, va, vb] of HEX_NEIGHBORS) {
      if (inRegion.has(`${q + dq},${r + dr}`)) continue;
      const key = `${v[va][0]},${v[va][1]},${v[vb][0]},${v[vb][1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([v[va][0], v[va][1], v[vb][0], v[vb][1]]);
    }
  }
  return edges;
}

// Applies a per-hex override map on top of a base faction assignment plus a
// base "unowned" pool. The override map is keyed by "q,r" and stores either a
// faction slug or `null` (explicitly unowned). Hexes not in the map fall back
// to their base bucket: per-faction hexes stay with their faction; base-
// unowned hexes stay unowned. Returns the effective per-faction hex arrays
// plus a separate `unowned` list.
export function computeEffectiveAssignments(
  baseHexes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  baseUnowned: ReadonlyArray<readonly [number, number]>,
  overrides: Map<string, string | null>,
  factionSlugs: ReadonlyArray<string>,
): {
  perFaction: Array<Array<[number, number]>>;
  unowned: Array<[number, number]>;
} {
  const slugToIdx = new Map<string, number>();
  factionSlugs.forEach((slug, i) => {
    slugToIdx.set(slug, i);
  });

  const perFaction: Array<Array<[number, number]>> = Array.from(
    { length: factionSlugs.length },
    () => [],
  );
  const unowned: Array<[number, number]> = [];

  for (let baseIdx = 0; baseIdx < baseHexes.length; baseIdx++) {
    for (const [q, r] of baseHexes[baseIdx]!) {
      const key = `${q},${r}`;
      if (!overrides.has(key)) {
        perFaction[baseIdx]!.push([q, r]);
        continue;
      }
      const target = overrides.get(key) ?? null;
      if (target === null) {
        unowned.push([q, r]);
        continue;
      }
      const targetIdx = slugToIdx.get(target);
      if (targetIdx === undefined) {
        throw new Error(
          `computeEffectiveAssignments: claim references unknown faction '${target}' at hex [${q}, ${r}]`,
        );
      }
      perFaction[targetIdx]!.push([q, r]);
    }
  }

  for (const [q, r] of baseUnowned) {
    const key = `${q},${r}`;
    if (!overrides.has(key)) {
      unowned.push([q, r]);
      continue;
    }
    const target = overrides.get(key) ?? null;
    if (target === null) {
      unowned.push([q, r]);
      continue;
    }
    const targetIdx = slugToIdx.get(target);
    if (targetIdx === undefined) {
      throw new Error(
        `computeEffectiveAssignments: claim references unknown faction '${target}' at hex [${q}, ${r}]`,
      );
    }
    perFaction[targetIdx]!.push([q, r]);
  }

  return { perFaction, unowned };
}

export interface BannerAssignment {
  banner: Banner;
  hexes: Array<[number, number]>;
  // "q,r" → constituent faction index (which member the hex belonged to), so
  // hover/detail can name the original owner under the unified banner color.
  constituents: Array<readonly [string, number]>;
}

// Pulls member-faction hexes into banner groups, run AFTER
// computeEffectiveAssignments. Any hex owned by a member faction joins its
// banner (painted the single banner color); the constituent faction index is
// retained per hex. Returns the banner groups plus the per-faction assignment
// with member hexes removed, so a banner's factions don't also paint their own
// color. Throws if a banner names a faction slug that doesn't exist.
export function computeBannerAssignments(
  perFaction: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  factionSlugs: ReadonlyArray<string>,
  banners: ReadonlyArray<Banner>,
): {
  bannerGroups: BannerAssignment[];
  remainingPerFaction: Array<Array<[number, number]>>;
} {
  const slugToIdx = new Map<string, number>();
  factionSlugs.forEach((slug, i) => {
    slugToIdx.set(slug, i);
  });

  const remainingPerFaction: Array<Array<[number, number]>> = perFaction.map((hexes) =>
    hexes.map(([q, r]) => [q, r] as [number, number]),
  );

  const bannerGroups: BannerAssignment[] = banners.map((banner) => {
    const hexes: Array<[number, number]> = [];
    const constituents: Array<readonly [string, number]> = [];
    for (const member of banner.members) {
      const idx = slugToIdx.get(member);
      if (idx === undefined) {
        throw new Error(
          `computeBannerAssignments: banner '${banner.slug}' references unknown faction '${member}'`,
        );
      }
      for (const [q, r] of remainingPerFaction[idx]!) {
        hexes.push([q, r]);
        constituents.push([`${q},${r}`, idx]);
      }
      remainingPerFaction[idx] = [];
    }
    return { banner, hexes, constituents };
  });

  return { bannerGroups, remainingPerFaction };
}

export function hexesInRadius(R: number): Array<[number, number]> {
  const hexes: Array<[number, number]> = [];
  for (let q = -R; q <= R; q++) {
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
      hexes.push([q, r]);
    }
  }
  return hexes;
}
