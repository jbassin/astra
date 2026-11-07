// `just builder-invite <name>`: adds a player to `<builder.data-dir>/roster.json` with a new
// random id and prints their private link. The running server reads the roster on every
// request, so the link works at once. Run from the app dir (the recipe does), so tsx resolves
// the `@/` alias.

import { loadConfig } from "@astra/config";

import { playerLink } from "@/server/builder";
import { builderStore } from "@/server/store";

const name = process.argv.slice(2).join(" ").trim();
if (!name) {
  process.stderr.write("usage: just builder-invite <name>\n");
  process.exit(2);
}

const cfg = loadConfig().builder;
const entry = builderStore(cfg.dataDir).addPlayer(name);
process.stderr.write(`Invited ${entry.name}. Their link:\n`);
process.stdout.write(`${playerLink(cfg.publicOrigin, entry.id)}\n`);
