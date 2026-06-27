import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/generated/site";

// SLICE 1 placeholder landing. The interactive draw/reading surface lands in slice 5
// (the route body imports the domain draw + FlipCard/CardSpread behind <ClientOnly>);
// for now this is the SSR-renderable shell that proves the app boots + serves.
export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <main className="wrap">
      <section className="hero">
        <p className="hero-kicker">Transmission</p>
        <h1 className="hero-title">{SITE.title}</h1>
        <p className="hero-lede">{SITE.description}</p>
      </section>
    </main>
  );
}
