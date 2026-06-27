import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadConfig, resolveSopsRef, SecretRef } from "./index";

// Actually decrypting needs the `sops` binary + the gitignored age key — host only.
// CI has neither, so the decrypt-backed check skips there (the env-override test still
// exercises resolution everywhere), mirroring libs/py/config's `sops_required`.
function sopsAvailable(): boolean {
  let dir = resolve(import.meta.dir);
  for (;;) {
    if (existsSync(join(dir, "deploy", "sops"))) break;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
  if (!existsSync(join(dir, "deploy", "sops", "age.key"))) return false;
  try {
    execFileSync("sops", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const SOPS = sopsAvailable();

// Runs against the real in-repo config.kdl + SOPS file (age key on host), mirroring
// libs/py/config's tests so both languages prove the same contract.
describe("@astra/config", () => {
  test("real config.kdl loads with correct types", () => {
    const cfg = loadConfig();
    expect(cfg.llm.defaultModel).toBe("openrouter/z-ai/glm-5.2");
    expect(cfg.llm.defaultMaxTokens).toBe(16000); // number, not string
    expect(cfg.linguist.reviewPort).toBe(10116);
    expect(cfg.telemetry.otlpEndpoint).toBe("http://signoz-otel-collector:4318");
    expect(cfg.orator.targetLufs).toBe(-16); // negative number
    expect(cfg.orator.measureLoudness).toBe(true); // boolean
    expect(cfg.weal.bindAddr).toBe("127.0.0.1:10203");
    expect(cfg.akashaFrontend.serviceName).toBe("astra.akasha-frontend");
    expect(cfg.akashaFrontend.port).toBe(10365);
    expect(cfg.akashaFrontend.publicOrigin).toBe("https://akasha.iridi.cc");
    expect(cfg.akashaFrontend.audioDir).toBe("/audio");
    expect(cfg.mouthpieceFrontend.serviceName).toBe("astra.mouthpiece-frontend");
    expect(cfg.mouthpieceFrontend.port).toBe(10366);
    expect(cfg.mouthpieceFrontend.publicOrigin).toBe("https://mouthpiece.iridi.cc");
    expect(cfg.mouthpieceFrontend.audioDir).toBe("/audio");
    expect(cfg.vellumFrontend.serviceName).toBe("astra.vellum-frontend");
    expect(cfg.vellumFrontend.port).toBe(10367);
    expect(cfg.vellumFrontend.publicOrigin).toBe("https://vellum.iridi.cc");
    expect(cfg.vellumRender.serviceName).toBe("astra.vellum-render");
    expect(cfg.vellumRender.port).toBe(10368);
    expect(cfg.strider.publicOrigin).toBe("https://strider.iridi.cc");
    expect(cfg.ledger.serviceName).toBe("astra.ledger");
    expect(cfg.ledger.port).toBe(10370);
    expect(cfg.ledger.publicOrigin).toBe("https://ledger.iridi.cc");
  });

  test("secret fields are lazy refs, not plaintext", () => {
    const cfg = loadConfig();
    expect(cfg.llm.anthropicApiKey).toBeInstanceOf(SecretRef);
    expect(cfg.llm.anthropicApiKey?.ref).toBe("sops:anthropic_api_key");
    expect(JSON.stringify(cfg.llm.anthropicApiKey)).toContain("SecretRef"); // never leaks the value
    expect(cfg.llm.openrouterApiKey).toBeInstanceOf(SecretRef);
    expect(cfg.llm.openrouterApiKey?.ref).toBe("sops:openrouter_api_key");
  });

  test.skipIf(!SOPS)("present secret resolves via sops", () => {
    const cfg = loadConfig();
    const value = cfg.llm.anthropicApiKey?.resolve();
    expect(value?.startsWith("sk-ant-")).toBe(true);
  });

  test("env override wins over sops", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-override";
    try {
      expect(resolveSopsRef("sops:anthropic_api_key")).toBe("sk-ant-env-override");
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  test.skipIf(!SOPS)("absent secret raises only on resolve (lazy)", () => {
    const cfg = loadConfig();
    expect(cfg.weal.diceFeedUrl).toBeInstanceOf(SecretRef);
    expect(() => cfg.weal.diceFeedUrl?.resolve()).toThrow();
  });

  test("unknown KDL key is rejected", async () => {
    const tmp = `${process.env.TMPDIR ?? "/tmp"}/astra-config-bad-${Date.now()}.kdl`;
    await Bun.write(tmp, 'llm {\n  default-model "x"\n  bogus-field "nope"\n}\n');
    expect(() => loadConfig(tmp)).toThrow();
  });
});
