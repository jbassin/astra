// 5etools text to plain text. 5etools marks up its rules text with inline tags such as
// `{@spell Fire Bolt|XPHB}` or `{@damage 1d10}` and nests paragraphs in typed "entries"
// objects. The importer (scripts/import-5etools.ts) runs every rules text it keeps through
// these two functions, so the committed JSON and anything the UI shows read as plain prose.

/** Tags whose display text is the second pipe part (`{@dice 1d20+5|+5}`). */
const DICE_TAGS = new Set(["dice", "damage", "autodice"]);

/** Tags whose display text sits at a fixed pipe index other than 2. */
const DISPLAY_INDEX: Record<string, number> = {
  classFeature: 4,
  subclassFeature: 6,
  quickref: 4,
  scaledice: 2,
  scaledamage: 2,
};

/** Formats one tag with its parts (the tag body split on `|`). */
function renderTag(tag: string, body: string): string {
  const parts = body.split("|");
  const first = (parts[0] ?? "").trim();
  if (DICE_TAGS.has(tag)) return (parts[1] ?? first).trim();
  switch (tag) {
    case "hit":
    case "d20": {
      if (parts[1]) return parts[1].trim();
      const n = Number(first);
      return Number.isFinite(n) && n >= 0 ? `+${n}` : first;
    }
    case "dc":
      return parts[1] ? parts[1].trim() : `DC ${first}`;
    case "chance":
      return parts[1] ? parts[1].trim() : `${first} percent`;
    case "recharge":
      return first ? `(Recharge ${first}–6)` : "(Recharge 6)";
    case "h":
      return "Hit: ";
    case "m":
      return "Miss: ";
    case "atkr":
      return first === "m"
        ? "Melee Attack Roll:"
        : first === "r"
          ? "Ranged Attack Roll:"
          : "Attack Roll:";
    case "filter":
    case "book":
    case "adventure":
    case "link":
    case "5etools":
      return first;
    default:
      break;
  }
  const index = DISPLAY_INDEX[tag] ?? 2;
  const display = parts[index]?.trim();
  return display ? display : first;
}

const INNER_TAG = /\{@(\w+)(?:\s([^{}]*))?\}/;

/**
 * Converts 5etools inline markup to plain text: `{@spell Fire Bolt|XPHB}` → `Fire Bolt`,
 * `{@item Javelin|XPHB|Javelins}` → `Javelins`, `{@damage 1d10}` → `1d10`, `{@dc 15}` → `DC 15`.
 * Nested tags resolve from the inside out.
 */
export function stripTags(text: string): string {
  let out = text;
  for (let guard = 0; guard < 1000; guard++) {
    const m = INNER_TAG.exec(out);
    if (!m) break;
    out =
      out.slice(0, m.index) + renderTag(m[1] ?? "", m[2] ?? "") + out.slice(m.index + m[0].length);
  }
  return out.replaceAll("\u00a0", " ");
}

type Entry = string | { [key: string]: unknown };

function asEntries(value: unknown): Entry[] {
  if (Array.isArray(value)) return value as Entry[];
  if (value === undefined || value === null) return [];
  return [value as Entry];
}

/** Entry types that are sidebars or cross-references, not rules text of the parent. */
const SKIPPED_TYPES = new Set([
  "inset",
  "insetReadaloud",
  "refClassFeature",
  "refSubclassFeature",
  "refOptionalfeature",
  "options",
  "image",
  "gallery",
]);

/**
 * Flattens a 5etools `entries` array to plain paragraphs. A named block becomes
 * "Name. first paragraph"; list items become "• item" (or "Name: item"); a table becomes one
 * line per row with cells joined by " | ". Sidebars and cross-references are dropped.
 */
export function flattenEntries(entries: unknown): string[] {
  const out: string[] = [];
  for (const entry of asEntries(entries)) {
    if (typeof entry === "string") {
      out.push(stripTags(entry));
      continue;
    }
    const type = typeof entry.type === "string" ? entry.type : "entries";
    if (SKIPPED_TYPES.has(type)) continue;
    const name = typeof entry.name === "string" ? stripTags(entry.name) : undefined;
    if (type === "list") {
      for (const item of asEntries(entry.items)) {
        if (typeof item === "string") out.push(`• ${stripTags(item)}`);
        else {
          const itemName = typeof item.name === "string" ? stripTags(item.name) : undefined;
          const body = flattenEntries(item.entries ?? item.entry).join(" ");
          out.push(itemName ? `• ${itemName.replace(/[.:]$/, "")}: ${body}` : `• ${body}`);
        }
      }
      continue;
    }
    if (type === "table") {
      const labels = asEntries(entry.colLabels).map((c) => cellText(c));
      if (labels.length > 0) out.push(labels.join(" | "));
      for (const row of asEntries(entry.rows)) {
        const cells = Array.isArray(row) ? row : [];
        out.push(
          cells.map((c) => (typeof c === "string" ? stripTags(c) : cellText(c))).join(" | "),
        );
      }
      continue;
    }
    const body = flattenEntries(entry.entries ?? entry.entry ?? entry.items);
    if (name && body.length > 0) {
      out.push(`${name.replace(/[.:]$/, "")}. ${body[0]}`, ...body.slice(1));
    } else if (name) {
      out.push(name);
    } else {
      out.push(...body);
    }
  }
  return out;
}

/** A class-table or table cell that is an object (`{type: "dice", toRoll: [...]}` and kin). */
export function cellText(cell: unknown): string {
  if (typeof cell === "string") return stripTags(cell);
  if (typeof cell === "number") return String(cell);
  if (!cell || typeof cell !== "object") return "";
  const c = cell as Record<string, unknown>;
  switch (c.type) {
    case "dice": {
      const rolls = Array.isArray(c.toRoll)
        ? (c.toRoll as Array<{ number: number; faces: number }>)
        : [];
      return rolls.map((r) => `${r.number}d${r.faces}`).join(" + ");
    }
    case "bonus":
      return `+${String(c.value)}`;
    case "bonusSpeed":
      return `+${String(c.value)} ft.`;
    case "cell":
      return cellText(c.entry);
    default:
      return "value" in c ? String(c.value) : "";
  }
}

/** A stable id for a name: lower case, apostrophes dropped, other runs of punctuation → "-". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/['’]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}
