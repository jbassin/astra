import { describe, expect, test } from "vitest";

import { failStartup } from "./startup";

describe("failStartup", () => {
  const run = async (shutdown: () => Promise<unknown>) => {
    const events: string[] = [];
    await failStartup(new Error("0001_initial.sql changed after it was applied"), {
      stderr: (line) => events.push(`stderr: ${line}`),
      emitFatal: (body) => events.push(`fatal: ${body}`),
      shutdownTelemetry: async () => {
        events.push("flush");
        await shutdown();
      },
      exit: (code) => events.push(`exit ${code}`),
    }).catch(() => events.push("threw"));
    return events;
  };

  test("writes the reason to stderr, logs FATAL, flushes, then exits 1", async () => {
    const reason = "weal-bot failed to start: Error: 0001_initial.sql changed after it was applied";
    expect(await run(() => Promise.resolve())).toEqual([
      `stderr: ${reason}`,
      `fatal: ${reason}`,
      "flush",
      "exit 1",
    ]);
  });

  test("still exits 1 when the telemetry flush fails", async () => {
    const events = await run(() => Promise.reject(new Error("collector down")));
    expect(events.slice(-2)).toEqual(["exit 1", "threw"]);
  });
});
