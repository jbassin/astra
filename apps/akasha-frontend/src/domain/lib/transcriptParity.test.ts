/**
 * N7 URL-parity gate for transcripts: matchCampaign + slug.ts must reproduce
 * faerrin's historical `Script/<campaign>/<date>` paths byte-for-byte. The fixture
 * is faerrin's shipped contentIndex.json Script keys (captured at slice 7). astra's
 * matchCampaign + slug.ts reproduce all 76 EXACTLY — a clean 1:1 parity (no missing,
 * no extra), which is the cutover gate for the transcript half of the URL set.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBeing } from "@astra/ontology";
import { describe, expect, it } from "vitest";
import faerrinScriptSlugs from "./__fixtures__/faerrin-script-slugs.json";
import { matchCampaign } from "./campaigns";
import { type FilePath, slugifyFilePath } from "./slug";
import { loadTranscripts } from "./transcript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, "../../../../linguist/data");
// loadBeing()'s default path uses Bun's import.meta.dir (undefined under vitest's
// node runtime); pass the path explicitly. build-content runs under bun, so its
// bare loadBeing() is fine.
const BEING = path.resolve(HERE, "../../../../../ontology/ontology-being/being.kdl");

describe("transcript URL-slug parity (N7)", () => {
  const being = loadBeing(BEING);
  const nameBySlug = new Map(being.players.map((p) => [p.slug, p.name]));
  const transcripts = loadTranscripts(DATA_DIR);

  const produced = new Set(
    transcripts.map((t) => {
      const match = matchCampaign(t, being.campaigns, nameBySlug);
      const folder = match ? match.campaign.name : "Unsorted";
      return slugifyFilePath(`Script/${folder}/${t.date}.md` as FilePath) as string;
    }),
  );

  it("reproduces every faerrin Script slug (no missing)", () => {
    const missing = faerrinScriptSlugs.filter((s) => !produced.has(s));
    expect(missing).toEqual([]);
  });

  it("adds only well-formed new Script slugs beyond faerrin (live sessions), never drops one", () => {
    // Post-cutover the pipeline keeps producing sessions, so the set GROWS beyond faerrin's
    // frozen 76. Exact reproduction of every faerrin slug is the "no missing" test above; the
    // durable check here is that any extras are valid `Script/<folder>/<date>` slugs — catching
    // a slug-generation bug in new content — rather than a frozen count.
    const extra = [...produced].filter((s) => !faerrinScriptSlugs.includes(s));
    expect(extra.every((s) => /^Script\/[^/]+\/\d{4}-\d{1,2}-\d{1,2}$/.test(s))).toBe(true);
    expect(produced.size).toBeGreaterThanOrEqual(faerrinScriptSlugs.length);
  });
});
