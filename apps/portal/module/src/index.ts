// @astra/portal-module — the Foundry ESM package that dials out to portal-server
// (spec 0023 D1). `main.ts` (bundled by tsdown into `dist/main.js`, S3) is the actual
// Foundry entrypoint — this barrel just re-exports the identity constants for tests.
export { COMPATIBILITY_MINIMUM, MODULE_ID, MODULE_TITLE } from "./constants";
