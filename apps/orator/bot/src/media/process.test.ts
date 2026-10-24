/**
 * runProcess against real child processes. The children are `node -e` scripts, so the test needs
 * no yt-dlp or ffmpeg (CI has neither).
 */
import { describe, expect, test } from "vitest";

import { ProcessAbortedError, ProcessTimeoutError, runProcess } from "./process";
import { parseMetaLine } from "./ytdlp";

const NODE = process.execPath;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntilDead(pid: number): Promise<boolean> {
  for (let i = 0; i < 50; i++) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

// A parent that starts a grandchild (as yt-dlp starts ffmpeg), prints its pid, and hangs.
const PARENT_WITH_CHILD = `
const { spawn } = require("node:child_process");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
process.stdout.write(child.pid + "\\n");
process.stderr.write("ERROR: HTTP Error 403: Forbidden\\n");
setInterval(() => {}, 1000);
`;

describe("runProcess", () => {
  test("a timeout kills the whole process tree and the error quotes stderr", async () => {
    const pids: number[] = [];
    const run = runProcess(NODE, ["-e", PARENT_WITH_CHILD], {
      timeoutMs: 500,
      onLine: (line) => pids.push(Number(line)),
    });
    await expect(run).rejects.toBeInstanceOf(ProcessTimeoutError);
    await expect(run).rejects.toThrow(/timed out after \d+s: ERROR: HTTP Error 403: Forbidden/);
    const [grandchild] = pids;
    expect(grandchild).toBeGreaterThan(0);
    expect(await waitUntilDead(grandchild ?? 0)).toBe(true);
  });

  test("an abort kills the tree and rejects with ProcessAbortedError", async () => {
    const controller = new AbortController();
    const pids: number[] = [];
    const run = runProcess(NODE, ["-e", PARENT_WITH_CHILD], {
      signal: controller.signal,
      onLine: (line) => {
        pids.push(Number(line));
        controller.abort();
      },
    });
    await expect(run).rejects.toBeInstanceOf(ProcessAbortedError);
    expect(await waitUntilDead(pids[0] ?? 0)).toBe(true);
  });

  test("stdout lines split across chunks arrive whole; stderr keeps a bounded tail", async () => {
    const script = `
      process.stdout.write("first li");
      setTimeout(() => {
        process.stdout.write("ne\\nsecond\\nno newline at end");
        process.stderr.write("x".repeat(20000) + "the end");
        process.exitCode = 3;
      }, 50);
    `;
    const lines: string[] = [];
    const result = await runProcess(NODE, ["-e", script], { onLine: (l) => lines.push(l) });
    expect(lines).toEqual(["first line", "second", "no newline at end"]);
    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderrTail.length).toBe(8192);
    expect(result.stderrTail.endsWith("the end")).toBe(true);
  });

  test("without onLine, stdout is buffered whole", async () => {
    const result = await runProcess(NODE, ["-e", `process.stdout.write(JSON.stringify({a: 1}))`]);
    expect(JSON.parse(result.stdout)).toEqual({ a: 1 });
    expect(result.code).toBe(0);
  });

  test("an already-aborted signal never spawns", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runProcess(NODE, ["-e", ""], { signal: controller.signal }),
    ).rejects.toBeInstanceOf(ProcessAbortedError);
  });
});

describe("parseMetaLine", () => {
  test("reads the after_move print line", () => {
    expect(parseMetaLine("abc\tSong\topus\t61.5\t/data/audio/abc.opus\n")).toEqual({
      videoId: "abc",
      title: "Song",
      format: "opus",
      filePath: "/data/audio/abc.opus",
      durationMs: 61500,
    });
  });
  test("ignores progress lines and an NA duration", () => {
    expect(parseMetaLine("[download]  42.0% of 3.2MiB")).toBeNull();
    expect(parseMetaLine("abc\tSong\topus\tNA\t/x.opus")?.durationMs).toBeUndefined();
  });
});
