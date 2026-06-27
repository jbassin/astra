// Ported verbatim from harrow's src/lib/parseCard.ts (import path changed to ./types).
// Parses a `.card` file: line-oriented `key: value` metadata + `--- name … ---`
// blocks. `deck` is the parent directory, `id` is the filename. Build-time only
// (build-content.ts runs it); the runtime imports the generated DECK, not this.

import type { TarotCard } from "./types";

export function parseCard(raw: string, filePath: string): TarotCard {
  const split = filePath.split("/");
  // astra's base tsconfig has `noUncheckedIndexedAccess` (harrow's source didn't),
  // so index/match-group accesses below are asserted `as string` — same logic, no
  // behaviour change.
  const deck = split[split.length - 2] as string;
  const filename = split[split.length - 1] as string;
  const id = filename.replace(/\.card$/, "");
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

  const required = ["name", "number", "uprightMeaning", "reversedMeaning"] as const;
  for (const key of required) {
    if (!meta.has(key)) throw new Error(`${tag} Missing required field: "${key}"`);
  }
  for (const block of ["upright", "reversed"] as const) {
    if (!blocks.has(block)) throw new Error(`${tag} Missing required block: "${block}"`);
  }

  const tags = [`deck:${deck}`];
  const rawTags = meta.get("tags");
  if (rawTags !== undefined) {
    tags.push(
      ...rawTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    );
  }

  tags.sort((l, r) => l.localeCompare(r));

  const viewboxRaw = meta.get("viewbox");

  return {
    id,
    name: meta.get("name") as string,
    number: meta.get("number") as string,
    path: meta.get("path"),
    viewBox: viewboxRaw ? Number.parseFloat(viewboxRaw) : undefined,
    deck: deck,
    suit: meta.get("suit"),
    tags: tags,
    uprightMeaning: meta.get("uprightMeaning") as string,
    reversedMeaning: meta.get("reversedMeaning") as string,
    fortuneText: {
      upright: blocks.get("upright") as string,
      reversed: blocks.get("reversed") as string,
    },
    flavor: meta.get("flavor"),
  };
}
