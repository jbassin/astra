/**
 * Build-time transcript reconstitution, done here rather than in linguist. Turns
 * linguist session JSON into wiki pages: matchCampaign routes each session into
 * `Script/<campaign>/`
 * (or `Script/Unsorted/`), the markup mirrors faerrin's `remark-transcript.mjs`
 * OUTPUT shape (`audio[data-transcript]` + `.transcript-line` rows the
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
import { loadTranscripts, type ScriptLine, type Transcript } from "./transcript";
import type { TranscriptMeta, TranscriptSpeaker } from "./transcriptMeta";

/** Transcripts that match no campaign land here (faerrin UNSORTED_FOLDER). */
const UNSORTED_FOLDER = "Unsorted";

interface TranscriptBuild {
  docs: SiteDoc[];
  bodies: Record<string, { html: string; minutes: number }>;
  /** Per-session facts for the page (duration, speakers), keyed by slug. */
  meta: Record<string, TranscriptMeta>;
}

/** The `Script/<folder>/<date>` slug for a session (Quartz slug rules → URL parity). */
function transcriptRel(folder: string, date: string): string {
  return `Script/${folder}/${date}.md`;
}

const attr = escapeHtml;

/** A line's timestamp as the page shows it: "00:32:15" becomes "0:32:15". */
export function lineTime(start: string): string {
  return start.replace(/^0(\d):/, "$1:");
}

/** The session's length in seconds: where its last line ends. */
export function sessionSeconds(script: readonly ScriptLine[]): number {
  let end = 0;
  for (const l of script) end = Math.max(end, l.second + (l.duration || 0));
  return end;
}

/** Lines per speaker, most first, with the character each speaker plays. */
export function speakerStats(
  script: readonly ScriptLine[],
  match: MatchedCampaign | null,
): TranscriptSpeaker[] {
  const counts = new Map<string, number>();
  for (const l of script) counts.set(l.user.name, (counts.get(l.user.name) ?? 0) + 1);
  return [...counts]
    .map(([user, lines]) => ({ user, char: characterFor(user, match), lines }))
    .toSorted((a, b) => b.lines - a.lines || a.user.localeCompare(b.user));
}

/**
 * The transcript's HTML: the `<audio>` the player drives, then one `.transcript-line` per
 * line. A line by the same speaker as the line before carries `is-cont`, so the page hides
 * its time and name without working that out at runtime.
 *
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
    `<audio id="audio-${attr(date)}" data-transcript="${attr(date)}" preload="auto" type="audio/mpeg">` +
      `<source type="audio/mp3" src="${attr(audio)}" />` +
      `Sorry, your browser does not support HTML5 audio.</audio>`,
  ];
  let previous: string | null = null;
  for (const line of script) {
    const name = line.user.name;
    const char = characterFor(name, match);
    const u = attr(name);
    const c = attr(char);
    const time = attr(lineTime(line.start));
    const cont = name === previous ? " is-cont" : "";
    previous = name;
    // The colon after the name is there for copying and screen readers; the layout hides it.
    parts.push(
      `<div id="${attr(`${line.second}-${name}`)}" class="transcript-line ${u}${cont}" ` +
        `data-second="${attr(String(line.second))}" data-user="${u}" data-char="${c}">` +
        `<button class="transcript-time" type="button" aria-label="Play from ${time}">${time}</button>` +
        `<span class="transcript-name ${u}" data-real="${u}" data-char="${c}">${c}</span>` +
        `<span class="transcript-colon">: </span>` +
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
  const meta: Record<string, TranscriptMeta> = {};

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
    meta[slug] = {
      date: transcript.date,
      durationSeconds: Math.round(sessionSeconds(transcript.script)),
      speakers: speakerStats(transcript.script, match),
    };
  }

  return { docs, bodies, meta };
}
