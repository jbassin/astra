import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 0022 S11 — off bun (a FIFTH bare `bun` call site missed by the naive grep: this
// guarded fast-path never fires once src/generated/* exists, so it stayed masked
// until a truly fresh checkout/CI run hit it).
const NODE_TS_RESOLVE_HOOK = path.resolve(HERE, "../../libs/ts/site-kit/src/nodeTsResolve.mjs");

// Ensure the generated content modules exist before any test imports them
// (@/generated/*); build-content emits them.
export default function setup(): void {
  const site = path.resolve(HERE, "src/generated/site.ts");
  const bodies = path.resolve(HERE, "src/generated/bodies.ts");
  if (!existsSync(site) || !existsSync(bodies)) {
    execSync(`node --import ${NODE_TS_RESOLVE_HOOK} scripts/build-content.ts`, {
      cwd: HERE,
      stdio: "inherit",
    });
  }
}
