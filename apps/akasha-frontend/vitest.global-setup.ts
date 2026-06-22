import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Ensure the generated content modules exist before any test imports them
// (@/generated/*); build-content emits them.
export default function setup(): void {
  const site = path.resolve(HERE, "src/generated/site.ts");
  const bodies = path.resolve(HERE, "src/generated/bodies.ts");
  if (!existsSync(site) || !existsSync(bodies)) {
    execSync("bun run scripts/build-content.ts", {
      cwd: HERE,
      stdio: "inherit",
    });
  }
}
