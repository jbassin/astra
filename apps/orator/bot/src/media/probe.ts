/**
 * Audio probing via ffprobe/ffmpeg (plan B19/B25). Shells out to host binaries,
 * so it is **injected** into routes (the default real prober vs a test stub) and
 * never imported by unit tests — keeping the CI lane binary-free (§11.2).
 * Both run through `runProcess` (`./process.ts`), which reads stdout and stderr together.
 */
import { runProcess } from "./process";

export interface AudioProbe {
  durationMs?: number;
  format?: string;
  /** EBU R128 integrated loudness (LUFS), for playback gain (D5). */
  loudnessLufs?: number;
}

export type AudioProber = (path: string) => Promise<AudioProbe>;

/** Duration (ms) + codec via ffprobe JSON. */
export async function probeDurationFormat(
  path: string,
): Promise<{ durationMs?: number; format?: string }> {
  const { code, stdout } = await runProcess("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_name",
    "-select_streams",
    "a:0",
    "-of",
    "json",
    path,
  ]);
  if (code !== 0) return {};
  try {
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: { codec_name?: string }[];
    };
    const dur = parsed.format?.duration
      ? Math.round(Number(parsed.format.duration) * 1000)
      : undefined;
    return { durationMs: dur, format: parsed.streams?.[0]?.codec_name };
  } catch {
    return {};
  }
}

/**
 * Integrated loudness via `ffmpeg ... -af ebur128`, parsed from the summary.
 *
 * `ebur128` streams a continuous measurement line for the WHOLE track, so on long
 * files (multi-hour OST loops) buffering all of stderr balloons memory and OOMs
 * at high ingest concurrency. `runProcess` keeps only a bounded stderr tail, and the
 * final "Integrated loudness  I: -14.2 LUFS" summary lives at the very end.
 */
export async function measureLoudness(path: string): Promise<number | undefined> {
  const { code, stderrTail } = await runProcess("ffmpeg", [
    "-nostats",
    "-i",
    path,
    "-af",
    "ebur128",
    "-f",
    "null",
    "-",
  ]);
  if (code !== 0) return undefined;
  // Take the LAST "I: … LUFS" — the end-of-run integrated value, not a mid-stream sample.
  const matches = [...stderrTail.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
  const last = matches.at(-1);
  return last ? Number(last[1]) : undefined;
}

/** The real prober used on the host: duration + format + loudness. */
export const ffmpegProber: AudioProber = async (path) => {
  const [{ durationMs, format }, loudnessLufs] = await Promise.all([
    probeDurationFormat(path),
    measureLoudness(path),
  ]);
  return { durationMs, format, loudnessLufs };
};
