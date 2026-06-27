import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Ensure the generated modules exist before any test imports them (@/generated/site,
// @/generated/sites); build-content emits them from config + the registry.
export default function setup(): void {
  const sites = path.resolve(HERE, "src/generated/sites.ts");
  if (!existsSync(sites)) {
    execSync("bun run scripts/build-content.ts", {
      cwd: HERE,
      stdio: "inherit",
    });
  }
}
