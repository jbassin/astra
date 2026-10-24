/**
 * The codex server the e2e suite drives: the built `dist/` bundle, served on an ephemeral
 * loopback port, reading the generated fixture corpus. `playwright.config.ts` starts it as its
 * `webServer` and reads the port back from the line this prints.
 *
 * Needs a prior `pnpm run build`. Runs under tsx, like the other scripts here.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ensureFixtureCorpus } from "@astra/codex-ingest/fixture";
import { createSsrServer } from "@astra/site-kit";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SERVER_BUNDLE = `${ROOT}dist/server/server.js`;
const CLIENT_DIR = `${ROOT}dist/client`;
// Port 0 by default: the OS picks a free port, so concurrent runs on one host never collide.
// `CODEX_E2E_SERVER_PORT` pins one for debugging.
const PORT = Number(process.env.CODEX_E2E_SERVER_PORT ?? 0);

if (!existsSync(SERVER_BUNDLE)) {
  throw new Error(`${SERVER_BUNDLE} not found — run \`pnpm run build\` first`);
}
// Generate the fixture corpus and read it unless the caller pins another root. The built
// bundle checks this root when it loads, below.
process.env.CODEX_CORPUS_ROOT ??= ensureFixtureCorpus();

const ssr = (await import(SERVER_BUNDLE)) as {
  default: { fetch: (req: Request) => Promise<Response> };
};
const server = createSsrServer({
  serviceName: "codex-e2e",
  port: PORT,
  hostname: "127.0.0.1",
  ssr: ssr.default,
  clientDir: CLIENT_DIR,
});
await server.ready();
const { port } = new URL(server.url ?? "");
// playwright.config.ts's `webServer.wait` matches this line.
process.stdout.write(`codex e2e server listening on port ${port}\n`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void server.close(true).finally(() => process.exit(0));
  });
}
