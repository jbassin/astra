// codex-ingest: the one entry point for the codex ingest pipeline
// (`pnpm --filter @astra/codex-ingest cli <command> [...]`; the `just codex-*` recipes call
// it). Each command loads only its own modules.
//
//   fetch-foundry                       sparse-clone the pinned pf2e tag into snapshots/
//   fetch-aon                           snapshot the AoN index into snapshots/ (~259 MB)
//   transform --out <dir> [--pass <n>]  snapshots + homebrew store -> a corpus tree
//   transform --list-passes             print the transform's pass registry
//   search-index --corpus <dir> --out <dir>   a Pagefind index over a corpus tree
//   release build|rollback|list|migrate [...]  publish and manage releases (release.ts)
//   fixture                             bring the generated fixture corpus up to date
//   extract-fixture                     host-only: re-pick fixtures/raw and fixtures/picks

const USAGE =
  "usage: codex-ingest <fetch-foundry | fetch-aon | transform | search-index | release | " +
  "fixture | extract-fixture> [args]";

async function run(command: string | undefined, args: string[]): Promise<void> {
  switch (command) {
    case "fetch-foundry":
      return (await import("./fetch-foundry")).fetchFoundryMain();
    case "fetch-aon":
      return (await import("./fetch-aon")).fetchAonMain();
    case "transform":
      return (await import("./transform")).transformMain(args);
    case "search-index":
      return (await import("./build-search")).buildSearchMain(args);
    case "release":
      return (await import("./release")).releaseMain(args);
    case "fixture": {
      const { ensureFixtureCorpus } = await import("./fixtureCorpus");
      console.log(`fixture: ${ensureFixtureCorpus()} is up to date`);
      return;
    }
    case "extract-fixture":
      return (await import("./extract-fixture")).extractFixtureMain();
    default:
      throw new Error(`unknown command ${JSON.stringify(command)}\n${USAGE}`);
  }
}

const [command, ...args] = process.argv.slice(2);
await run(command, args).catch((e: unknown) => {
  console.error(
    `codex-ingest ${command ?? ""} failed: ${e instanceof Error ? e.message : String(e)}`,
  );
  process.exit(1);
});
