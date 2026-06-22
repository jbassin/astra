/**
 * THE CUTOVER GATE (slice 9): the full produced URL-slug set — wiki pages (snapshot)
 * ∪ reconstituted transcript pages — must byte-match faerrin's shipped contentIndex
 * keys EXACTLY. Inbound links/bookmarks must survive the faerrin→astra cutover, and
 * this is the single hard invariant of 0011. The wiki half (141) and transcript half
 * (76) each have their own gates (site.test.ts, transcriptParity.test.ts); this
 * asserts the union (217) — no missing, no extra, no overlap.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBeing } from "@astra/ontology";
import { describe, expect, it } from "vitest";
import faerrinAllSlugs from "./__fixtures__/faerrin-all-slugs.json";
import { matchCampaign } from "./campaigns";
import { buildSite } from "./site";
import { type FilePath, slugifyFilePath } from "./slug";
import { loadSnapshot } from "./snapshot";
import { loadTranscripts } from "./transcript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = path.resolve(HERE, "../../../../akasha-backend/snapshot/akasha-snapshot.json");
const DATA_DIR = path.resolve(HERE, "../../../../linguist/data");
const BEING = path.resolve(HERE, "../../../../../ontology/ontology-being/being.kdl");

describe("URL-slug parity — the cutover gate (snapshot ∪ transcripts)", () => {
  const wiki = buildSite(loadSnapshot(SNAPSHOT)).docs.map((d) => d.slug as string);

  const being = loadBeing(BEING);
  const nameBySlug = new Map(being.players.map((p) => [p.slug, p.name]));
  const transcripts = loadTranscripts(DATA_DIR).map((t) => {
    const match = matchCampaign(t, being.campaigns, nameBySlug);
    const folder = match ? match.campaign.name : "Unsorted";
    return slugifyFilePath(`Script/${folder}/${t.date}.md` as FilePath) as string;
  });

  it("produces exactly faerrin's full contentIndex slug set (141 wiki + 76 transcripts = 217)", () => {
    const produced = [...wiki, ...transcripts].sort();
    expect(produced).toEqual([...faerrinAllSlugs].sort());
  });

  it("has no duplicate slugs across the wiki/transcript union", () => {
    const produced = [...wiki, ...transcripts];
    expect(produced.length).toBe(new Set(produced).size);
    expect(produced.length).toBe(faerrinAllSlugs.length);
  });
});
