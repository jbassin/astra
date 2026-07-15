import { createFileRoute } from "@tanstack/react-router";

import { HeroSearch } from "@/domain/search/HeroSearch";

/**
 * P4.5 S2 (D29-47, feedback #3/R4) — the real landing page: the eight big
 * tiles + a front-and-center search box. Replaces the P2 throwaway category
 * directory that used to live at `/` (moved verbatim to `/categories`,
 * `categories.tsx` — the "browse all categories" link below points there).
 * No loader — this page reads nothing off the corpus itself, unlike the old
 * directory it replaced.
 */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "codex — a Pathfinder 2e reference" }],
  }),
  component: IndexComponent,
});

/** The 8 R4 tiles, in the spec's own §2 D29-47 order — each a big linked
 * card in the parchment voice, not a facet UI. */
const LANDING_TILES: readonly { label: string; href: string }[] = [
  { label: "Creatures", href: "/creature" },
  { label: "Spells", href: "/spell" },
  { label: "Feats", href: "/feat" },
  { label: "Equipment & Items", href: "/equipment" },
  { label: "Classes", href: "/class" },
  { label: "Ancestries & Backgrounds", href: "/ancestry" },
  { label: "Rules", href: "/rules" },
  { label: "Sources", href: "/sources" },
];

function IndexComponent() {
  return (
    <main className="wrap codex-landing">
      <h1 className="hero-title codex-landing-brand">codex</h1>
      <p className="hero-lede codex-landing-lede">
        A Pathfinder Second Edition rules &amp; compendium reference.
      </p>
      <HeroSearch />
      <ul className="codex-landing-tiles">
        {LANDING_TILES.map((tile) => (
          <li key={tile.href}>
            <a href={tile.href} className="codex-landing-tile">
              {tile.label}
            </a>
          </li>
        ))}
      </ul>
      <p className="codex-landing-browse-all">
        <a href="/categories">Browse all categories &rarr;</a>
      </p>
    </main>
  );
}
