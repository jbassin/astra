import { tmpdir } from "node:os";
import { join } from "node:path";

import { SecretRef } from "@astra/config";
import { afterEach, describe, expect, test } from "vitest";

import { createApp } from "../src/server";
import { requireIngestToken } from "../src/startup";

// A real SecretRef whose SOPS fallback points at a missing file: the in-container state,
// where `just up` was skipped and compose injected `${WEAL_OVERLAY_TEST_TOKEN:-}` = "".
// Hermetic — resolution never reaches the real SOPS file or the sops binary.
const ENV = "WEAL_OVERLAY_TEST_TOKEN";
const ref = () =>
  new SecretRef(
    "sops:weal_overlay_test_token",
    join(tmpdir(), "weal-overlay-absent.enc.yaml"),
    "weal-overlay.token",
  );

afterEach(() => {
  delete process.env[ENV];
});

describe("requireIngestToken (fail closed, 0037 SEC-12)", () => {
  test.each(["", "   ", "\t\n"])("refuses a blank injected token %j", (blank) => {
    process.env[ENV] = blank;
    expect(() => requireIngestToken(ref())).toThrow(
      /weal-overlay\.token .*unset, blank.*\$WEAL_OVERLAY_TEST_TOKEN/,
    );
  });

  test("refuses an unset token with no SOPS fallback", () => {
    expect(() => requireIngestToken(ref())).toThrow(/unset, blank or unresolvable/);
  });

  test("refuses a config with no ref= at all", () => {
    expect(() => requireIngestToken(undefined)).toThrow(/has no ref=/);
  });

  test("returns a real token", () => {
    process.env[ENV] = "s3cret";
    expect(requireIngestToken(ref())).toBe("s3cret");
  });
});

describe("createApp has no open-ingest mode", () => {
  test.each(["", "  "])("refuses a blank token %j", (blank) => {
    expect(() => createApp({ token: blank, distDir: "/nonexistent" })).toThrow(/token is blank/);
  });
});
