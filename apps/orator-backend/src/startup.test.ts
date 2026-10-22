import { tmpdir } from "node:os";
import { join } from "node:path";

import { SecretRef } from "@astra/config";
import { afterEach, describe, expect, test } from "vitest";

import {
  MIN_SESSION_SECRET_BYTES,
  optionalSecret,
  requireAllowlist,
  requireSecret,
} from "./startup";

// A real SecretRef whose SOPS fallback points at a missing file: the in-container state,
// where `just up` was skipped and compose injected `${ORATOR_TEST_SECRET:-}` = "".
// Hermetic — resolution never reaches the real SOPS file or the sops binary.
const ENV = "ORATOR_TEST_SECRET";
const ref = () =>
  new SecretRef("sops:orator_test_secret", join(tmpdir(), "orator-absent.enc.yaml"));
const STRONG = "x".repeat(MIN_SESSION_SECRET_BYTES);

afterEach(() => {
  delete process.env[ENV];
});

describe("requireSecret (fail closed, 0037 SVC-2)", () => {
  test.each(["", "   ", "\t\n"])("refuses a blank injected secret %j", (blank) => {
    process.env[ENV] = blank;
    expect(() => requireSecret(ref(), "sessionSecret", MIN_SESSION_SECRET_BYTES)).toThrow(
      /cfg\.orator\.sessionSecret .*missing or empty.*\$ORATOR_TEST_SECRET/,
    );
  });

  test("refuses an unset secret with no SOPS fallback", () => {
    expect(() => requireSecret(ref(), "sessionSecret")).toThrow(/missing or empty/);
  });

  test("refuses a field with no ref= at all", () => {
    expect(() => requireSecret(undefined, "sessionSecret")).toThrow(/has no ref=/);
  });

  test("refuses a short session secret without echoing it", () => {
    process.env[ENV] = "short-secret";
    let message = "";
    try {
      requireSecret(ref(), "sessionSecret", MIN_SESSION_SECRET_BYTES);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/shorter than 32 bytes/);
    expect(message).not.toContain("short-secret");
  });

  test("returns a real secret", () => {
    process.env[ENV] = STRONG;
    expect(requireSecret(ref(), "sessionSecret", MIN_SESSION_SECRET_BYTES)).toBe(STRONG);
  });
});

describe("optionalSecret", () => {
  test("a blank or unresolvable secret turns the feature off", () => {
    process.env[ENV] = "";
    expect(optionalSecret(ref())).toBe("");
    expect(optionalSecret(undefined)).toBe("");
  });

  test("a real secret resolves", () => {
    process.env[ENV] = "token";
    expect(optionalSecret(ref())).toBe("token");
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
