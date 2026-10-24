import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  defaultConfigFile,
  findPackageRoot,
  findRepoRoot,
  loadConfig,
  resolveSopsRef,
  SecretRef,
} from "./index";
import { defaultSecretsFile } from "./secrets";

const ROOT = findRepoRoot();
// The loader tests read this fixture, so a value change in the real config.kdl never
// touches them (the same file libs/py/config's tests read).
const FIXTURE = join(ROOT, "fixtures", "config", "config.kdl");

/** `text` in a temp KDL file. */
async function writeTmp(text: string): Promise<string> {
  const tmp = join(tmpdir(), `astra-config-${process.pid}-${Math.random()}.kdl`);
  await writeFile(tmp, text);
  return tmp;
}

/** The fixture with its one `line` replaced, in a temp file. */
async function fixtureWith(line: string, replacement: string): Promise<string> {
  const text = readFileSync(FIXTURE, "utf8");
  if (text.split(line).length !== 2) throw new Error(`fixture lacks one ${JSON.stringify(line)}`);
  return writeTmp(text.replace(line, replacement));
}

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
    expect(cfg.portal.bridgeUserId).toBe("xlC6LfQ7godJVVFf"); // the headless Portal user
    expect("heartwood" in cfg).toBe(false); // a Python-only block is dropped
  });
});

describe("per-language validation", () => {
  test("a bad value in a Python-only block does not break the TS loader", async () => {
    // libs/py/config rejects this file, in both its loader and the whole-file check.
    const bad = await fixtureWith("max-iterations 7", 'max-iterations "many"');
    const cfg = loadConfig(bad);
    expect(cfg.orator.port).toBe(20002);
    expect("heartwood" in cfg).toBe(false);
  });

  test("a bad value in a TS block fails the TS loader", async () => {
    // libs/py/config's loader loads this file; its whole-file check rejects it.
    const bad = await fixtureWith("port 20002", 'port "not-a-port"');
    expect(() => loadConfig(bad)).toThrow(/orator > port/);
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
  });

  test("a missing field or namespace fails the load: values live only in config.kdl", async () => {
    const noField = await fixtureWith('    bind-addr "127.0.0.1:10203"\n', "");
    expect(() => loadConfig(noField)).toThrow(/weal > bind-addr: missing \(required\)/);
    const noBlock = await writeTmp('data {\n  root "/srv/state"\n}\n');
    expect(() => loadConfig(noBlock)).toThrow(/missing \(required\)/);
  });

  test("an integer field rejects a fraction (py `int`)", async () => {
    const bad = await fixtureWith("port 20002", "port 20002.5");
    expect(() => loadConfig(bad)).toThrow(/orator > port/);
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
    const bad = await fixtureWith("port 20002", 'port 20002\n    bogus-field "nope"');
    expect(() => loadConfig(bad)).toThrow(/orator > bogus-field "nope": unknown node/);
  });

  test("data paths: relative → under root, absolute as-is, empty stays unset", () => {
    const cfg = loadConfig(FIXTURE);
    expect(cfg.data.root).toBe("/srv/state");
    expect(cfg.data.contentRoot).toBe("/srv/state/astra-data"); // relative, so under root
    expect(cfg.codex.dataPath).toBe("/srv/state/codex/data");
    expect(cfg.menhir.resultsPath).toBe("/srv/state/menhir/results.jsonl");
    expect(cfg.data.akashaContent).toBe("/elsewhere/content");
    expect(cfg.orator.dataDir).toBe("/data"); // a container path, not a data path
    // A relative dataset resolves under the content root (`astra-data` under root).
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

describe("findPackageRoot", () => {
  test("finds the nearest package.json at or above the start dir", () => {
    const pkg = join(ROOT, "libs", "ts", "config");
    expect(findPackageRoot(pkg)).toBe(pkg);
    expect(findPackageRoot(join(pkg, "src", "no", "such", "dir"))).toBe(pkg);
    expect(findPackageRoot(join(ROOT, "ontology", "ontology-config"))).toBe(ROOT);
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
