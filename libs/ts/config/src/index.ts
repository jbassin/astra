/**
 * @astra/config — KDL config loader + lazy SOPS secret resolution (TS twin of
 * astra-config). TS apps (bots, frontends, controllers) read config via:
 *
 *   import { loadConfig } from "@astra/config";
 *   const cfg = loadConfig();
 *   cfg.weal.bindAddr;                  // plaintext
 *   cfg.orator.sessionSecret?.resolve(); // SOPS-decrypted on demand
 */
export { type Config, ConfigSchema, defaultConfigFile, loadConfig } from "./config";
export { defaultSecretsFile, resolveSopsRef, SecretRef } from "./secrets";
