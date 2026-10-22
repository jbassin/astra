/**
 * A blank secret (empty or ASCII-whitespace-only) counts as UNSET (0037 LIB-2) — the TS
 * twin of `libs/py/config/tests/test_config_blank_secrets.py`, same cases.
 *
 * Compose injects every secret as `${KEY:-}`, so a container recreated without `just up`
 * sees the env var present but empty. A blank value must behave exactly like an absent
 * one at both resolution steps (env override, then the SOPS file).
 *
 * Hermetic: a fake `sops` on PATH prints a plaintext fixture, so the file path runs in CI
 * without the real binary or age key.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { isBlankSecret, resolveSopsRef, SecretRef } from "./index";

const REF = "sops:astra_blank_test_secret";
const ENV = "ASTRA_BLANK_TEST_SECRET";
const BLANKS = ["", " ", "\t", "\n", " \t\r\n\f\v "];

let dir: string;
let savedPath: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "astra-blank-secret-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "sops"),
    '#!/bin/sh\n# fake `sops -d FILE`: the fixture is already plaintext\ncat "$2"\n',
    { mode: 0o755 },
  );
  savedPath = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${savedPath ?? ""}`;
  delete process.env[ENV];
});

afterEach(() => {
  process.env.PATH = savedPath;
  delete process.env[ENV];
});

/** A fresh file per call, so the per-path decrypt cache never leaks between cases. */
let fileSeq = 0;
function secretsFile(yaml: string): string {
  const path = join(dir, `secrets-${fileSeq++}.enc.yaml`);
  writeFileSync(path, yaml);
  return path;
}

describe("isBlankSecret", () => {
  const cases: [string | null | undefined, boolean][] = [
    [undefined, true],
    [null, true],
    ...BLANKS.map((b): [string, boolean] => [b, true]),
    ["x", false],
    [" x ", false],
    // Non-ASCII whitespace is a value: the blank set is explicit ASCII so the Python twin
    // (whose str.strip() set differs from trim()) classifies it identically.
    [" ", false],
    ["﻿", false],
  ];
  test.each(cases)("%j → blank=%s", (value, blank) => {
    expect(isBlankSecret(value)).toBe(blank);
  });
});

describe("resolveSopsRef: blank counts as unset", () => {
  test("missing env falls through to the file", () => {
    const file = secretsFile("astra_blank_test_secret: from-file\n");
    expect(resolveSopsRef(REF, file)).toBe("from-file");
  });

  test("missing env and missing key throws", () => {
    const file = secretsFile("other_key: x\n");
    expect(() => resolveSopsRef(REF, file)).toThrow(/astra_blank_test_secret/);
  });

  test.each(BLANKS)("blank env %j falls through like missing", (blank) => {
    const file = secretsFile("astra_blank_test_secret: from-file\n");
    process.env[ENV] = blank;
    expect(resolveSopsRef(REF, file)).toBe("from-file");
  });

  test.each(BLANKS)("blank env %j and missing key throws like missing", (blank) => {
    const file = secretsFile("other_key: x\n");
    process.env[ENV] = blank;
    expect(() => resolveSopsRef(REF, file)).toThrow(/astra_blank_test_secret/);
  });

  test("blank env without a SOPS file throws like missing (the in-container case)", () => {
    process.env[ENV] = "";
    expect(() => resolveSopsRef(REF, join(dir, "absent.enc.yaml"))).toThrow(
      /SOPS secrets file not found/,
    );
  });

  test.each([
    ["empty", 'astra_blank_test_secret: ""\n'],
    ["whitespace", 'astra_blank_test_secret: "  \\t "\n'],
    ["yaml-null", "astra_blank_test_secret:\n"],
  ])("blank file entry (%s) throws like missing", (_name, entry) => {
    const file = secretsFile(entry);
    expect(() => resolveSopsRef(REF, file)).toThrow(/astra_blank_test_secret/);
  });

  test.each(["real-value", "  padded value  "])("real env value %j wins, verbatim", (value) => {
    const file = secretsFile("astra_blank_test_secret: from-file\n");
    process.env[ENV] = value;
    expect(resolveSopsRef(REF, file)).toBe(value);
  });

  test("SecretRef.resolve applies the same rule", () => {
    const ref = new SecretRef(REF, secretsFile("other_key: x\n"));
    process.env[ENV] = "";
    expect(() => ref.resolve()).toThrow();
    process.env[ENV] = "real-value";
    expect(ref.resolve()).toBe("real-value");
  });
});
