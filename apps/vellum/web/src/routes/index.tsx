import { createFileRoute, Link } from "@tanstack/react-router";

// The landing page. vellum is an authoring tool, not a read-surface, so the home
// route is a thin door into the editor (the real surface — slice 2, an `ssr: false`
// client route). Kept SSR so the masthead + telemetry/RUM render server-side.
export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <main className="wrap">
      <section className="hero">
        <p className="hero-kicker">Document Forge</p>
        <h1 className="hero-title">Vellum</h1>
        <p className="hero-lede">
          Write Pathfinder&nbsp;2e statblocks, hazards, items, spells, handouts and edicts in vellum
          markup, see them rendered live, and export a pixel-faithful PNG.
        </p>
        <p className="hero-cta">
          <Link to="/editor" className="cta-button">
            Open the editor
          </Link>
        </p>
      </section>
    </main>
  );
}
