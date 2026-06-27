import { createFileRoute } from "@tanstack/react-router";
import { SiteCard } from "@/domain/components/SiteCard";
import { SITE } from "@/generated/site";
import { SITES } from "@/generated/sites";

// The landing page — a gothic card grid linking to every player-facing site. Fully
// static: SSRs straight from the generated modules (no client-only state), so it
// renders identically server- and client-side.
export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <main className="wrap">
      <section className="hero">
        <p className="hero-kicker">Iridi</p>
        <h1 className="hero-title">{SITE.title}</h1>
        <p className="hero-lede">{SITE.description}</p>
      </section>
      <section className="site-grid">
        {SITES.map((site) => (
          <SiteCard key={site.key} site={site} />
        ))}
      </section>
    </main>
  );
}
