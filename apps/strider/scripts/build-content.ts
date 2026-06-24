// Pre-build content pipeline.
//
// Reads content/factions/*.vellum (vellum → HTML via gothic's DocumentView) and
// content/layers/*.kdl (KDL → change records), folds the layers, and emits typed
// TS modules under src/generated/. The runtime app imports those modules — never
// the filesystem — so the production bundle ships no fs / vellum / gothic-renderer
// / kdl dependency.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildContent,
  defineContentSource,
  emitModule,
  listFilesWithExtension,
  parseFrontmatter,
} from "@astra/content-build";
import { DocumentView } from "@astra/gothic";
import { parseDocument } from "@astra/vellum-lang";
import { type Node, parse } from "@bgotink/kdl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  computeAssignmentBorders,
  computeBannerAssignments,
  computeEffectiveAssignments,
  type EdgeSegment,
  FACTION_HEXES,
  UNOWNED_BASE_HEXES,
} from "../src/domain/lib/hexUtils.ts";
import {
  type Banner,
  type Change,
  foldBanners,
  foldFactionOverrides,
  foldRegions,
  foldSkein,
  type Layer,
  type Region,
  type SkeinState,
} from "../src/domain/lib/regions.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const FACTIONS_DIR = path.join(ROOT, "content", "factions");
const LAYERS_DIR = path.join(ROOT, "content", "layers");
const OUT_DIR = path.join(ROOT, "src", "generated");

interface Faction {
  name: string;
  slug: string;
  color: string;
  order: number;
  symbol: string | null;
  /** The whole faction body, authored in vellum and rendered to static HTML. */
  description: string;
}

// Render a faction's vellum body to static HTML at build time via gothic's
// DocumentView — the same renderer the akasha wiki uses. Build-only: react-dom/
// server + gothic + vellum-lang never reach the client bundle (the route injects
// the baked HTML). Factions have no wiki to cross-reference into, so the crossref
// resolver is a no-op.
function renderVellumBody(source: string): string {
  return renderToStaticMarkup(
    createElement(DocumentView, { document: parseDocument(source), resolveCrossref: () => null }),
  );
}

export function parseFaction(filePath: string): Faction {
  const filename = path.basename(filePath, ".vellum");
  const dashIndex = filename.indexOf("-");
  const order = Number.parseInt(filename.slice(0, dashIndex), 10);
  const slug = filename.slice(dashIndex + 1);

  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = parseFrontmatter(raw);

  return {
    name: data.name as string,
    slug,
    color: data.color as string,
    order,
    symbol: (data.symbol as string | null) ?? null,
    description: renderVellumBody(content),
  };
}

function buildFactions(): Faction[] {
  const factions = listFilesWithExtension(FACTIONS_DIR, ".vellum").map(parseFaction);
  return factions.sort((a, b) => a.order - b.order);
}

// Layer parsing — mirrors src/lib/layers.ts.

function isHexPair(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number";
}

