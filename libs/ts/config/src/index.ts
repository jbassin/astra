/**
 * @astra/config — KDL config loader + lazy SOPS secret resolution (TS twin of
 * astra-config). TS apps (bots, frontends, controllers) read config via:
 *
 *   import { loadConfig } from "@astra/config";
 *   const cfg = loadConfig();
 *   cfg.weal.bindAddr;                  // plaintext
 *   cfg.orator.sessionSecret?.require(); // SOPS-decrypted on demand; throws if unset
 */
export { type Config, ConfigSchema, defaultConfigFile, loadConfig } from "./config";
export {
  decodeKdl,
  type KdlSchema,
  type KdlValue,
  KdlDecodeError,
  kdl,
  kdlQuote,
  type KNode,
  loadKdl,
  parseKdl,
} from "./kdl";
export { findRepoRoot } from "./root";
export {
  defaultSecretsFile,
  isBlankSecret,
  resolveSopsRef,
  SecretRef,
  SecretUnsetError,
} from "./secrets";
