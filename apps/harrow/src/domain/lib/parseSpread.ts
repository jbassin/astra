// Ported verbatim from harrow's src/lib/parseSpread.ts (import path changed to
// ./types). Parses a `.spread` file: `name` + five card positions + a `--- reading`
// block. Card ids are validated against DECK by the caller (build-content). Build-
// time only.

import type { CardOrientation } from "./types";

const POSITIONS = ["foundation", "challenge", "past", "future", "outcome"] as const;
const POSITION_LABELS: Record<string, string> = {
  foundation: "Foundation",
  challenge: "Challenge",
  past: "Past",
  future: "Future",
  outcome: "Outcome",
};

export interface ParsedSpreadRaw {
  id: string;
  date: string;
  name: string;
  cards: { positionLabel: string; cardId: string; orientation: CardOrientation }[];
  reading: string;
}

export function parseSpread(raw: string, filePath: string): ParsedSpreadRaw {
  const parts = filePath.split("/");
  // astra's base tsconfig has `noUncheckedIndexedAccess` (harrow's source didn't),
  // so index/match-group accesses below are asserted `as string` — same logic.
  const filename = parts[parts.length - 1] as string;
  const id = filename.replace(/\.spread$/, "");
  const date = id.split(".")[0] as string;
  const tag = `[${filename}]`;

  const meta = new Map<string, string>();
  const blocks = new Map<string, string>();

  const lines = raw.split("\n");
  let state: "metadata" | "block" = "metadata";
  let blockName = "";
  let blockLines: string[] = [];

  for (const [i, line] of lines.entries()) {
    if (state === "metadata") {
      if (line.trim() === "") continue;

      const blockOpen = line.match(/^--- ([a-zA-Z][a-zA-Z0-9-]*)$/);
      if (blockOpen) {
        state = "block";
        blockName = blockOpen[1] as string;
        blockLines = [];
        continue;
      }

      const kv = line.match(/^([a-zA-Z][a-zA-Z0-9-]*): (.+)$/);
      if (kv) {
        meta.set(kv[1] as string, kv[2] as string);
        continue;
      }

      throw new Error(`${tag} line ${i + 1}: unexpected content "${line}"`);
    }

    if (state === "block") {
      if (line === "---") {
        const text = blockLines.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
        blocks.set(blockName, text);
        state = "metadata";
        blockName = "";
        blockLines = [];
        continue;
      }
      blockLines.push(line);
    }
  }

  if (state === "block") {
    throw new Error(`${tag} Unclosed block: "${blockName}" — missing closing "---"`);
  }

  if (!meta.has("name")) throw new Error(`${tag} Missing required field: "name"`);
  for (const pos of POSITIONS) {
    if (!meta.has(pos)) throw new Error(`${tag} Missing required field: "${pos}"`);
  }
  if (!blocks.has("reading")) throw new Error(`${tag} Missing required block: "reading"`);

  const cards = POSITIONS.map((pos) => {
    const value = meta.get(pos) as string;
    const lastSpace = value.lastIndexOf(" ");
    if (lastSpace === -1) {
      throw new Error(`${tag} "${pos}" must be "<card-id> <orientation>", got: "${value}"`);
    }
    const cardId = value.slice(0, lastSpace);
    const orientation = value.slice(lastSpace + 1);
    if (orientation !== "upright" && orientation !== "reversed") {
      throw new Error(
        `${tag} "${pos}" orientation must be "upright" or "reversed", got: "${orientation}"`,
      );
    }
    return {
      positionLabel: POSITION_LABELS[pos] as string,
      cardId,
      orientation: orientation as CardOrientation,
    };
  });

  return {
    id,
    date,
    name: meta.get("name") as string,
    cards,
    reading: blocks.get("reading") as string,
  };
}
