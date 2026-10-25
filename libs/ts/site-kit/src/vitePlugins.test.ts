import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ViteDevServer } from "vite";
import { describe, expect, test } from "vitest";

import { contentWatchPlugin, isContentInput } from "./vitePlugins";

describe("isContentInput", () => {
  const generated = "/app/src/generated";
  const inputs = ["/app/content", "/app/scripts", "/repo/config.kdl", "/data/akasha"];

  test("any file under an input dir counts, whatever its extension", () => {
    expect(isContentInput("/app/content/cards/divine/the-sun.card", inputs, generated)).toBe(true);
    expect(isContentInput("/app/content/spreads/cross.spread", inputs, generated)).toBe(true);
    expect(isContentInput("/app/scripts/build-content.ts", inputs, generated)).toBe(true);
    expect(isContentInput("/data/akasha/snapshot/akasha-snapshot.json", inputs, generated)).toBe(
      true,
    );
  });

  test("a file input counts only for itself", () => {
    expect(isContentInput("/repo/config.kdl", inputs, generated)).toBe(true);
    expect(isContentInput("/repo/config.kdl.bak", inputs, generated)).toBe(false);
  });

  test("a sibling with a shared prefix is not under the input dir", () => {
    expect(isContentInput("/app/content-old/x.md", inputs, generated)).toBe(false);
  });

  test("the generated output, dotfiles and source files never count", () => {
    const withGenerated = [...inputs, "/app/src"];
    expect(isContentInput("/app/src/generated/site.ts", withGenerated, generated)).toBe(false);
    expect(isContentInput("/app/content/.the-sun.card.swp", inputs, generated)).toBe(false);
    expect(isContentInput("/app/src/routes/index.tsx", inputs, generated)).toBe(false);
  });
});

/** The parts of a ViteDevServer the plugin touches. */
function fakeServer() {
  const added: string[] = [];
  const sent: unknown[] = [];
  const watcher = Object.assign(new EventEmitter(), {
    add: (paths: string[]) => {
      added.push(...paths);
    },
  });
  const server = {
    watcher,
    moduleGraph: { getModuleById: () => undefined, invalidateModule: () => {} },
    ws: { send: (msg: unknown) => sent.push(msg) },
  };
  return { server: server as unknown as ViteDevServer, watcher, added, sent };
}

describe("contentWatchPlugin in dev", () => {
  test("watches every input and regenerates once per burst of input edits", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "site-kit-watch-"));
    const contentDir = path.join(root, "content");
    const dataDir = path.join(root, "data");
    mkdirSync(contentDir);
    mkdirSync(dataDir);
    const runs = path.join(root, "runs.txt");
    writeFileSync(runs, "");
    const script = path.join(root, "build-content.ts");
    writeFileSync(
      script,
      `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(runs)}, "run\\n");\n`,
    );

    let resolved = 0;
    const plugin = contentWatchPlugin({
      root,
      script,
      inputs: () => {
        resolved += 1;
        return [contentDir, dataDir];
      },
      generatedDir: path.join(root, "src", "generated"),
      invalidate: ["site.ts"],
    });
    expect(resolved).toBe(0);

    const { server, watcher, added, sent } = fakeServer();
    (plugin.configureServer as (s: ViteDevServer) => void)(server);
    expect(resolved).toBe(1);
    expect(added).toEqual([contentDir, dataDir]);

    // A non-input edit does nothing; a burst of input edits (any extension) runs the script once.
    watcher.emit("change", path.join(root, "src", "routes", "index.tsx"));
    watcher.emit("change", path.join(contentDir, "cards", "the-sun.card"));
    watcher.emit("add", path.join(dataDir, "snapshot.json"));
    watcher.emit("unlink", path.join(contentDir, "old.vellum"));
    await new Promise((r) => setTimeout(r, 2000));

    expect(readFileSync(runs, "utf8")).toBe("run\n");
    expect(sent).toEqual([{ type: "full-reload" }]);
  });
});
