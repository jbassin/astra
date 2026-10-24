import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { bareImports, notOneOf, packageName, undeclaredSsrImports } from "./ssrExternals";

describe("ssrExternals", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  test("notOneOf matches only packages outside the list, subpaths included", () => {
    const re = notOneOf(["react", "pixi.js", "@tanstack/react-router"]);
    expect(re.test("react")).toBe(false);
    expect(re.test("react/jsx-runtime")).toBe(false);
    expect(re.test("@tanstack/react-router/ssr/server")).toBe(false);
    expect(re.test("pixi.js")).toBe(false);
    expect(re.test("pixixjs")).toBe(true);
    expect(re.test("react-dom")).toBe(true);
    expect(re.test("yaml")).toBe(true);
  });

  test("packageName strips subpaths, keeping the scope", () => {
    expect(packageName("react-dom/server")).toBe("react-dom");
    expect(packageName("@scope/pkg/sub")).toBe("@scope/pkg");
  });

  test("bareImports finds rollup's import forms and skips relative ids and comments", () => {
    const src = [
      'import { a } from "yaml";',
      'import "side-effect";',
      'export { b } from "re-export";',
      'import {\n  c,\n  d\n} from "multi-line";',
      'const e = await import("lazy");',
      'import f from "./local.js";',
      'import g from "node:fs";',
      "* @typedef {import('unified').Processor} Processor",
      'const h = __require("cjs-dep");',
      "const i = require('cjs-other/sub');",
      "debug(\"processing module require('%s')\", id);",
      'const j = this.require("not-a-require");',
    ].join("\n");
    expect(bareImports(src).toSorted()).toEqual([
      "cjs-dep",
      "cjs-other/sub",
      "lazy",
      "multi-line",
      "re-export",
      "side-effect",
      "yaml",
    ]);
  });

  test("undeclaredSsrImports flags imports the app doesn't depend on", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ssr-externals-"));
    dirs.push(root);
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        dependencies: { react: "1", "@astra/config": "workspace:*" },
        devDependencies: { yaml: "1" },
      }),
    );
    mkdirSync(path.join(root, "dist", "server", "assets"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "server", "server.js"),
      'import { jsx } from "react/jsx-runtime";\nimport { readFileSync } from "fs";\n',
    );
    writeFileSync(
      path.join(root, "dist", "server", "assets", "chunk.js"),
      'import { parse } from "yaml";\nimport { x } from "@astra/config";\n',
    );
    // The tsdown server bundle; supports-color is an optional probe inside a try/catch.
    mkdirSync(path.join(root, "dist-server"));
    writeFileSync(
      path.join(root, "dist-server", "main.mjs"),
      'import { jsx } from "react/jsx-runtime";\nconst c = __require("supports-color");\n' +
        'const d = __require("ms");\nconst e = require("@astra/config/gen/data.json");\n',
    );
    expect(undeclaredSsrImports(root)).toEqual([
      `${path.join("dist-server", "main.mjs")}: ms`,
      `${path.join("dist", "server", "assets", "chunk.js")}: @astra/config`,
      `${path.join("dist", "server", "assets", "chunk.js")}: yaml`,
    ]);
  });
});
