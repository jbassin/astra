// `just new-frontend <name>` (scripts/new-frontend.ts): scaffold a TanStack Start frontend on the
// site-kit preset. It writes `apps/<name>/web/` from `template/` (every file there ends in
// `.tmpl`, so no tool lints, types or tests the templates themselves) plus its route tree, and
// adds the app's stubs to the shared files: its config.kdl block (and the fixture copy), its
// Pydantic model, its compose service and its Caddy stanza. The recipe then runs
// `just ontology-gen` and `pnpm install`. Each text edit is a pure function, so a test can run
// it on the real files without touching them.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseKdl } from "@astra/config";

import { generateRouteTree } from "./routeTree";

/** The template the scaffold copies (`libs/ts/site-kit/template/`). */
export const TEMPLATE_DIR = path.join(import.meta.dirname, "..", "template");

/** Every spelling of the app's name the scaffold writes. */
export interface FrontendNames {
  /** kebab-case: the app dir, the config.kdl block, the compose service, the host name. */
  name: string;
  /** camelCase: the TS config namespace (`loadConfig().<camel>`). */
  camel: string;
  /** snake_case: the Pydantic field. */
  snake: string;
  /** PascalCase: the Pydantic class prefix. */
  pascal: string;
  /** Capitalised words: the page title. */
  title: string;
}

export function frontendNames(name: string): FrontendNames {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`frontend name ${JSON.stringify(name)} must be kebab-case (a-z, 0-9, -)`);
  }
  const words = name.split("-");
  const cap = (w: string) => w[0]?.toUpperCase() + w.slice(1);
  return {
    name,
    camel: words[0] + words.slice(1).map(cap).join(""),
    snake: words.join("_"),
    pascal: words.map(cap).join(""),
    title: words.map(cap).join(" "),
  };
}

function render(text: string, names: FrontendNames, port: number): string {
  return text
    .replaceAll("__name__", names.name)
    .replaceAll("__camel__", names.camel)
    .replaceAll("__title__", names.title)
    .replaceAll("__port__", String(port));
}

function templateFiles(dir: string, rel = ""): string[] {
  return readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const p = path.join(rel, e.name);
    return e.isDirectory() ? templateFiles(dir, p) : [p];
  });
}

/**
 * Write the app's files into `appDir` from the template and generate its route tree. Returns
 * the written paths, relative to `appDir`.
 */
export async function writeFrontendApp(
  appDir: string,
  names: FrontendNames,
  port: number,
): Promise<string[]> {
  if (existsSync(appDir)) throw new Error(`${appDir} already exists`);
  const written: string[] = [];
  for (const rel of templateFiles(TEMPLATE_DIR)) {
    const out = rel.replace(/\.tmpl$/, "");
    const src = readFileSync(path.join(TEMPLATE_DIR, rel));
    mkdirSync(path.dirname(path.join(appDir, out)), { recursive: true });
    // Only `.tmpl` files hold tokens; anything else (the favicon) is copied byte for byte.
    const body = rel.endsWith(".tmpl") ? render(src.toString("utf8"), names, port) : src;
    writeFileSync(path.join(appDir, out), body);
    written.push(out);
  }
  await generateRouteTree({ root: appDir });
  written.push("src/routeTree.gen.ts");
  return written.toSorted();
}

const PORT_RANGE = { low: 10350, high: 10399 };

/**
 * The next host port after the highest one in 10350 to 10399 that any of `texts` names. A range
 * written `10350-10399` (a comment) doesn't count.
 */
export function nextFreePort(...texts: string[]): number {
  let highest = PORT_RANGE.low - 1;
  for (const text of texts) {
    for (const m of text.matchAll(/(?<![-\d])(10[34]\d\d)(?![-\d])/g)) {
      const n = Number(m[1]);
      if (n >= PORT_RANGE.low && n <= PORT_RANGE.high) highest = Math.max(highest, n);
    }
  }
  if (highest >= PORT_RANGE.high) throw new Error("no free port left in 10350 to 10399");
  return highest + 1;
}

/** `config.kdl` (or its fixture) with the app's block appended. Throws if it has one. */
export function addConfigBlock(kdl: string, names: FrontendNames, port: number): string {
  if (parseKdl(kdl).children.some((n) => n.name === names.name)) {
    throw new Error(`config.kdl already has a ${names.name} block`);
  }
  const block = [
    `${names.name} {`,
    `    // ${names.title}: an SSR frontend on the site-kit preset (\`just new-frontend\`).`,
    `    // server.ts binds this port and names telemetry; behind Caddy at`,
    `    // ${names.name}.iridi.cc. service-name also derives the browser RUM name.`,
    `    service-name "astra.${names.name}"`,
    `    port ${port}`,
    "}",
  ].join("\n");
  return `${kdl.trimEnd()}\n\n${block}\n`;
}

function insertBefore(text: string, anchor: string, insert: string, what: string): string {
  const at = text.indexOf(anchor);
  if (at < 0) throw new Error(`${what}: no ${JSON.stringify(anchor)} to insert before`);
  return text.slice(0, at) + insert + text.slice(at);
}

/**
 * `models.py` with the app's Pydantic model: the class before `WholeConfig`, its field at the
 * end of `WholeConfig`, and its namespace at the end of `TS_NAMESPACES`.
 */
