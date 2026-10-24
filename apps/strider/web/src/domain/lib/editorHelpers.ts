// The browser-safe subpath: this module runs in the editor (client) bundle.
import { kdlQuote } from "@astra/config/kdl-quote";

import { type Change, CURRENT_FACTION_HEXES, type Layer, type Region } from "./layers";

// The editor authors region ops, three Skein ops, and the claim op. The other
// two Skein ops (skein-update, skein-disconnect) stay hand-authored.
export type EditableChange = Extract<
  Change,
  {
    op:
      | "add"
      | "update"
      | "remove"
      | "skein-add"
      | "skein-connect"
      | "skein-remove"
      | "claim"
      | "banner-form"
      | "banner-dissolve"
      | "tithe";
  }
>;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[̀-ͯ]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

let _hexFactionMap: Map<string, number> | null = null;

// "Hex → faction index" for hexes currently owned by a faction in the
// post-claim effective state. Unowned hexes are absent from the map. Sourced
// from CURRENT_FACTION_HEXES so the editor reflects what the player sees at the
// end of the timeline.
export function hexFactionMap(): Map<string, number> {
  if (_hexFactionMap) return _hexFactionMap;
  const m = new Map<string, number>();
  CURRENT_FACTION_HEXES.forEach((hexes, factionIdx) => {
    for (const [q, r] of hexes) {
      m.set(`${q},${r}`, factionIdx);
    }
  });
  _hexFactionMap = m;
  return m;
}

export function hexRegionMap(regions: Region[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const region of regions) {
    for (const [q, r] of region.hexes) {
      m.set(`${q},${r}`, region.slug);
    }
  }
  return m;
}

// Builds a layer filename whose lexical sort matches chronological order:
// {YYYY}-{MM}-{DD}T{HHMMSS}-{slug}.kdl. Year is zero-padded to 4 digits so the
// sort stays correct across digit boundaries (e.g. years 999 → 1000).
export function layerFilename(timestamp: string, slug: string): string {
  const m = /^(\d+)-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(timestamp);
  if (!m) throw new Error(`layerFilename: timestamp must be ISO-8601: ${timestamp}`);
  const [, year, mm, dd, hh, mi, ss] = m;
  // oxlint-disable-next-line typescript/no-non-null-assertion -- the regex match guarantees this group
  const paddedYear = year!.padStart(4, "0");
  return `${paddedYear}-${mm}-${dd}T${hh}${mi}${ss}-${slug}.kdl`;
}

interface SerializableLayer {
  timestamp: string;
  message: string;
  changes: Change[];
}

// Serialize a layer to its KDL form (the on-disk authoring format). Flat: the
// `timestamp`/`message` metadata nodes, then one node per change whose NAME is
// the op. parse side lives in scripts/build-content.ts (parseLayer).
export function serializeLayer(layer: SerializableLayer): string {
  const lines: string[] = [
    `timestamp ${kdlQuote(layer.timestamp)}`,
    `message ${kdlQuote(layer.message)}`,
  ];
  for (const c of layer.changes) {
    lines.push("");
    lines.push(...serializeChange(c));
  }
  return `${lines.join("\n")}\n`;
}

// Build a KDL node's lines: `op arg… key=val…` with optional `{ … }` children.
// `args`/`props` values are already KDL-serialized by the caller.
function kdlNode(
  op: string,
  args: string[],
  props: Array<[string, string]>,
  children: string[] = [],
): string[] {
  const head = [op, ...args, ...props.map(([k, v]) => `${k}=${v}`)].join(" ");
  if (children.length === 0) return [head];
  return [`${head} {`, ...children.map((c) => `    ${c}`), "}"];
}

function hexChildren(hexes: ReadonlyArray<readonly [number, number]>): string[] {
  return hexes.map(([q, r]) => `hex ${q} ${r}`);
}

function serializeChange(c: Change): string[] {
  switch (c.op) {
    case "add":
      return kdlNode(
        "add",
        [kdlQuote(c.slug)],
        [
          ["name", kdlQuote(c.name)],
          ["faction", kdlQuote(c.faction)],
        ],
        hexChildren(c.hexes),
      );
    case "update": {
      const props: Array<[string, string]> = [];
      if (c.name !== undefined) props.push(["name", kdlQuote(c.name)]);
      if (c.faction !== undefined) props.push(["faction", kdlQuote(c.faction)]);
      return kdlNode("update", [kdlQuote(c.slug)], props, c.hexes ? hexChildren(c.hexes) : []);
    }
    case "remove":
      return kdlNode("remove", [kdlQuote(c.slug)], []);
    case "skein-add":
      return kdlNode(
        "skein-add",
        [kdlQuote(c.slug)],
        [
          ["name", kdlQuote(c.name)],
          ["faction", kdlQuote(c.faction)],
          ["symbol", kdlQuote(c.symbol)],
        ],
        [`hex ${c.hex[0]} ${c.hex[1]}`],
      );
    case "skein-update": {
      const props: Array<[string, string]> = [];
      if (c.name !== undefined) props.push(["name", kdlQuote(c.name)]);
      if (c.faction !== undefined) props.push(["faction", kdlQuote(c.faction)]);
      if (c.symbol !== undefined) props.push(["symbol", kdlQuote(c.symbol)]);
      return kdlNode(
        "skein-update",
        [kdlQuote(c.slug)],
        props,
        c.hex ? [`hex ${c.hex[0]} ${c.hex[1]}`] : [],
      );
    }
    case "skein-remove":
      return kdlNode("skein-remove", [kdlQuote(c.slug)], []);
    case "skein-connect":
      return kdlNode(
        "skein-connect",
        [],
        [
          ["from", kdlQuote(c.from)],
          ["to", kdlQuote(c.to)],
        ],
      );
    case "skein-disconnect":
      return kdlNode(
        "skein-disconnect",
        [],
        [
          ["from", kdlQuote(c.from)],
          ["to", kdlQuote(c.to)],
        ],
      );
    case "claim":
      return kdlNode(
        "claim",
        [],
        [["faction", c.faction === null ? "#null" : kdlQuote(c.faction)]],
        hexChildren(c.hexes),
      );
    case "banner-form": {
      const props: Array<[string, string]> = [
        ["name", kdlQuote(c.name)],
        ["color", kdlQuote(c.color)],
      ];
      if (c.symbol !== undefined && c.symbol !== null) props.push(["symbol", kdlQuote(c.symbol)]);
      return kdlNode(
        "banner-form",
        [kdlQuote(c.slug)],
        props,
        c.members.map((m) => `member ${kdlQuote(m)}`),
      );
    }
    case "banner-dissolve":
      return kdlNode("banner-dissolve", [kdlQuote(c.slug)], []);
    case "tithe":
      return kdlNode("tithe", [], []);
  }
}

export type { Layer };
