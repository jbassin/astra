import { SeverityNumber } from "@opentelemetry/api-logs";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  DEPLOYMENT_ENVIRONMENT,
  deploymentEnvironment,
  getLogger,
  getTracer,
  IGNORED_ERRORS_METRIC,
  initTelemetry,
  lazyCounter,
  logger,
  reportIgnored,
} from "./index";
import { type Captured, captureTelemetry } from "./testing";

let cap: Captured | null = null;
afterEach(async () => {
  await cap?.close();
  cap = null;
  vi.restoreAllMocks();
});

describe("@astra/observe", () => {
  test("under vitest, initTelemetry installs nothing (no test reaches the collector)", () => {
    expect(deploymentEnvironment()).toBe("test");
    const t = initTelemetry("astra.test");
    const span = getTracer("astra.test").startSpan("not-recorded");
    expect(span.isRecording()).toBe(false);
    span.end();
    expect(t.serviceName).toBe("astra.test");
  });

  test("a capture records spans with the service and environment resource", () => {
    cap = captureTelemetry({ serviceName: "astra.test" });
    getTracer("astra.test").startSpan("unit-span").end();
    const [span] = cap.spans();
    expect(span?.name).toBe("unit-span");
    expect(span?.resource.attributes["service.name"]).toBe("astra.test");
    expect(span?.resource.attributes[DEPLOYMENT_ENVIRONMENT]).toBe("test");
  });

  test("a second init with another name warns and keeps the first", () => {
    cap = captureTelemetry({ serviceName: "astra.first" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(initTelemetry("astra.second").serviceName).toBe("astra.first");
    expect(warn).toHaveBeenCalledOnce();
  });

  test("logger() sets severity text and number", () => {
    cap = captureTelemetry();
    logger("astra.test").warn("disk nearly full", { "disk.free_mb": 12 });
    const [record] = cap.logs();
    expect(record?.severityText).toBe("WARN");
    expect(record?.severityNumber).toBe(SeverityNumber.WARN);
    expect(record?.body).toBe("disk nearly full");
    expect(record?.attributes["disk.free_mb"]).toBe(12);
  });

  test("a raw emit with only severityText gets the matching number", () => {
    cap = captureTelemetry();
    getLogger("astra.test").emit({ severityText: "ERROR", body: "boom" });
    expect(cap.logs()[0]?.severityNumber).toBe(SeverityNumber.ERROR);
  });

  test("records mirror to stdout at INFO and above, not DEBUG", async () => {
    const lines: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    const { InMemorySpanExporter } = await import("@opentelemetry/sdk-trace-base");
    const { InMemoryLogRecordExporter } = await import("@opentelemetry/sdk-logs");
    const { InMemoryMetricExporter, PeriodicExportingMetricReader, AggregationTemporality } =
      await import("@opentelemetry/sdk-metrics");
    const t = initTelemetry("astra.mirror", {
      environment: "test",
      synchronous: true,
      exporters: {
        spans: new InMemorySpanExporter(),
        logs: new InMemoryLogRecordExporter(),
        metrics: new PeriodicExportingMetricReader({
          exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
        }),
      },
    });
    const log = logger("astra.mirror");
    log.info("listening on :8080", { port: 8080 });
    log.debug("noisy detail");
    await t.shutdown();
    write.mockRestore();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^\d{4}-\d\d-\d\dT[\d:.]+Z INFO astra\.mirror listening on :8080 \{"port":8080\}\n$/,
    );
  });

  test("reportIgnored counts by site and logs at DEBUG", async () => {
    cap = captureTelemetry();
    reportIgnored("test.cleanup", new Error("already closed"));
    reportIgnored("test.cleanup", "string reason");
    expect(await cap.metricSum(IGNORED_ERRORS_METRIC, { site: "test.cleanup" })).toBe(2);
    const [first] = cap.logs();
    expect(first?.severityNumber).toBe(SeverityNumber.DEBUG);
    expect(first?.attributes["exception.message"]).toBe("already closed");
  });

  test("lazyCounter binds on first add, after the provider exists", async () => {
    const counter = lazyCounter("astra.test", "astra.test.lazy.count");
    cap = captureTelemetry();
    counter.add(3, { outcome: "ok" });
    expect(await cap.metricSum("astra.test.lazy.count", { outcome: "ok" })).toBe(3);
  });
});
