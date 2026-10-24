import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { defaultConfigFile, findRepoRoot, loadConfig, resolveSopsRef, SecretRef } from "./index";
import { defaultSecretsFile } from "./secrets";

const ROOT = findRepoRoot();
// The loader tests read this small fixture, so a value change in the real config.kdl never
// touches them (the same files libs/py/config's tests read).
const FIXTURES = join(ROOT, "fixtures", "config");
const FIXTURE = join(FIXTURES, "config.kdl");
// The fixture with a bad value in a block only TS reads, and one only Python reads.
const BAD_TS_BLOCK = join(FIXTURES, "bad-ts-block.kdl");
const BAD_PY_BLOCK = join(FIXTURES, "bad-py-block.kdl");

// Actually decrypting needs the `sops` binary + the gitignored age key — host only.
// CI has neither, so the decrypt-backed check skips there (the env-override test still
// exercises resolution everywhere), mirroring libs/py/config's `sops_required`.
function sopsAvailable(): boolean {
  if (!existsSync(join(ROOT, "deploy", "sops", "age.key"))) return false;
  try {
    execFileSync("sops", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const SOPS = sopsAvailable();

// The repo-wide pytest conftest sets these; vitest has none, but a developer shell might.
let savedRoots: [string | undefined, string | undefined];
beforeEach(() => {
  savedRoots = [process.env.ASTRA_DATA_ROOT, process.env.ASTRA_CONTENT_ROOT];
  delete process.env.ASTRA_DATA_ROOT;
  delete process.env.ASTRA_CONTENT_ROOT;
});
afterEach(() => {
  const [data, content] = savedRoots;
  if (data === undefined) delete process.env.ASTRA_DATA_ROOT;
  else process.env.ASTRA_DATA_ROOT = data;
  if (content === undefined) delete process.env.ASTRA_CONTENT_ROOT;
  else process.env.ASTRA_CONTENT_ROOT = content;
});

describe("the real config.kdl", () => {
  // The one TS test that reads the real file: it loads the way every TS process does.
  // The whole-file check (every namespace) is libs/py/config's test_whole_config_kdl_validates.
  test("loads the TS-read namespaces", () => {
    const cfg = loadConfig();
    expect(typeof cfg.orator.measureLoudness).toBe("boolean");
    expect(cfg.portal.mcpApiKey).toBeInstanceOf(SecretRef);
    expect(cfg.portal.mcpApiKey?.configKey).toBe("portal.mcp-api-key");
    expect("heartwood" in cfg).toBe(false); // a Python-only block is dropped
  });
});

describe("per-language validation", () => {
  test("a bad value in a Python-only block does not break the TS loader", () => {
    // libs/py/config rejects this file, in both its loader and the whole-file check.
    const cfg = loadConfig(BAD_PY_BLOCK);
    expect(cfg.orator.port).toBe(20002);
    expect("heartwood" in cfg).toBe(false);
  });

  test("a bad value in a TS block fails the TS loader", () => {
    // libs/py/config's loader loads this file; its whole-file check rejects it.
    expect(() => loadConfig(BAD_TS_BLOCK)).toThrow(/port/);
  });
});

describe("the loader, against the fixture", () => {
  test("values load with the right types", () => {
    const cfg = loadConfig(FIXTURE);
    expect(cfg.telemetry.otlpEndpoint).toBe("http://collector.test:4318");
    expect(cfg.codex.port).toBe(20001); // number, not string
    expect(cfg.orator.port).toBe(20002);
    expect(cfg.orator.targetLufs).toBe(-9); // negative number
    expect(cfg.orator.measureLoudness).toBe(false); // boolean
    expect(cfg.weal.bindAddr).toBe("127.0.0.1:10203"); // an absent block → its defaults
  });

  test("secret fields are lazy refs, not plaintext", () => {
    const cfg = loadConfig(FIXTURE);
    const ref = cfg.orator.sessionSecret;
    expect(ref).toBeInstanceOf(SecretRef);
    expect(ref?.ref).toBe("sops:fixture_session_secret");
    expect(ref?.configKey).toBe("orator.session-secret");
    expect(JSON.stringify(ref)).toContain("SecretRef"); // never leaks the value
    expect(cfg.orator.discordToken).toBeUndefined(); // absent → undefined
  });

  test("unknown KDL key is rejected", async () => {
    const tmp = join(tmpdir(), `astra-config-bad-${Date.now()}.kdl`);
    await writeFile(tmp, 'orator {\n  port 1\n  bogus-field "nope"\n}\n');
    expect(() => loadConfig(tmp)).toThrow(/bogusField/);
  });

  test("data paths: relative → under root, absolute as-is, empty stays unset", () => {
    const cfg = loadConfig(FIXTURE);
    expect(cfg.data.root).toBe("/srv/state");
    expect(cfg.data.contentRoot).toBe("/srv/state/astra-data"); // the default, under root
    expect(cfg.codex.dataPath).toBe("/srv/state/codex/data");
    expect(cfg.menhir.resultsPath).toBe("/srv/state/menhir/results.jsonl");
    expect(cfg.data.akashaContent).toBe("/elsewhere/content");
    expect(cfg.orator.dataDir).toBe("/data"); // a container path, not a data path
    // A dataset's default resolves under the default content root (`astra-data` under root).
    expect(cfg.data.linguistData).toBe("/srv/state/astra-data/linguist/data");
    process.env.ASTRA_DATA_ROOT = "/override";
    process.env.ASTRA_CONTENT_ROOT = "/clone";
    const over = loadConfig(FIXTURE);
    expect(over.codex.dataPath).toBe("/override/codex/data");
    expect(over.data.contentRoot).toBe("/clone");
    expect(over.data.linguistData).toBe("/clone/linguist/data");
    expect(over.data.akashaContent).toBe("/elsewhere/content");
  });
});

describe("secrets", () => {
  test.skipIf(!SOPS)("present secret resolves via sops", () => {
    expect(new SecretRef("sops:openrouter_api_key").resolve().startsWith("sk-or-")).toBe(true);
  });

  test("env override wins over sops", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-env-override";
    try {
      expect(resolveSopsRef("sops:openrouter_api_key")).toBe("sk-or-env-override");
    } finally {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  test.skipIf(!SOPS)("absent secret raises only on resolve (lazy)", () => {
    const ref = new SecretRef("sops:astra_test_absent_key");
    expect(() => ref.resolve()).toThrow();
  });
});

describe("findRepoRoot", () => {
  test("walks up to the checkout from any depth, and throws outside one", () => {
    expect(existsSync(join(ROOT, "ontology", "ontology-config", "config.kdl"))).toBe(true);
    expect(findRepoRoot(join(ROOT, "apps", "any", "depth"))).toBe(ROOT);
    expect(() => findRepoRoot(tmpdir())).toThrow(/ontology-config/);
  });

  test("the default config and secrets paths use the one root", () => {
    const saved = process.env.ASTRA_SOPS_FILE;
    delete process.env.ASTRA_SOPS_FILE;
    try {
      expect(defaultConfigFile()).toBe(join(ROOT, "ontology", "ontology-config", "config.kdl"));
      expect(defaultSecretsFile()).toBe(join(ROOT, "deploy", "sops", "secrets.enc.yaml"));
    } finally {
      if (saved !== undefined) process.env.ASTRA_SOPS_FILE = saved;
    }
  });
});
