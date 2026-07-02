// Pre-build content pipeline. Emits the generated modules the runtime imports
// (@/generated/*), so neither @astra/config nor the registry parsing reaches the
// client bundle (the strider/akasha/harrow template). contentWatchPlugin runs this
// at vite buildStart.
//
// ledger is the simplest frontend: there are no content FILES. The "content" is a
// small registry (key + title + blurb + order) joined to each target site's own
// `public-origin` read from config.kdl (config-single-source — the URL has ONE
// source, each site's own namespace; ledger never hardcodes a URL).
//
// Emits:
//   - src/generated/site.ts   — static masthead/head metadata;
//   - src/generated/sites.ts  — SITES: SiteLink[] (registry order), each href the
//                               target's config public-origin.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { type Config, loadConfig } from "@astra/config";
import { buildContent, defineContentSource, emitModule } from "@astra/content-build";

import type { SiteLink } from "../src/domain/lib/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../src/generated");

const SITE_TITLE = "Ledger";
const SITE_DESCRIPTION = "The campaign's sites, in one place.";

// The registry (ledger-owned content): render order + each card's title/blurb. `key`
// resolves to a config namespace via `originFor` below — that's the single source for
// the URL. Player-facing sites only (0018 decision).
const REGISTRY: Array<Omit<SiteLink, "href">> = [
  {
    key: "strider",
    title: "Strider",
    blurb: "The campaign map — factions, banners, and the shifting front.",
  },
  {
    key: "akasha",
    title: "Akasha",
    blurb: "The wiki — lore, characters, and session transcripts.",
  },
  {
    key: "mouthpiece",
    title: "Mouthpiece",
    blurb: "The recap podcast — every session, retold.",
  },
  {
    key: "harrow",
    title: "Harrow",
    blurb: "The Harrow deck — draw a reading, read your fortune.",
  },
  {
    key: "vellum",
    title: "Vellum",
    blurb: "The document forge — author and render handouts.",
  },
];

// Map a registry key → its target site's config public-origin (config-single-source).
function originFor(cfg: Config, key: string): string {
  switch (key) {
    case "strider":
      return cfg.strider.publicOrigin;
    case "akasha":
      return cfg.akashaFrontend.publicOrigin;
    case "mouthpiece":
      return cfg.mouthpieceFrontend.publicOrigin;
    case "harrow":
      return cfg.harrow.publicOrigin;
    case "vellum":
      return cfg.vellumFrontend.publicOrigin;
    default:
      throw new Error(`ledger: no config public-origin for site "${key}"`);
  }
}

const siteSource = defineContentSource({
  name: "site",
  build() {
    const body = [
      "/** Static site metadata for ledger's masthead + document head. */",
      `export const SITE = { title: ${JSON.stringify(SITE_TITLE)}, description: ${JSON.stringify(SITE_DESCRIPTION)} } as const;`,
      "",
    ].join("\n");
    emitModule(OUT_DIR, "site.ts", body);
    return `site: ${SITE_TITLE}`;
  },
});

const sitesSource = defineContentSource({
  name: "sites",
  build() {
    const cfg = loadConfig();
    // oxlint-disable-next-line no-map-spread -- avoids an unsafe cast; not a hot path.
    const sites: SiteLink[] = REGISTRY.map((s) => ({ ...s, href: originFor(cfg, s.key) }));
    const body = [
      "/** The linked sites, in registry order. Each href is the target site's own",
      " *  public-origin from config.kdl (config-single-source) — ledger hardcodes no",
      " *  URLs. The runtime imports this; @astra/config stays build-time. */",
      'import type { SiteLink } from "@/domain/lib/types";',
      "",
      `export const SITES: SiteLink[] = ${JSON.stringify(sites, null, 2)};`,
      "",
    ].join("\n");
    emitModule(OUT_DIR, "sites.ts", body);
    return `sites: ${sites.length}`;
  },
});

export async function main(): Promise<void> {
  const summaries = await buildContent(OUT_DIR, [siteSource, sitesSource]);
  for (const s of summaries) console.log(`  ${s}`);
}

if (import.meta.main) {
  await main();
}
