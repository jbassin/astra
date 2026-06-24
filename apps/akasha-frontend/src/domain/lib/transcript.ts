/**
 * Transcript types + loader. The linguist pipeline emits one JSON per session at
 * `apps/linguist/data/<date>.json`; akasha-frontend reconstitutes those into wiki
 * pages at build time (Decision D4 — rendered here, not in linguist). Shapes match
 * the real linguist artifact verbatim (see apps/linguist/data/*.json).
 */
import fs from "node:fs";
import path from "node:path";

export interface ScriptLine {
  /** Human-readable timestamp, e.g. "00:01:23". */
  start: string;
  /** Float seconds offset into the audio (drives the player's binary-search seek). */
  second: number;
  text: string;
  /** name = real speaker (display, e.g. "Jorge"); color = a `--text<Name>` CSS var name. */
  user: { name: string; color: string };
  duration: number;
}

export interface Transcript {
  /** Non-zero-padded session date, e.g. "2025-6-9" (used verbatim in the slug). */
  date: string;
  /** Same-origin combined-recording URL, used verbatim in the <audio><source>. */
  audio: string;
  script: ScriptLine[];
}

// Only `<year>-<month>-<day>.json` are session transcripts; the linguist dir also
// holds intermediate artifacts (e.g. `<date>.candidates.json`) we must skip.
const TRANSCRIPT_FILE = /^\d{4}-\d{1,2}-\d{1,2}\.json$/;

/**
 * Same-origin path to a session's combined Craig recording, served by akasha off the
 * audio volume at `/audio/<date>.mp3` (deploy `akasha-audio` + `just akasha-seed`).
 *
 * Decision A: we NORMALIZE the audio URL at build time rather than re-generating the
 * 78 committed linguist transcript JSONs (which bake faerrin's absolute
 * `static-audio.iridi.cc/<date>/audio.mp3`). The served filename is flat (`<date>.mp3`,
 * mirroring mouthpiece's `<id>.mp3`), and `date` is the unique session key the rest of
 * the build already routes on — so we derive the path from it directly, which is robust
 * to both the old absolute URLs and linguist's new relative form going forward.
 */
export function audioSrc(date: string): string {
  return `/audio/${date}.mp3`;
}

/** Read every `<date>.json` under `dir` into Transcript[] (sorted by filename), with
 *  the audio URL normalized same-origin (see {@link audioSrc}). */
export function loadTranscripts(dir: string): Transcript[] {
  return fs
    .readdirSync(dir)
    .filter((f) => TRANSCRIPT_FILE.test(f))
    .sort()
    .map((f) => {
      const t = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Transcript;
      return { ...t, audio: audioSrc(t.date) };
    });
}
