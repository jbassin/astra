import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { findRepoRoot } from "@astra/config";
import type { Plugin, PluginOption } from "vite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { siteHead } from "./document";
import { hasGeneratedContent } from "./generatedContentSetup";
import { siteRouterOptions } from "./router";
import { bundleIsStale } from "./ssrSmoke";
import { appConfigBlock, defineSiteConfig } from "./vitePreset";
import { defineSiteVitestConfig } from "./vitestPreset";

const STRIDER = path.join(findRepoRoot(), "apps", "strider", "web");

function pluginNames(plugins: PluginOption[] | undefined): string[] {
  return (plugins ?? [])
    .flat(Infinity as 1)
    .filter((p): p is Plugin => typeof p === "object" && p !== null && "name" in p)
    .map((p) => p.name);
}

describe("defineSiteConfig", () => {
  test("reads the dev port from the config.kdl block the app's package.json names", () => {
    const block = appConfigBlock(STRIDER);
    expect(block.serviceName).toBe("astra.strider");
    const cfg = defineSiteConfig({ root: STRIDER, generated: ["factions.ts"] });
    expect(cfg.server).toEqual({ port: block.port, host: true });
    expect(cfg.resolve?.alias).toEqual({ "@": path.join(STRIDER, "src") });
  });

  test("orders the plugins: content and fonts first, TanStack Start before plugin-react", () => {
    const names = pluginNames(defineSiteConfig({ root: STRIDER, generated: [] }).plugins);
    const at = (prefix: string) => names.findIndex((n) => n.startsWith(prefix));
    expect(at("site-kit:content-watch")).toBe(0);
    expect(at("site-kit:gothic-fonts")).toBe(1);
    expect(at("site-kit:ssr-externals")).toBeGreaterThan(at("@tailwindcss/vite"));
    expect(at("tanstack")).toBeGreaterThan(at("site-kit:ssr-externals"));
    expect(at("vite:react")).toBeGreaterThan(at("tanstack"));
  });

  test("merges app-specific settings over the preset", () => {
    const cfg = defineSiteConfig({
      root: STRIDER,
      generated: [],
      vite: { server: { proxy: { "/api": "http://localhost:1" } } },
    });
    expect(cfg.server?.host).toBe(true);
    expect(cfg.server?.proxy).toEqual({ "/api": "http://localhost:1" });
  });

  test("names the missing package.json field", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "site-kit-preset-"));
    try {
      writeFileSync(path.join(dir, "package.json"), "{}");
      expect(() => appConfigBlock(dir)).toThrow(/"astra": \{ "config"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("defineSiteVitestConfig", () => {
  test("jsdom, globals, the alias and the generated-content setup", () => {
    const cfg = defineSiteVitestConfig({ root: STRIDER });
    expect(cfg.test?.environment).toBe("jsdom");
    expect(cfg.test?.globals).toBe(true);
    expect(cfg.test?.globalSetup).toEqual([
      path.join(import.meta.dirname, "generatedContentSetup.ts"),
    ]);
    expect(cfg.resolve?.alias).toEqual({ "@": path.join(STRIDER, "src") });
  });
});

describe("generated content and bundle staleness", () => {
  let app: string;
  beforeEach(() => {
    app = mkdtempSync(path.join(tmpdir(), "site-kit-app-"));
  });
  afterEach(() => rmSync(app, { recursive: true, force: true }));

  test("hasGeneratedContent wants at least one module, not just the .gitignore", () => {
    expect(hasGeneratedContent(app)).toBe(false);
    mkdirSync(path.join(app, "src", "generated"), { recursive: true });
    writeFileSync(path.join(app, "src", "generated", ".gitignore"), "*\n");
    expect(hasGeneratedContent(app)).toBe(false);
    writeFileSync(path.join(app, "src", "generated", "site.ts"), "export {};\n");
    expect(hasGeneratedContent(app)).toBe(true);
  });

  test("bundleIsStale: missing, then fresh, then stale after a source edit", () => {
    expect(bundleIsStale(app)).toBe(true);
    mkdirSync(path.join(app, "src"));
    mkdirSync(path.join(app, "dist", "server"), { recursive: true });
    const source = path.join(app, "src", "a.ts");
    const testFile = path.join(app, "src", "a.test.ts");
    const bundle = path.join(app, "dist", "server", "server.js");
    writeFileSync(source, "");
    writeFileSync(testFile, "");
    writeFileSync(bundle, "");
    // A far-future bundle is newer than anything in libs/ts, so only the app's files decide.
    const future = new Date(Date.now() + 365 * 24 * 3600 * 1000);
    utimesSync(bundle, future, future);
    expect(bundleIsStale(app)).toBe(false);
    const later = new Date(future.getTime() + 1000);
    utimesSync(testFile, later, later);
    expect(bundleIsStale(app)).toBe(false);
    utimesSync(source, later, later);
    expect(bundleIsStale(app)).toBe(true);
  });
});

describe("root document and router options", () => {
  test("siteHead", () => {
    expect(siteHead({ title: "T", description: "D" })).toEqual({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "T" },
        { name: "description", content: "D" },
      ],
      links: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    });
  });

  test("siteRouterOptions takes 404 text or the app's own component", () => {
    const own = () => null;
    expect(siteRouterOptions({ notFound: own }).defaultNotFoundComponent).toBe(own);
    const opts = siteRouterOptions({
      notFound: { heading: "404", message: "Gone.", homeLabel: "Home" },
    });
    expect(opts.defaultPreload).toBe("intent");
    expect(opts.scrollRestoration).toBe(true);
    expect(typeof opts.defaultNotFoundComponent).toBe("function");
  });
});
