/**
 * Build-time transcript reconstitution (Decision D4 / N7). Turns linguist session
 * JSON into wiki pages: matchCampaign routes each session into `Script/<campaign>/`
 * (or `Script/Unsorted/`), the markup mirrors faerrin's `remark-transcript.mjs`
 * OUTPUT shape (`audio[data-transcript]` + `.transcript-line` rows the verbatim
 * TranscriptPlayer attaches to), and the proper-noun linker auto-links mentions of
 * wiki pages. The produced SiteDocs merge into the same site graph as the snapshot
 * pages (routing/edges/backlinks/Explorer), so the slug set ∪ covers faerrin's.
 *
 * Build-only (imported solely by scripts/build-content.ts) — keeps node:fs out of
 * the client/SSR bundle.
 */
import type { Being } from "@astra/ontology";
import { characterFor, type MatchedCampaign, matchCampaign } from "./campaigns";
import { buildLinker, escapeHtml, type LinkEntry } from "./linker";
import { readingMinutes } from "./renderBody";
import type { SiteDoc } from "./site";
import {
  type FilePath,
  type FullSlug,
  type SimpleSlug,
  simplifySlug,
  slugifyFilePath,
} from "./slug";
import { loadTranscripts, type Transcript } from "./transcript";

/** Transcripts that match no campaign land here (faerrin UNSORTED_FOLDER). */
const UNSORTED_FOLDER = "Unsorted";

export interface TranscriptBuild {
  docs: SiteDoc[];
  bodies: Record<string, { html: string; minutes: number }>;
}

/** The `Script/<folder>/<date>` slug for a session (Quartz slug rules → URL parity). */
function transcriptRel(folder: string, date: string): string {
  return `Script/${folder}/${date}.md`;
}

const attr = escapeHtml;

/**
 * @param linker built once over the wiki corpus (snapshot pages' titles+aliases).
 */
function renderTranscript(
  transcript: Transcript,
  match: MatchedCampaign | null,
  slug: FullSlug,
  linker: ReturnType<typeof buildLinker>,
): { html: string; links: SimpleSlug[]; minutes: number } {
  const { date, audio, script } = transcript;
  const hits = new Set<SimpleSlug>();
  const parts: string[] = [
    `<audio id="audio-${attr(date)}" data-transcript="${attr(date)}" preload="auto" tabindex="0" controls type="audio/mpeg">` +
      `<source type="audio/mp3" src="${attr(audio)}" />` +
      `Sorry, your browser does not support HTML5 audio.</audio>`,
  ];
  for (const line of script) {
    const name = line.user.name;
    const char = characterFor(name, match);
    const u = attr(name);
    const c = attr(char);
    parts.push(
      `<div id="${attr(`${line.second}-${name}`)}" class="transcript-line ${u}" ` +
        `data-second="${attr(String(line.second))}" data-user="${u}" data-char="${c}">` +
        `<button class="transcript-time" type="button" aria-label="Seek to ${attr(line.start)}">${attr(line.start)}</button>` +
        `<span class="transcript-name ${u}" data-real="${u}" data-char="${c}">${c}:</span>` +
        `<span class="transcript-content">${linker.link(line.text, slug, hits)}</span>` +
        `</div>`,
    );
  }
  const plain = script.map((l) => l.text).join(" ");
  return { html: parts.join("\n"), links: [...hits], minutes: readingMinutes(plain) };
}

/**
 * Build transcript pages from `dataDir`. `corpus` supplies the linker's link
 * targets (wiki page titles+aliases → slug); `being` supplies the campaign roster
 * + the player slug→name map.
 */
export function buildTranscripts(
  dataDir: string,
  corpus: SiteDoc[],
  being: Being,
): TranscriptBuild {
  const nameBySlug = new Map(being.players.map((p) => [p.slug, p.name]));

  const entries: LinkEntry[] = [];
  for (const doc of corpus) {
    const seen = new Set<string>();
    const stem = doc.rel.replace(/\.md$/, "").split("/").pop() ?? "";
    for (const name of [doc.title, stem, ...doc.aliases]) {
      if (name && !seen.has(name)) {
        seen.add(name);
        entries.push({ name, slug: doc.slug });
      }
    }
  }
  const linker = buildLinker(entries);

  const transcripts = loadTranscripts(dataDir);
  const docs: SiteDoc[] = [];
  const bodies: Record<string, { html: string; minutes: number }> = {};

  for (const transcript of transcripts) {
    const match = matchCampaign(transcript, being.campaigns, nameBySlug);
    const folder = match ? match.campaign.name : UNSORTED_FOLDER;
    const rel = transcriptRel(folder, transcript.date);
    const slug = slugifyFilePath(rel as FilePath);
    const { html, links, minutes } = renderTranscript(transcript, match, slug, linker);

    docs.push({
      rel,
      slug,
      simple: simplifySlug(slug),
      title: transcript.date,
      tags: ["Script"],
      aliases: [],
      links,
      date: new Date(transcript.date),
    });
    bodies[slug] = { html, minutes };
  }

  return { docs, bodies };
}
