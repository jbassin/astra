import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/lib/site";

// The session index. S1 ships a static placeholder that proves the SSR shell + the
// gothic render; S2 replaces the body with the list of staged change-sets read from
// the proposals/ bind-mount via a server fn.
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
      <section className="empty-note">
        <p>No change-sets are loaded yet. The review surface lands here.</p>
      </section>
    </main>
  );
}
