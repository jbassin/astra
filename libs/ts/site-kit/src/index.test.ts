import { existsSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  contentWatchPlugin,
  createSsrServer,
  generateRouteTree,
  gothicFontsPlugin,
  loadSiteConfig,
  siteConfigFile,
  staticMountPath,
} from "./index";

describe("@astra/site-kit config locator", () => {
  test("siteConfigFile resolves the repo's config.kdl (node-safe, no import.meta.dir)", () => {
    const file = siteConfigFile();
    expect(file.endsWith("ontology/ontology-config/config.kdl")).toBe(true);
    expect(existsSync(file)).toBe(true);
  });

  test("loadSiteConfig reads the same config a runtime read would", () => {
    const cfg = loadSiteConfig();
    // strider is the template app; its namespace must round-trip for vite's dev-port read.
    expect(typeof cfg.strider.port).toBe("number");
    expect(cfg.strider.serviceName.length).toBeGreaterThan(0);
  });
});

describe("@astra/site-kit vite plugins", () => {
  test("contentWatchPlugin is named and exposes the build hooks", () => {
    const p = contentWatchPlugin({
      root: "/tmp/app",
      script: "/tmp/app/scripts/build-content.ts",
      contentDir: "/tmp/app/content",
      generatedDir: "/tmp/app/src/generated",
      invalidate: ["x.ts"],
    });
    expect(p.name).toBe("site-kit:content-watch");
    expect(typeof p.buildStart).toBe("function");
    expect(typeof p.configureServer).toBe("function");
  });

  test("gothicFontsPlugin serves in dev and copies at build", () => {
    const p = gothicFontsPlugin({ clientOutDir: "/tmp/app/dist/client" });
    expect(p.name).toBe("site-kit:gothic-fonts");
    expect(typeof p.configureServer).toBe("function");
    expect(typeof p.closeBundle).toBe("function");
  });
});

describe("@astra/site-kit exports", () => {
  test("createSsrServer + generateRouteTree are callable factories", () => {
    expect(typeof createSsrServer).toBe("function");
    expect(typeof generateRouteTree).toBe("function");
  });
});

describe("staticMountPath (audio mount path resolution)", () => {
  const mount = { urlPrefix: "/audio/", dir: "/audio" };

  test("resolves a matching path under the dir", () => {
    expect(staticMountPath(mount, "/audio/000.x.2026-5-7.mp3")).toBe("/audio/000.x.2026-5-7.mp3");
  });

  test("returns null when the prefix does not match", () => {
    expect(staticMountPath(mount, "/episode/000.x")).toBeNull();
    expect(staticMountPath(mount, "/")).toBeNull();
  });

  test("guards path traversal + empty + absolute escape", () => {
    expect(staticMountPath(mount, "/audio/../../etc/passwd")).toBeNull();
    expect(staticMountPath(mount, "/audio/")).toBeNull();
    expect(staticMountPath(mount, "/audio//etc")).toBeNull();
  });
});
