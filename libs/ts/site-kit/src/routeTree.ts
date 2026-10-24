// Standalone route-tree generation for the TanStack Start frontends, run by
// `just routes-gen` (scripts/route-tree.ts). The Vite TanStack Start plugin regenerates
// `src/routeTree.gen.ts` during dev and build, but a production build strips editor-style
// routes via `routeFileIgnorePattern`, which then breaks `tsc --noEmit` (the route file's
// `createFileRoute("/editor")` can no longer find "/editor" in the typed route map). This
// writes a tree that ALWAYS includes every route and is byte for byte what the dev server
// writes: the same generator plus the Start plugin's `Register` footer, so the two no longer
// flap.

import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Generator, getConfig } from "@tanstack/router-generator";

export interface RouteTreeOptions {
  /** App root. */
  root: string;
  /** Absolute path to the routes dir (default `<root>/src/routes`). */
  routesDirectory?: string;
  /** Absolute path to the generated tree (default `<root>/src/routeTree.gen.ts`). */
  generatedRouteTree?: string;
}

const ROUTER_FILES = ["router.tsx", "router.ts"];

// The block @tanstack/start-plugin-core's buildRouteTreeFileFooter appends for a react app
// with a router file and no start file (dist/esm/start-router-plugin/route-tree-footer.js).
// The plugin doesn't export it, so it is mirrored here; `just routes-check` fails when the
// committed trees (which `vite dev` and `vite build` write) and this disagree.
function startFooter(root: string, generatedRouteTree: string): string[] {
  for (const start of ["start.ts", "start.tsx"]) {
    if (existsSync(path.join(root, "src", start))) {
      throw new Error(`${root}: src/${start} changes the Start footer; extend startFooter()`);
    }
  }
  const router = ROUTER_FILES.find((f) => existsSync(path.join(root, "src", f)));
  if (!router) throw new Error(`${root}: no src/router.tsx or src/router.ts`);
  let importPath = path
    .relative(path.dirname(generatedRouteTree), path.join(root, "src", router))
    .split(path.sep)
    .join("/");
  if (!importPath.startsWith(".")) importPath = `./${importPath}`;
  return [
    [
      `import type { getRouter } from '${importPath}'`,
      "import type { createStart } from '@tanstack/react-start'",
      "declare module '@tanstack/react-start' {",
      "  interface Register {",
      "    ssr: true",
      "    router: Awaited<ReturnType<typeof getRouter>>",
      "  }",
      "}",
    ].join("\n"),
  ];
}

/** Write the app's route tree (default `<root>/src/routeTree.gen.ts`) from its routes. */
export async function generateRouteTree(opts: RouteTreeOptions): Promise<void> {
  const { root } = opts;
  const generatedRouteTree = opts.generatedRouteTree ?? `${root}/src/routeTree.gen.ts`;
  const config = getConfig(
    {
      routesDirectory: opts.routesDirectory ?? `${root}/src/routes`,
      generatedRouteTree,
      routeTreeFileFooter: startFooter(root, generatedRouteTree),
      // Beside the output, so the generator's final rename stays on one filesystem.
      tmpDir: path.join(root, ".tanstack", "tmp"),
    },
    root,
  );
  await new Generator({ config, root }).run();
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .toSorted();
}

/**
 * Regenerate the app's route tree in a scratch copy of its `src/routes` and return the
 * committed files that differ from the result (empty when fresh). The generator can also
 * rewrite a route file's `createFileRoute` path, so the route files are compared too.
 */
export async function staleRouteTreeFiles(root: string): Promise<string[]> {
  const scratch = mkdtempSync(path.join(tmpdir(), "route-tree-"));
  try {
    cpSync(path.join(root, "src", "routes"), path.join(scratch, "src", "routes"), {
      recursive: true,
    });
    for (const f of ROUTER_FILES) {
      const router = path.join(root, "src", f);
      if (existsSync(router)) cpSync(router, path.join(scratch, "src", f));
    }
    await generateRouteTree({ root: scratch });
    const generated = [
      path.join("src", "routeTree.gen.ts"),
      ...filesUnder(path.join(scratch, "src", "routes")).map((f) => path.join("src", "routes", f)),
    ];
    return generated.filter((rel) => {
      const committed = path.join(root, rel);
      return (
        !existsSync(committed) ||
        readFileSync(committed, "utf8") !== readFileSync(path.join(scratch, rel), "utf8")
      );
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