export function parseChange(raw: unknown, ctx: string): Change {
  if (!raw || typeof raw !== "object") throw new Error(`${ctx}: change must be an object`);
  const c = raw as Record<string, unknown>;

  if (c.op === "skein-connect" || c.op === "skein-disconnect") {
    if (typeof c.from !== "string" || c.from === "") {
      throw new Error(`${ctx}: ${c.op} missing string 'from'`);
    }
    if (typeof c.to !== "string" || c.to === "") {
      throw new Error(`${ctx}: ${c.op} missing string 'to'`);
    }
    return { op: c.op, from: c.from, to: c.to };
  }

  if (c.op === "tithe") return { op: "tithe" };

  if (c.op === "claim") {
    if (!Array.isArray(c.hexes) || !c.hexes.every(isHexPair)) {
      throw new Error(`${ctx}: claim 'hexes' must be an array of [q, r] pairs`);
    }
    if (c.faction !== null && typeof c.faction !== "string") {
      throw new Error(`${ctx}: claim 'faction' must be a string slug or null`);
    }
    if (typeof c.faction === "string" && c.faction === "") {
      throw new Error(`${ctx}: claim 'faction' must not be an empty string`);
    }
    return {
      op: "claim",
      hexes: c.hexes as Array<[number, number]>,
      faction: c.faction as string | null,
    };
  }

  const slug = c.slug;
  if (typeof slug !== "string" || slug === "") {
    throw new Error(`${ctx}: change is missing a string 'slug'`);
  }

  if (c.op === "add") {
    if (typeof c.name !== "string") throw new Error(`${ctx}: add ${slug} missing 'name'`);
    if (typeof c.faction !== "string") throw new Error(`${ctx}: add ${slug} missing 'faction'`);
    if (!Array.isArray(c.hexes) || !c.hexes.every(isHexPair)) {
      throw new Error(`${ctx}: add ${slug} 'hexes' must be an array of [q, r] pairs`);
    }
    return {
      op: "add",
      slug,
      name: c.name,
      faction: c.faction,
      hexes: c.hexes as Array<[number, number]>,
    };
  }

  if (c.op === "update") {
    const out: Change = { op: "update", slug };
    if (c.name !== undefined) {
      if (typeof c.name !== "string")
        throw new Error(`${ctx}: update ${slug} 'name' must be a string`);
      out.name = c.name;
    }
    if (c.faction !== undefined) {
      if (typeof c.faction !== "string")
        throw new Error(`${ctx}: update ${slug} 'faction' must be a string`);
      out.faction = c.faction;
    }
    if (c.hexes !== undefined) {
      if (!Array.isArray(c.hexes) || !c.hexes.every(isHexPair)) {
        throw new Error(`${ctx}: update ${slug} 'hexes' must be an array of [q, r] pairs`);
      }
      out.hexes = c.hexes as Array<[number, number]>;
    }
    return out;
  }

  if (c.op === "remove") return { op: "remove", slug };

  if (c.op === "skein-add") {
    if (typeof c.name !== "string") throw new Error(`${ctx}: skein-add ${slug} missing 'name'`);
    if (typeof c.faction !== "string")
      throw new Error(`${ctx}: skein-add ${slug} missing 'faction'`);
    if (!isHexPair(c.hex)) {
      throw new Error(`${ctx}: skein-add ${slug} 'hex' must be a [q, r] pair`);
    }
    if (typeof c.symbol !== "string" || c.symbol === "")
      throw new Error(`${ctx}: skein-add ${slug} missing 'symbol'`);
    return {
      op: "skein-add",
      slug,
      name: c.name,
      faction: c.faction,
      hex: c.hex,
      symbol: c.symbol,
    };
  }

  if (c.op === "skein-update") {
    const out: Change = { op: "skein-update", slug };
    if (c.name !== undefined) {
      if (typeof c.name !== "string")
        throw new Error(`${ctx}: skein-update ${slug} 'name' must be a string`);
      out.name = c.name;
    }
    if (c.faction !== undefined) {
      if (typeof c.faction !== "string")
        throw new Error(`${ctx}: skein-update ${slug} 'faction' must be a string`);
      out.faction = c.faction;
    }
    if (c.hex !== undefined) {
      if (!isHexPair(c.hex)) {
        throw new Error(`${ctx}: skein-update ${slug} 'hex' must be a [q, r] pair`);
      }
      out.hex = c.hex;
    }
    if (c.symbol !== undefined) {
      if (typeof c.symbol !== "string")
        throw new Error(`${ctx}: skein-update ${slug} 'symbol' must be a string`);
      out.symbol = c.symbol;
    }
    return out;
  }

  if (c.op === "skein-remove") return { op: "skein-remove", slug };

  if (c.op === "banner-form") {
    if (typeof c.name !== "string" || c.name === "")
      throw new Error(`${ctx}: banner-form ${slug} missing 'name'`);
    if (typeof c.color !== "string" || c.color === "")
      throw new Error(`${ctx}: banner-form ${slug} missing 'color'`);
    if (
      !Array.isArray(c.members) ||
      c.members.length < 2 ||
      !c.members.every((m) => typeof m === "string" && m !== "")
    ) {
      throw new Error(`${ctx}: banner-form ${slug} 'members' must be ≥2 faction slugs`);
    }
    if (c.symbol !== undefined && c.symbol !== null && typeof c.symbol !== "string")
      throw new Error(`${ctx}: banner-form ${slug} 'symbol' must be a string or null`);
    return {
      op: "banner-form",
      slug,
      name: c.name,
      color: c.color,
      symbol: (c.symbol as string | null | undefined) ?? null,
      members: c.members as string[],
    };
  }

  if (c.op === "banner-dissolve") return { op: "banner-dissolve", slug };

  throw new Error(
    `${ctx}: unknown op '${String(c.op)}' (expected add | update | remove | skein-add | skein-update | skein-remove | skein-connect | skein-disconnect | claim | banner-form | banner-dissolve | tithe)`,
  );
}