export function addPydanticModel(py: string, names: FrontendNames): string {
  const cls = `${names.pascal}Config`;
  if (py.includes(`class ${cls}(`)) throw new Error(`models.py already has ${cls}`);
  const classDef = [
    `class ${cls}(_Base):`,
    `    # ${names.title}: an SSR frontend on the site-kit preset. service_name and port are the`,
    "    # single source for server.ts and vite's dev port; service_name also derives the browser",
    "    # RUM name.",
    "    service_name: str",
    "    port: int",
    "",
    "",
    "",
  ].join("\n");
  let out = insertBefore(py, "class WholeConfig(", classDef, "models.py");
  // WholeConfig ends at the two blank lines after its last field.
  const whole = out.indexOf("class WholeConfig(");
  const end = out.indexOf("\n\n\n", whole);
  out = `${out.slice(0, end)}\n    ${names.snake}: ${cls}${out.slice(end)}`;
  // The docstring's ownership list: "Only TS reads `a`, `b` and `c`." gains the new block.
  const owners = out.indexOf("Only TS reads ");
  const stop = out.indexOf("`.", owners);
  const and = out.lastIndexOf(" and `", stop);
  if (owners < 0 || stop < 0 || and < owners) {
    throw new Error('models.py: no "Only TS reads ... and `x`." ownership sentence');
  }
  const head = `${out.slice(0, and)},${out.slice(and + 4, stop + 1)}`;
  const lineLength = head.length - head.lastIndexOf("\n") - 1;
  const rest = out.slice(stop + 2, out.indexOf("\n", stop));
  const added = ` and \`${names.name}\`.`;
  // Keep the docstring within ruff's 100-column limit.
  const sep = lineLength + added.length + rest.length > 100 ? "\n" : " ";
  out = `${head}${sep}${added.trimStart()}${out.slice(stop + 2)}`;
  const ts = out.indexOf("TS_NAMESPACES: tuple[str, ...] = (");
  if (ts < 0) throw new Error("models.py: no TS_NAMESPACES tuple");
  const close = out.indexOf("\n)", ts);
  return `${out.slice(0, close)}\n    "${names.snake}",${out.slice(close)}`;
}

/** `docker-compose.yml` with the app's service after the last service, before `networks:`. */
export function addComposeService(yml: string, names: FrontendNames, port: number): string {
  if (new RegExp(`^  ${names.name}:$`, "m").test(yml)) {
    throw new Error(`docker-compose.yml already has a ${names.name} service`);
  }
  const lines = yml.split("\n");
  const networks = lines.indexOf("networks:");
  if (networks < 0) throw new Error("docker-compose.yml: no top-level networks:");
  let last = networks - 1;
  while (last >= 0 && (lines[last]?.trim() === "" || lines[last]?.startsWith("#"))) last -= 1;
  const service = [
    "",
    `  # --- ${names.name}: an SSR frontend on the site-kit preset (\`just new-frontend\`).`,
    "  # Port and service name come from config.kdl. ---",
    `  ${names.name}:`,
    "    <<: *astra-app",
    "    build:",
    "      <<: *node-build",
    "      args:",
    `        APP: ${names.name}/web`,
    `    image: astra-${names.name}:local`,
    `    container_name: astra-${names.name}`,
    "    ports:",
    `      - "${port}:${port}"`,
    "    healthcheck:",
    "      <<: *node-healthcheck",
    `      test: ["CMD", "node", "-e", "await fetch('http://localhost:${port}/').then(r=>process.exit(r.ok?0:1))"]`,
  ];
  lines.splice(last + 1, 0, ...service);
  return lines.join("\n");
}

/** `sites.caddyfile` with the app's public host appended. */
export function addCaddyStanza(caddy: string, names: FrontendNames, port: number): string {
  const host = `${names.name}.iridi.cc`;
  if (caddy.includes(`\n${host} {`)) throw new Error(`sites.caddyfile already has ${host}`);
  const stanza = [
    `# ${names.name}: an SSR frontend on the site-kit preset (\`just new-frontend\`), port ${port}.`,
    "# (*.iridi.cc wildcard: no DNS record needed; the certificate is issued on the first request.)",
    `${host} {`,
    "\timport astra_site",
    `\treverse_proxy localhost:${port}`,
    "}",
  ].join("\n");
  return `${caddy.trimEnd()}\n\n${stanza}\n`;
}

/** The repo files the scaffold edits, relative to the repo root. */
export const SHARED_FILES = {
  config: "ontology/ontology-config/config.kdl",
  fixtureConfig: "fixtures/config/config.kdl",
  models: "libs/py/config/src/astra_config/models.py",
  compose: "deploy/docker-compose.yml",
  caddy: "sites.caddyfile",
} as const;

/**
 * Scaffold `apps/<name>/web` in `repoRoot` and add its stubs to the shared files. Leaves
 * `just ontology-gen` and `pnpm install` to the caller (the `just new-frontend` recipe).
 */
export async function scaffoldFrontend(opts: {
  repoRoot: string;
  name: string;
  port?: number;
}): Promise<{ appDir: string; port: number; files: string[] }> {
  const names = frontendNames(opts.name);
  const file = (key: keyof typeof SHARED_FILES) => path.join(opts.repoRoot, SHARED_FILES[key]);
  const read = (key: keyof typeof SHARED_FILES) => readFileSync(file(key), "utf8");
  const config = read("config");
  const compose = read("compose");
  const port = opts.port ?? nextFreePort(config, compose);
  const appDir = path.join(opts.repoRoot, "apps", names.name, "web");
  // Compute every edit before writing anything, so a refusal leaves the repo untouched.
  const edits: Array<[string, string]> = [
    [file("config"), addConfigBlock(config, names, port)],
    [file("fixtureConfig"), addConfigBlock(read("fixtureConfig"), names, port)],
    [file("models"), addPydanticModel(read("models"), names)],
    [file("compose"), addComposeService(compose, names, port)],
    [file("caddy"), addCaddyStanza(read("caddy"), names, port)],
  ];
  const files = await writeFrontendApp(appDir, names, port);
  for (const [p, text] of edits) writeFileSync(p, text);
  return { appDir, port, files };
}
