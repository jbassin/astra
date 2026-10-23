import { describe, expect, it } from "vitest";

import { recordSearchEvent } from "./telemetry";

/**
 * D29-38 — offline wiring check, same posture as `@astra/observe`'s own
 * `index.test.ts` ("Offline wiring checks — the end-to-end 'a span lands in
 * SigNoz' check is the substrate smoke / live gate. The exporter never
 * connects here."): `initTelemetry` was never called in this test process,
 * so `getTracer`/the `lazyCounter` both resolve to no-op implementations —
 * this only proves the call sequence never throws for either surface value,
 * which is what a request handler actually needs. The real emission is
 * proven live at the S4 gate (a local OTLP/console smoke or SigNoz check —
 * see the session report).
 */
describe("recordSearchEvent (D29-38)", () => {
  it("never throws for the omnibar surface", () => {
    expect(() => recordSearchEvent("omnibar")).not.toThrow();
  });

  it("never throws for the page surface", () => {
    expect(() => recordSearchEvent("page")).not.toThrow();
  });
});