const LAYER_FILENAME_RE = /^(\d{4}-\d{2}-\d{2}T\d{6})-(.+)$/;

// --- KDL → change record (keeps KDL at the edge: the fold + parseChange below
// consume plain records, never raw KDL nodes). ---

function kdlArgs(node: Node): unknown[] {
  return node.getArgumentEntries().map((e) => e.getValue());
}

function kdlProps(node: Node): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, entry] of node.getPropertyEntryMap()) props[key] = entry.getValue();
  return props;
}

function kdlChildren(node: Node): Node[] {
  return node.children?.nodes ?? [];
}

// One change node → the same record shape the YAML frontmatter used to produce,
// so parseChange (the single validator) is unchanged. The node NAME is the op;
// the first positional arg is the slug (where the op has one); `hex q r` and
// `member "slug"` children collect into hexes/hex and members.
function nodeToChangeRecord(node: Node): Record<string, unknown> {
  const rec: Record<string, unknown> = { op: node.name.name, ...kdlProps(node) };
  const argv = kdlArgs(node);
  if (argv.length > 0 && rec.slug === undefined) rec.slug = argv[0];

  const hexes: Array<[unknown, unknown]> = [];
  const members: unknown[] = [];
  for (const child of kdlChildren(node)) {
    const name = child.name.name;
    if (name === "hex") {
      const a = kdlArgs(child);
      hexes.push([a[0], a[1]]);
    } else if (name === "member") {
      members.push(kdlArgs(child)[0]);
    }
  }
  if (hexes.length > 0) {
    rec.hexes = hexes;
    if (hexes.length === 1) rec.hex = hexes[0];
  }
  if (members.length > 0) rec.members = members;
  return rec;
}

export function parseLayer(filePath: string): Layer {
  const filename = path.basename(filePath, ".kdl");
  const m = LAYER_FILENAME_RE.exec(filename);
  if (!m) {
    throw new Error(`Layer filename must be {YYYY}-{MM}-{DD}T{HHMMSS}-{slug}.kdl: ${filename}.kdl`);
  }
  const slug = m[2];

  const doc = parse(fs.readFileSync(filePath, "utf8"));

  let timestamp: string | undefined;
  let message = "";
  const changeNodes: Node[] = [];
  for (const node of doc.nodes) {
    const name = node.name.name;
    if (name === "timestamp") {
      const v = kdlArgs(node)[0];
      if (typeof v !== "string") throw new Error(`Layer ${slug}: 'timestamp' must be a string`);
      timestamp = v;
    } else if (name === "message") {
      const v = kdlArgs(node)[0];
      message = typeof v === "string" ? v : "";
    } else {
      changeNodes.push(node);
    }
  }
  if (timestamp === undefined) throw new Error(`Layer ${slug} missing string 'timestamp'`);

  const changes = changeNodes.map((n, i) =>
    parseChange(nodeToChangeRecord(n), `layer ${slug} change #${i}`),
  );
  return { slug, timestamp, message, changes };
}

function buildLayers(): Layer[] {
  const layers = listFilesWithExtension(LAYERS_DIR, ".kdl").map(parseLayer);
  return layers.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
    return a.slug.localeCompare(b.slug);
  });
}

// Emit — each function builds a generated module's body; @astra/content-build's
// emitModule prepends the AUTOGEN header and writes it under OUT_DIR.

