import { tmpdir } from "node:os";
import { join } from "node:path";

import { SecretRef } from "@astra/config";
import { afterEach, describe, expect, test } from "vitest";

import { MIN_SESSION_SECRET_BYTES, requireAllowlist, requireSessionSecret } from "./startup";

// A real SecretRef whose SOPS fallback points at a missing file: the in-container state,
// where `just up` was skipped and compose injected `${ORATOR_TEST_SECRET:-}` = "".
// Hermetic — resolution never reaches the real SOPS file or the sops binary.
const ENV = "ORATOR_TEST_SECRET";
const ref = () =>
  new SecretRef(
    "sops:orator_test_secret",
    join(tmpdir(), "orator-absent.enc.yaml"),
    "orator.session-secret",
  );
const STRONG = "x".repeat(MIN_SESSION_SECRET_BYTES);

afterEach(() => {
  delete process.env[ENV];
});

describe("requireSessionSecret (fail closed)", () => {
  test.each(["", "   ", "\t\n"])("refuses a blank injected secret %j", (blank) => {
    process.env[ENV] = blank;
    expect(() => requireSessionSecret(ref())).toThrow(
      /orator\.session-secret .*unset, blank.*\$ORATOR_TEST_SECRET/,
    );
  });

  test("refuses an unset secret with no SOPS fallback", () => {
    expect(() => requireSessionSecret(ref())).toThrow(/unset, blank or unresolvable/);
  });

  test("refuses a field with no ref= at all", () => {
    expect(() => requireSessionSecret(undefined)).toThrow(/has no ref=/);
  });

  test("refuses a short session secret without echoing it", () => {
    process.env[ENV] = "short-secret";
    let message = "";
    try {
      requireSessionSecret(ref());
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/shorter than 32 bytes/);
    expect(message).not.toContain("short-secret");
  });

  test("returns a real secret", () => {
    process.env[ENV] = STRONG;
    expect(requireSessionSecret(ref())).toBe(STRONG);
  });
});

describe("requireAllowlist (fail closed)", () => {
  test("refuses an empty allowlist", () => {
    expect(() => requireAllowlist(new Set())).toThrow(/allowlist is empty/);
  });

  test("passes a non-empty allowlist through", () => {
    const allow = new Set(["123"]);
    expect(requireAllowlist(allow)).toBe(allow);
  });
});
