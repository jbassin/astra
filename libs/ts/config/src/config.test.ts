import { describe, expect, test } from "bun:test";
import { loadConfig, resolveSopsRef, SecretRef } from "./index";

// Runs against the real in-repo config.kdl + SOPS file (age key on host), mirroring
// libs/py/config's tests so both languages prove the same contract.
describe("@astra/config", () => {
  test("real config.kdl loads with correct types", () => {
    const cfg = loadConfig();
    expect(cfg.llm.defaultModel).toBe("claude-opus-4-8");
    expect(cfg.llm.defaultMaxTokens).toBe(16000); // number, not string
    expect(cfg.linguist.reviewPort).toBe(10116);
    expect(cfg.orator.targetLufs).toBe(-16); // negative number
    expect(cfg.orator.measureLoudness).toBe(true); // boolean
    expect(cfg.weal.bindAddr).toBe("127.0.0.1:10203");
  });

  test("secret fields are lazy refs, not plaintext", () => {
    const cfg = loadConfig();
    expect(cfg.llm.anthropicApiKey).toBeInstanceOf(SecretRef);
    expect(cfg.llm.anthropicApiKey?.ref).toBe("sops:anthropic_api_key");
    expect(JSON.stringify(cfg.llm.anthropicApiKey)).toContain("SecretRef"); // never leaks the value
  });

  test("present secret resolves via sops", () => {
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

  test("absent secret raises only on resolve (lazy)", () => {
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
