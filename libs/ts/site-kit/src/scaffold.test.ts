import { execFile } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { findRepoRoot, parseKdl } from "@astra/config";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  addCaddyStanza,
  addComposeService,
  addConfigBlock,
  addPydanticModel,
  frontendNames,
  nextFreePort,
  SHARED_FILES,
  writeFrontendApp,
} from "./scaffold";
import type { SmokeResult } from "./ssrSmokeRunner";
import { tsxLoader } from "./tsxLoader";

const execFileAsync = promisify(execFile);
const REPO = findRepoRoot();
const SITE_KIT = path.join(REPO, "libs", "ts", "site-kit");
const real = (key: keyof typeof SHARED_FILES) =>
  readFileSync(path.join(REPO, SHARED_FILES[key]), "utf8");
const names = frontendNames("demo-site");

describe("frontendNames", () => {
  test("spells the name for each place it goes", () => {
    expect(names).toEqual({
      name: "demo-site",
      camel: "demoSite",
      snake: "demo_site",
      pascal: "DemoSite",
      title: "Demo Site",
    });
  });

  test("refuses a name that isn't kebab-case", () => {
    expect(() => frontendNames("Demo")).toThrow(/kebab-case/);
    expect(() => frontendNames("demo-")).toThrow(/kebab-case/);
  });
});

describe("the shared-file stubs, applied to the real files", () => {
  const port = nextFreePort(real("config"), real("compose"));

  test("the next free port is above every port config.kdl and compose name", () => {
    expect(port).toBeGreaterThan(10375);
    expect(port).toBeLessThanOrEqual(10399);
    expect(real("config")).not.toMatch(new RegExp(`\\b${port}\\b`));
  });

  test("config.kdl gains a block that parses; an existing block is refused", () => {
    for (const key of ["config", "fixtureConfig"] as const) {
      const block = parseKdl(addConfigBlock(real(key), names, port)).children.find(
        (n) => n.name === "demo-site",
      );
      expect(block?.children.map((n) => [n.name, n.args[0]])).toEqual([
        ["service-name", "astra.demo-site"],
        ["port", port],
      ]);
    }
    expect(() => addConfigBlock(real("config"), frontendNames("ledger"), port)).toThrow(
      /already has a ledger block/,
    );
  });

  test("models.py gains the class, the WholeConfig field, the TS namespace and the owner", () => {
    const py = addPydanticModel(real("models"), names);
    expect(py).toContain("class DemoSiteConfig(_Base):\n");
    expect(py.indexOf("class DemoSiteConfig(")).toBeLessThan(py.indexOf("class WholeConfig("));
    expect(py).toContain("    menhir: MenhirConfig\n    demo_site: DemoSiteConfig\n\n\n");
    expect(py).toMatch(/TS_NAMESPACES[^)]*"menhir",\n {4}"demo_site",\n\)/);
    expect(py).toMatch(/`portal-headless`, `menhir`\s+and `demo-site`\./);
    for (const line of py.split("\n")) expect(line.length).toBeLessThanOrEqual(100);
    expect(() => addPydanticModel(py, names)).toThrow(/already has DemoSiteConfig/);
  });

  test("compose gains the service before networks:, Caddy the host", () => {
    const yml = addComposeService(real("compose"), names, port);
    const service = yml.indexOf("\n  demo-site:\n");
    expect(service).toBeGreaterThan(0);
    expect(service).toBeLessThan(yml.indexOf("\nnetworks:\n"));
    expect(yml).toContain(`      - "${port}:${port}"`);
    expect(yml).toContain("        APP: demo-site/web");
    const caddy = addCaddyStanza(real("caddy"), names, port);
    expect(caddy).toContain(
      `demo-site.iridi.cc {\n\timport astra_site\n\treverse_proxy localhost:${port}\n}\n`,
    );
    expect(() => addCaddyStanza(caddy, names, port)).toThrow(/already has/);
  });
});

/**
 * Links `node_modules` for an app outside the workspace: site-kit's own packages (which hold
 * everything the template needs to build and render) plus `@astra/site-kit` itself.
 */
function linkNodeModules(appDir: string): void {
  const from = path.join(SITE_KIT, "node_modules");
  const to = path.join(appDir, "node_modules");
  mkdirSync(path.join(to, "@astra"), { recursive: true });
  for (const entry of readdirSync(from)) {
    if (entry === "@astra") continue;
    symlinkSync(path.join(from, entry), path.join(to, entry));
  }
  for (const entry of readdirSync(path.join(from, "@astra"))) {
    symlinkSync(path.join(from, "@astra", entry), path.join(to, "@astra", entry));
  }
  symlinkSync(SITE_KIT, path.join(to, "@astra", "site-kit"));
}

describe("a scaffolded app builds and renders", () => {
  let scratch: string;
  let appDir: string;
  let results: Map<string, SmokeResult>;

  // A scratch checkout holding only what the build reads: config.kdl with the app's block, the
  // base tsconfig the app's extends, and the app itself.
  beforeAll(async () => {
    scratch = mkdtempSync(path.join(tmpdir(), "site-kit-scaffold-"));
    const configDir = path.join(scratch, "ontology", "ontology-config");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, "config.kdl"), addConfigBlock(real("config"), names, 10399));
    copyFileSync(path.join(REPO, "tsconfig.base.json"), path.join(scratch, "tsconfig.base.json"));
    appDir = path.join(scratch, "apps", "demo-site", "web");
    await writeFrontendApp(appDir, names, 10399);
    linkNodeModules(appDir);
    await execFileAsync(
      "node",
      [
        path.join(appDir, "node_modules", "vite", "bin", "vite.js"),
        "build",
        "--configLoader",
        "runner",
      ],
      { cwd: appDir, maxBuffer: 64 * 1024 * 1024 },
    );
    const { stdout } = await execFileAsync(
      "node",
      [
        "--import",
        tsxLoader(),
        path.join(import.meta.dirname, "ssrSmokeRunner.ts"),
        path.join(appDir, "dist", "server", "server.js"),
        JSON.stringify(["/", "/__no-such-page"]),
      ],
      { cwd: appDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    results = new Map((JSON.parse(stdout) as SmokeResult[]).map((r) => [r.path, r]));
  }, 300_000);

  afterAll(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  test("the template's files, with every token replaced", () => {
    const pkg = JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8")) as {
      name: string;
      astra: { config: string };
    };
    expect(pkg.name).toBe("@astra/demo-site");
    expect(pkg.astra.config).toBe("demo-site");
    expect(readFileSync(path.join(appDir, "server.ts"), "utf8")).toContain("loadConfig().demoSite");
    expect(readFileSync(path.join(appDir, "src", "routeTree.gen.ts"), "utf8")).toContain(
      "IndexRoute",
    );
    for (const rel of ["server.ts", "src/routes/__root.tsx", "README.md", "package.json"]) {
      expect(readFileSync(path.join(appDir, rel), "utf8")).not.toMatch(/__[a-z]+__/);
    }
  });

  test("renders / with the gothic document and a 404 for an unknown path", () => {
    const home = results.get("/");
    expect(home?.status).toBe(200);
    expect(home?.html).toContain("<title>Demo Site</title>");
    const missing = results.get("/__no-such-page");
    expect(missing?.status).toBe(404);
    expect(missing?.html).toContain("That page doesn’t exist.");
  });
});
