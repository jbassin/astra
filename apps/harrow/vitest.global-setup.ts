import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Ensure the generated content module exists before any test imports it
// (@/generated/site); build-content emits it.
export default function setup(): void {
  const site = path.resolve(HERE, "src/generated/site.ts");
  if (!existsSync(site)) {
    execSync("bun run scripts/build-content.ts", {
      cwd: HERE,
      stdio: "inherit",
    });
  }
}
