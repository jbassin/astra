// The icons the builder draws, extracted at build time into src/generated/icons.ts so the
// client ships only these, not the whole icon sets. Each SVG body is parsed here into a small
// element tree that `<Icon>` renders as React elements, so no markup is injected as HTML.
// Game icons
// (https://game-icons.net, CC BY 3.0, credited in the footer and the README) for everything in
// the game's world; Lucide (ISC) for the interface. Add a name here, then use it through
// `<Icon name="…" />` (src/ui/Icon.tsx); the generated `IconName` type rejects unknown names.

import { defineContentSource, emitModule } from "@astra/content-build";
import { icons as gameIcons } from "@iconify-json/game-icons";
import { icons as lucideIcons } from "@iconify-json/lucide";

/** game-icons.net names (the iconify `game-icons` set). */
const GAME_ICONS = [
  // archetypes
  "crossed-swords",
  "cloak-dagger",
  "wizard-staff",
  "caduceus",
  // classes
  "battle-axe",
  "lyre",
  "holy-symbol",
  "oak-leaf",
  "swords-emblem",
  "mailed-fist",
  "templar-shield",
  "bow-arrow",
  "hooded-assassin",
  "fire-spell-cast",
  "warlock-eye",
  "pointy-hat",
  // species
  "angel-wings",
  "dragon-head",
  "dwarf-face",
  "woman-elf-face",
  "gears",
  "mountains",
  "barefoot",
  "village",
  "orc-head",
  "devil-mask",
  // backgrounds
  "candle-holder",
  "anvil",
  "domino-mask",
  "lockpicks",
  "juggling-clubs",
  "wheat",
  "spear-hook",
  "compass",
  "lantern-flame",
  "two-coins",
  "crown",
  "open-book",
  "anchor",
  "quill-ink",
  "visored-helm",
  "walking-boot",
  // abilities
  "biceps",
  "feather",
  "heart-beats",
  "brain",
  "owl",
  "smitten",
  // key numbers
  "heart-plus",
  "checked-shield",
  "run",
  "hourglass",
  "eye-target",
  // the turn
  "sword-brandish",
  "lightning-trio",
  "shield-reflect",
  "aura",
  "rolling-dices",
  "dice-twenty-faces-twenty",
  // spells: the two levels and the eight schools
  "magic-swirl",
  "spell-book",
  "magic-shield",
  "magic-portal",
  "crystal-ball",
  "fireball",
  "ink-swirl",
  "death-skull",
  "transform",
  // damage types
  "sword-slice",
  "arrowhead",
  "flat-hammer",
  "fire",
  "snowflake-1",
  "lightning-arc",
  "sun",
  "death-zone",
  "poison-bottle",
  "acid",
  "sonic-boom",
  // sheet sections
  "backpack",
  "laurels",
  "scroll-unfurled",
  "scroll-quill",
  "wax-seal",
  "castle",
] as const;

/** Lucide names (the iconify `lucide` set), for the interface chrome. */
const LUCIDE = [
  "chevron-left",
  "chevron-right",
  "check",
  "printer",
  "rotate-ccw",
  "cloud-check",
  "cloud-off",
  "loader-circle",
  "lock",
  "info",
  "triangle-exclamation-point",
  "chevron-down",
  "flask-conical",
  "link",
  "x",
] as const;

interface IconSet {
  icons: Record<string, { body: string; width?: number }>;
  width?: number;
}

/** `[tag, attributes, children]`: one SVG element, attribute names in React's spelling. */
type IconNode = [string, Record<string, string>, IconNode[]];

const TAG = /<(\/?)([a-z]+)((?:\s+[a-z-]+="[^"]*")*)\s*(\/?)>/g;
const ATTR = /([a-z-]+)="([^"]*)"/g;
const ALLOWED_TAGS = new Set(["path", "g", "rect", "circle", "ellipse", "line", "polyline"]);

/** stroke-width → strokeWidth. */
function reactName(attr: string): string {
  return attr.replaceAll(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Parses an iconify body (a run of simple SVG elements) into element trees. */
function parseBody(name: string, body: string): IconNode[] {
  const root: IconNode = ["g", {}, []];
  const stack: IconNode[] = [root];
  let consumed = 0;
  for (const m of body.matchAll(TAG)) {
    if (body.slice(consumed, m.index).trim() !== "") throw new Error(`${name}: text in body`);
    consumed = m.index + m[0].length;
    const [, closing, tag = "", attrs = "", selfClosing] = m;
    if (!ALLOWED_TAGS.has(tag)) throw new Error(`${name}: unexpected <${tag}>`);
    if (closing) {
      stack.pop();
      continue;
    }
    const props: Record<string, string> = {};
    for (const a of attrs.matchAll(ATTR)) props[reactName(a[1] ?? "")] = a[2] ?? "";
    const node: IconNode = [tag, props, []];
    stack.at(-1)?.[2].push(node);
    if (!selfClosing) stack.push(node);
  }
  if (body.slice(consumed).trim() !== "" || stack.length !== 1) {
    throw new Error(`${name}: unbalanced body`);
  }
  return root[2];
}

interface IconData {
  size: number;
  nodes: IconNode[];
}

function pick(set: IconSet, names: readonly string[], prefix: string): Record<string, IconData> {
  const out: Record<string, IconData> = {};
  const missing: string[] = [];
  for (const name of names) {
    const icon = set.icons[name];
    if (!icon) {
      missing.push(name);
      continue;
    }
    // Every icon in these sets is square.
    out[`${prefix}${name}`] = {
      size: icon.width ?? set.width ?? 16,
      nodes: parseBody(name, icon.body),
    };
  }
  if (missing.length > 0) throw new Error(`unknown icons: ${missing.join(", ")}`);
  return out;
}

/** The content source that writes `icons.ts` into `outDir` (build-content.ts runs it). */
export function iconSource(outDir: string) {
  return defineContentSource({
    name: "icons",
    build: () => {
      const icons = { ...pick(gameIcons, GAME_ICONS, ""), ...pick(lucideIcons, LUCIDE, "ui-") };
      const names = Object.keys(icons);
      emitModule(
        outDir,
        "icons.ts",
        `export type IconName =\n${names.map((n) => `  | ${JSON.stringify(n)}`).join("\n")};\n\n` +
          "/** `[tag, attributes, children]`; attribute names are React's. */\n" +
          "export type IconNode = [string, Record<string, string>, IconNode[]];\n\n" +
          "export const ICONS: Record<IconName, { size: number; nodes: IconNode[] }> = " +
          `${JSON.stringify(icons)};\n`,
      );
      return `${names.length} icons`;
    },
  });
}
