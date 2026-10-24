/**
 * yt-dlp wrappers (plan B20/B21). The `YtDlp` interface is injected so the ingest service can be
 * unit-tested with a stub; the real implementation shells out to the `yt-dlp` binary.
 *
 * Every run goes through `runProcess` (`./process.ts`): a wall-clock limit from config kills
 * yt-dlp's whole process tree, and a failure's message carries the end of yt-dlp's stderr, which
 * the job item stores and the operator UI shows.
 */
import { runProcess, tailForMessage } from "./process";

export interface PlaylistEntry {
  videoId: string;
  title: string;
}

export interface PlaylistInfo {
  title: string;
  entries: PlaylistEntry[];
}

export interface DownloadTarget {
  /** A full video URL, or a bare videoId (resolved to a watch URL). */
  url?: string;
  videoId?: string;
}

export interface DownloadResult {
  filePath: string;
  title: string;
  videoId: string;
  format: string;
  durationMs?: number;
  fileSize?: number;
}

export interface YtDlp {
  /** `signal` stops the run (shutdown); the promise then rejects. */
  enumerate(url: string, signal?: AbortSignal): Promise<PlaylistInfo>;
  download(
    target: DownloadTarget,
    destDir: string,
    onProgress?: (pct: number) => void,
    signal?: AbortSignal,
  ): Promise<DownloadResult>;
}

/**
 * Whether a URL should be treated as a playlist import (B21) vs a single video
 * (B20). A `list=` param means playlist — EXCEPT auto-generated radio/mix lists
 * (`RD…`, `UL…`), which are effectively infinite and treated as a single video.
 */
export function isPlaylistUrl(url: string): boolean {
  let list: string | null;
  try {
    list = new URL(url).searchParams.get("list");
  } catch {
    return false;
  }
  if (!list) return false;
  return !/^(RD|UL|RDMM|RDCLAK)/.test(list);
}

/** Best-effort extraction of the `v=` video id (or youtu.be path). */
export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

function failureMessage(what: string, code: number, stderrTail: string): string {
  const tail = tailForMessage(stderrTail);
  return `${what} (exit ${code})${tail ? `: ${tail}` : ""}`;
}

/** Runs yt-dlp and parses its stdout as JSON; a non-zero exit throws with stderr's tail. */
async function runJson(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
  const { code, stdout, stderrTail } = await runProcess("yt-dlp", args, { timeoutMs, signal });
  if (code !== 0) throw new Error(failureMessage("yt-dlp failed", code, stderrTail));
  return JSON.parse(stdout);
}

/**
 * yt-dlp needs a JavaScript runtime for YouTube's signature challenges (EJS);
 * only deno is enabled by default and the runtime image ships node, so opt it in.
 * Without a runtime, extraction is deprecated and formats go missing (403s).
 */
const JS_RUNTIME_ARGS = ["--js-runtimes", "node"] as const;

/** The `--print after_move:…` line's fields, or null for any other stdout line. */
export function parseMetaLine(line: string): DownloadResult | null {
  if (!line.includes("\t")) return null;
  const [videoId, title, ext, duration, filepath] = line.split("\t");
  if (!videoId || !filepath) return null;
  return {
    videoId,
    title: title ?? videoId,
    format: ext ?? "webm",
    filePath: filepath.trim(),
    durationMs: duration && duration !== "NA" ? Math.round(Number(duration) * 1000) : undefined,
  };
}

export interface YtDlpLimits {
  /** Wall-clock limit on one playlist listing (`orator.ytdlp-enumerate-timeout-s`). */
  enumerateTimeoutMs: number;
  /** Wall-clock limit on one download (`orator.ytdlp-download-timeout-s`). */
  downloadTimeoutMs: number;
}

/** The real yt-dlp-backed implementation used on the host. */
export function createYtDlp(limits: YtDlpLimits): YtDlp {
  return {
    async enumerate(url, signal) {
      const data = (await runJson(
        [...JS_RUNTIME_ARGS, "--flat-playlist", "--dump-single-json", "--no-warnings", url],
        limits.enumerateTimeoutMs,
        signal,
      )) as { title?: string; entries?: { id?: string; title?: string }[] };
      return {
        title: data.title ?? "Imported playlist",
        entries: (data.entries ?? [])
          .filter((e): e is { id: string; title?: string } => typeof e.id === "string")
          .map((e) => ({ videoId: e.id, title: e.title ?? e.id })),
      };
    },

    async download(target, destDir, onProgress, signal) {
      const url = target.url ?? `https://www.youtube.com/watch?v=${target.videoId}`;
      let meta: DownloadResult | null = null;
      const { code, stderrTail } = await runProcess(
        "yt-dlp",
        [
          ...JS_RUNTIME_ARGS,
          "-f",
          "bestaudio/best",
          "--no-playlist",
          "--newline",
          "--no-warnings",
          "--print",
          "after_move:%(id)s\t%(title)s\t%(ext)s\t%(duration)s\t%(filepath)s",
          "-o",
          `${destDir}/%(id)s.%(ext)s`,
          url,
        ],
        {
          timeoutMs: limits.downloadTimeoutMs,
          signal,
          onLine: (line) => {
            const prog = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
            if (prog && onProgress) onProgress(Number(prog[1]));
            meta = parseMetaLine(line) ?? meta;
          },
        },
      );
      if (code !== 0) throw new Error(failureMessage("yt-dlp download failed", code, stderrTail));
      if (!meta) throw new Error("yt-dlp download failed: it printed no file metadata");
      onProgress?.(100);
      return meta;
    },
  };
}
