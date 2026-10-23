/**
 * Audio probing via ffprobe/ffmpeg (plan B19/B25). Shells out to host binaries,
 * so it is **injected** into routes (the default real prober vs a test stub) and
 * never imported by unit tests — keeping the CI lane binary-free (§11.2).
 *
 * Bun.spawn → node:child_process (R3, 0022 S8 — off Bun; Node's child
 * stdout/stderr are async-iterable too, so the streaming/tail logic is unchanged).
 */
import { type ChildProcess, spawn } from "node:child_process";

export interface AudioProbe {
  durationMs?: number;
  format?: string;
  /** EBU R128 integrated loudness (LUFS), for playback gain (D5). */
  loudnessLufs?: number;
}

export type AudioProber = (path: string) => Promise<AudioProbe>;

/** Resolves with the child's exit code once it closes (Bun's `proc.exited` analog). */
function exited(proc: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    proc.once("error", reject);
    proc.once("close", (code) => resolve(code ?? 1));
  });
}

/** Buffers an async-iterable stdout/stderr stream to a string (Bun's `new Response(stream).text()` analog). */
async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const decoder = new TextDecoder();
  let out = "";
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    out += decoder.decode(chunk, { stream: true });
  }
  return out + decoder.decode();
}

async function run(cmd: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const [bin, ...args] = cmd;
  if (!bin) throw new Error("run: empty command");
  // `as const` narrows to the exact spawn() overload with non-null stdout/stderr
  // (ChildProcessByStdio), so no non-null assertion is needed below.
  const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] as const });
  const [stdout, stderr, code] = await Promise.all([
    readAll(proc.stdout),
    readAll(proc.stderr),
    exited(proc),
  ]);
  return { code, stdout, stderr };
}

/** Duration (ms) + codec via ffprobe JSON. */
export async function probeDurationFormat(
  path: string,
): Promise<{ durationMs?: number; format?: string }> {
  const { code, stdout } = await run([
    "ffprobe",
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
 * at high ingest concurrency. We stream it and keep only a bounded tail — the
 * final "Integrated loudness  I: -14.2 LUFS" summary lives at the very end.
 */
export async function measureLoudness(path: string): Promise<number | undefined> {
  const proc = spawn("ffmpeg", ["-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const decoder = new TextDecoder();
  let tail = "";
  for await (const chunk of proc.stderr as unknown as AsyncIterable<Uint8Array>) {
    tail = (tail + decoder.decode(chunk)).slice(-8192); // last 8 KB is plenty for the summary
  }
  if ((await exited(proc)) !== 0) return undefined;
  // Take the LAST "I: … LUFS" — the end-of-run integrated value, not a mid-stream sample.
  const matches = [...tail.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
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
