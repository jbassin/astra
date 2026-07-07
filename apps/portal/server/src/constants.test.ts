import { describe, expect, it } from "vitest";

import { BRIDGE_WS_PATH, MCP_HTTP_PATH, SERVICE_NAME } from "./constants";

describe("portal-server wire constants", () => {
  it("names its own telemetry service (no config service-name field, D3)", () => {
    expect(SERVICE_NAME).toBe("astra.portal");
  });

  it("keeps the bridge WS and MCP HTTP surfaces on distinct, absolute paths", () => {
    expect(BRIDGE_WS_PATH).toMatch(/^\//);
    expect(MCP_HTTP_PATH).toMatch(/^\//);
    expect(BRIDGE_WS_PATH).not.toBe(MCP_HTTP_PATH);
  });
});