function emitFactions(factions: Faction[]): void {
  emitModule(
    OUT_DIR,
    "factions.ts",
    `import type { Faction } from "@/domain/lib/factions";

export const FACTIONS: readonly Faction[] = ${JSON.stringify(factions, null, 2)};

const BY_SLUG: ReadonlyMap<string, Faction> = new Map(FACTIONS.map((f) => [f.slug, f]));

export function factionBySlug(slug: string): Faction | undefined {
  return BY_SLUG.get(slug);
}
`,
  );
}

function emitLayers(
  layers: Layer[],
  regions: Region[],
  skein: SkeinState,
  banners: Banner[],
  factionHexes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  unownedHexes: ReadonlyArray<readonly [number, number]>,
  factionBorders: ReadonlyArray<EdgeSegment>,
  territoryBorders: ReadonlyArray<ReadonlyArray<EdgeSegment>>,
): void {
  emitModule(
    OUT_DIR,
    "layers.ts",
    `import type { Banner, Layer, Region, SkeinState } from "@/domain/lib/regions";
import type { EdgeSegment } from "@/domain/lib/hexUtils";

export const LAYERS: readonly Layer[] = ${JSON.stringify(layers, null, 2)};

export const CURRENT_REGIONS: readonly Region[] = ${JSON.stringify(regions, null, 2)};

export const CURRENT_SKEIN: SkeinState = ${JSON.stringify(skein, null, 2)};

export const CURRENT_BANNERS: readonly Banner[] = ${JSON.stringify(banners, null, 2)};

export const CURRENT_FACTION_HEXES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = ${JSON.stringify(factionHexes)};

export const CURRENT_UNOWNED_HEXES: ReadonlyArray<readonly [number, number]> = ${JSON.stringify(unownedHexes)};

export const CURRENT_FACTION_BORDERS: ReadonlyArray<EdgeSegment> = ${JSON.stringify(factionBorders)};

export const CURRENT_FACTION_TERRITORY_BORDERS: ReadonlyArray<ReadonlyArray<EdgeSegment>> = ${JSON.stringify(territoryBorders)};
`,
  );
}

// Two content sources. The layers source needs the faction slugs (claim ops
// reference factions), so it reads them from a closure the factions source
// fills — buildContent runs sources in declaration order, so factions runs first.
let factionSlugs: string[] = [];

const factionsSource = defineContentSource({
  name: "factions",
  build: () => {
    const factions = buildFactions();
    factionSlugs = factions.map((f) => f.slug);
    emitFactions(factions);
    return `${factions.length} factions`;
  },
});

const layersSource = defineContentSource({
  name: "layers",
  build: () => {
    const layers = buildLayers();
    const regions = foldRegions(layers);
    const skein = foldSkein(layers);
    const banners = foldBanners(layers);
    const overrides = foldFactionOverrides(layers);
    const effective = computeEffectiveAssignments(
      FACTION_HEXES,
      UNOWNED_BASE_HEXES,
      overrides,
      factionSlugs,
    );
    // Validate banner membership against the real factions at build time (throws
    // on an unknown slug), so a bad banner-form fails the build, not the render.
    computeBannerAssignments(effective.perFaction, factionSlugs, banners);
    const { allBorders, perFaction } = computeAssignmentBorders(effective.perFaction);
    emitLayers(
      layers,
      regions,
      skein,
      banners,
      effective.perFaction,
      effective.unowned,
      allBorders,
      perFaction,
    );
    return `${layers.length} layers, ${regions.length} regions, ${skein.regions.length} skein regions, ${skein.connections.length} skein connections, ${banners.length} banners, ${overrides.size} hex overrides (${effective.unowned.length} unowned)`;
  },
});

async function main(): Promise<void> {
  const summaries = await buildContent(OUT_DIR, [factionsSource, layersSource]);
  console.log(`[build-content] ${summaries.join(", ")}`);
}

// Only run the generator when invoked directly (`bun run build-content.ts` — via
// the build/typecheck scripts and contentWatchPlugin's subprocess). Importing
// this module (e.g. from build-content.test.ts) must NOT regenerate content.
if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error("[build-content] failed:", err);
    process.exit(1);
  });
}
