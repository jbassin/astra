import { describe, expect, test } from "bun:test";
import { getLogger, getMeter, getTracer, initTelemetry } from "./index";

// Offline wiring checks — the end-to-end "a span lands in SigNoz" check is the
// substrate smoke (exit gate E). The exporter never connects here.
describe("@astra/observe", () => {
  test("initTelemetry is idempotent (same handle on re-init)", async () => {
    const a = initTelemetry("astra.test", { endpoint: "http://localhost:10353" });
    const b = initTelemetry("astra.test-again");
    expect(b).toBe(a);
    await a.shutdown();
  });

  test("getTracer yields a usable span; getMeter a usable counter", async () => {
    const t = initTelemetry("astra.test", { endpoint: "http://localhost:10353" });
    const span = getTracer("astra.test").startSpan("unit-span");
    span.setAttribute("astra.lane", "ts");
    span.end();
    getMeter("astra.test").createCounter("astra.test.calls").add(1);
    getLogger("astra.test").emit({ body: "a record that would export to SigNoz" });
    await t.shutdown();
  });

  test("shutdown allows a fresh init", async () => {
    const first = initTelemetry("astra.first", { endpoint: "http://localhost:10353" });
    await first.shutdown();
    const second = initTelemetry("astra.second", { endpoint: "http://localhost:10353" });
    expect(second).not.toBe(first);
    await second.shutdown();
  });
});
