import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Ensure the generated content modules exist before any test imports them. The
// data-model tests pull in @/generated/{factions,layers}; build-content emits them.
export default function setup(): void {
  const generated = path.resolve(HERE, "src/generated/factions.ts");
  if (!existsSync(generated)) {
    execSync("bun run scripts/build-content.ts", {
      cwd: HERE,
      stdio: "inherit",
    });
  }
}
