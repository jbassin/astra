import { describe, expect, test } from "bun:test";
import { getLogger, getMeter, getTracer, initTelemetry, lazyCounter, lazyHistogram } from "./index";

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

  test("lazyCounter/lazyHistogram defer binding to first use (the metrics-no-proxy fix)", async () => {
    // Guards the load-bearing bug: a counter from getMeter().createCounter() created BEFORE
    // initTelemetry is a permanent no-op (metrics have no deferred proxy provider). lazy*
    // defers creation to first add()/record(), by which point init has run — so it connects.
    const counter = lazyCounter("astra.test", "astra.test.lazy.count");
    const hist = lazyHistogram("astra.test", "astra.test.lazy.ms");
    const t = initTelemetry("astra.test", { endpoint: "http://localhost:10353" });
    expect(() => counter.add(1, { outcome: "ok" })).not.toThrow();
    expect(() => hist.record(12.5)).not.toThrow();
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
