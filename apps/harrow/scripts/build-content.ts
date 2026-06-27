// Pre-build content pipeline. Emits the generated modules the runtime imports
// (@/generated/*), so the .card/.spread parsing + fs never reach the client bundle
// (the strider/akasha template). contentWatchPlugin runs this at vite buildStart +
// re-runs on content edits in dev. Replaces harrow's `import.meta.glob` card/spread
// loaders (src/data/{cards,customSpreads}.ts).
//
// Emits:
//   - src/generated/site.ts    — static masthead/head metadata;
//   - src/generated/cards.ts   — DECK: TarotCard[] (roman-numeral sorted), from
//                                content/cards/<deck>/*.card;
//   - src/generated/spreads.ts — CUSTOM_SPREADS: CustomSpreadReading[] (entries
//                                resolved against DECK, date-desc), from
//                                content/spreads/*.spread.
//
// `cards` and `spreads` are COUPLED sources (the migration-guide gotcha): the spreads
// source resolves card ids against the deck the cards source parsed, so they share a
// closure `deck` and MUST run in order (cards before spreads).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildContent,
  defineContentSource,
  emitModule,
  listFilesWithExtension,
} from "@astra/content-build";
import { parseCard } from "../src/domain/lib/parseCard";
import { parseSpread } from "../src/domain/lib/parseSpread";
import type { CustomSpreadReading, TarotCard } from "../src/domain/lib/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../src/generated");
const CARDS_DIR = path.resolve(HERE, "../content/cards");
const SPREADS_DIR = path.resolve(HERE, "../content/spreads");

const SITE_TITLE = "Harrow";
const SITE_DESCRIPTION = "Draw a custom tarot reading and read your fortune.";

// Roman-numeral deck ordering (ported from harrow's src/data/cards.ts).
const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
function fromRoman(s: string): number {
  let result = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN[s[i]];
    const next = ROMAN[s[i + 1]];
    result += next > cur ? -cur : cur;
  }
  return result;
}

/** Parse every content/cards/<deck>/*.card → TarotCard[], roman-numeral sorted
 *  (matches harrow's DECK). The full file path carries the deck as the parent dir,
 *  which parseCard reads. */
function loadDeck(): TarotCard[] {
  const deckDirs = fs
    .readdirSync(CARDS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(CARDS_DIR, d.name));
  const cards: TarotCard[] = [];
  for (const dir of deckDirs) {
    for (const file of listFilesWithExtension(dir, ".card")) {
      cards.push(parseCard(fs.readFileSync(file, "utf8"), file));
    }
  }
  return cards.sort((a, b) => fromRoman(a.number) - fromRoman(b.number));
}

/** Parse every content/spreads/*.spread, resolve each card id against `deck`, and
 *  sort date-desc (matches harrow's CUSTOM_SPREADS). */
function loadSpreads(deck: TarotCard[]): CustomSpreadReading[] {
  return listFilesWithExtension(SPREADS_DIR, ".spread")
    .map((file) => {
      const parsed = parseSpread(fs.readFileSync(file, "utf8"), file);
      const entries = parsed.cards.map((c) => {
        const card = deck.find((d) => d.id === c.cardId);
        if (!card) throw new Error(`[${parsed.id}] Unknown card id: "${c.cardId}"`);
        return { card, orientation: c.orientation, positionLabel: c.positionLabel };
      });
      return {
        id: parsed.id,
        date: parsed.date,
        name: parsed.name,
        entries,
        reading: parsed.reading,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

const siteSource = defineContentSource({
  name: "site",
  build() {
    const body = [
      "/** Static site metadata for harrow's masthead + document head. */",
      `export const SITE = { title: ${JSON.stringify(SITE_TITLE)}, description: ${JSON.stringify(SITE_DESCRIPTION)} } as const;`,
      "",
    ].join("\n");
    emitModule(OUT_DIR, "site.ts", body);
    return `site: ${SITE_TITLE}`;
  },
});

// Coupled: `cards` populates `deck`, `spreads` reads it. Declaration order is the
// run order (buildContent runs sources sequentially).
let deck: TarotCard[] = [];

const cardsSource = defineContentSource({
  name: "cards",
  build() {
    deck = loadDeck();
    const body = [
      "/** The deck, parsed from content/cards/<deck>/*.card and roman-numeral sorted",
      " *  (replaces harrow\\'s import.meta.glob loader). The runtime imports this; the",
      " *  parser + fs stay build-time. */",
      'import type { TarotCard } from "@/domain/lib/types";',
      "",
      `export const DECK: TarotCard[] = ${JSON.stringify(deck, null, 2)};`,
      "",
    ].join("\n");
    emitModule(OUT_DIR, "cards.ts", body);
    return `cards: ${deck.length}`;
  },
});

const spreadsSource = defineContentSource({
  name: "spreads",
  build() {
    const spreads = loadSpreads(deck);
    const body = [
      "/** Curated spreads, parsed from content/spreads/*.spread with each entry's card",
      " *  resolved against DECK, date-desc sorted. CUSTOM_SPREADS[0] is the featured",
      " *  most-recent (SpreadView). */",
      'import type { CustomSpreadReading } from "@/domain/lib/types";',
      "",
      `export const CUSTOM_SPREADS: CustomSpreadReading[] = ${JSON.stringify(spreads, null, 2)};`,
      "",
    ].join("\n");
    emitModule(OUT_DIR, "spreads.ts", body);
    return `spreads: ${spreads.length}`;
  },
});

export async function main(): Promise<void> {
  const summaries = await buildContent(OUT_DIR, [siteSource, cardsSource, spreadsSource]);
  for (const s of summaries) console.log(`  ${s}`);
}

if (import.meta.main) {
  await main();
}
