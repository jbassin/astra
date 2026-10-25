/**
 * One way to run a media child process (yt-dlp, ffprobe, ffmpeg). It reads stdout and stderr at
 * the same time, so a full pipe never blocks the child; splits stdout into lines across chunk
 * boundaries; keeps only a bounded tail of stderr; and, when `timeoutMs` passes or `signal`
 * aborts, kills the child's whole process group (yt-dlp runs ffmpeg as its own child).
 */
import { spawn } from "node:child_process";

/** How much of stderr a result keeps (the end, where tools print the summary and the error). */
const STDERR_TAIL_BYTES = 8192;
/** How much of the stderr tail an error message quotes. */
const MESSAGE_TAIL_CHARS = 600;

interface RunOptions {
  /** Kill the process group and reject with {@link ProcessTimeoutError} after this long. */
  timeoutMs?: number;
  /** Kill the process group and reject with {@link ProcessAbortedError} when this aborts. */
  signal?: AbortSignal;
  /** Called with each stdout line. Without it, stdout is buffered into the result. */
  onLine?: (line: string) => void;
}

interface RunResult {
  code: number;
  /** All of stdout, or "" when `onLine` consumed it. */
  stdout: string;
  /** The last {@link STDERR_TAIL_BYTES} of stderr. */
  stderrTail: string;
}

/** The last few stderr lines, trimmed to a length that fits in an error message. */
export function tailForMessage(stderrTail: string): string {
  const trimmed = stderrTail.trim();
  return trimmed.length > MESSAGE_TAIL_CHARS ? `…${trimmed.slice(-MESSAGE_TAIL_CHARS)}` : trimmed;
}

export class ProcessTimeoutError extends Error {
  constructor(bin: string, timeoutMs: number, stderrTail: string) {
    const tail = tailForMessage(stderrTail);
    super(`${bin} timed out after ${Math.round(timeoutMs / 1000)}s${tail ? `: ${tail}` : ""}`);
    this.name = "ProcessTimeoutError";
  }
}

export class ProcessAbortedError extends Error {
  constructor(bin: string) {
    super(`${bin} was stopped`);
    this.name = "ProcessAbortedError";
  }
}

/** Run `bin args…`, resolving with its exit code once it closes (a non-zero code is not an error). */
export function runProcess(bin: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new ProcessAbortedError(bin));
      return;
    }
    // `detached` makes the child a process-group leader, so one kill reaches its children too.
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
    let stdout = "";
    let pending = "";
    let stderrTail = "";
    let failure: Error | null = null;
    const outDecoder = new TextDecoder();
    const errDecoder = new TextDecoder();

    const killGroup = (why: Error) => {
      failure ??= why;
      try {
        if (proc.pid !== undefined) process.kill(-proc.pid, "SIGKILL");
      } catch {
        // The group already exited between the deadline and the kill.
      }
    };

    const timer =
      opts.timeoutMs === undefined
        ? undefined
        : setTimeout(
            () => killGroup(new ProcessTimeoutError(bin, opts.timeoutMs ?? 0, stderrTail)),
            opts.timeoutMs,
          );
    const onAbort = () => killGroup(new ProcessAbortedError(bin));
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    const emitLines = (text: string) => {
      if (!opts.onLine) {
        stdout += text;
        return;
      }
      pending += text;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) opts.onLine(line);
    };

    proc.stdout.on("data", (chunk: Buffer) =>
      emitLines(outDecoder.decode(chunk, { stream: true })),
    );
    proc.stderr.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + errDecoder.decode(chunk, { stream: true })).slice(
        -STDERR_TAIL_BYTES,
      );
    });

    const finish = () => {
      if (timer !== undefined) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    };
    proc.once("error", (err) => {
      finish();
      reject(err);
    });
    proc.once("close", (code) => {
      finish();
      emitLines(outDecoder.decode());
      if (opts.onLine && pending) opts.onLine(pending);
      stderrTail = (stderrTail + errDecoder.decode()).slice(-STDERR_TAIL_BYTES);
      if (failure) reject(failure);
      else resolve({ code: code ?? 1, stdout, stderrTail });
    });
  });
}
