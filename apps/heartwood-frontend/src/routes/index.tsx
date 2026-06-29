import { createFileRoute } from "@tanstack/react-router";
import { SessionCard } from "@/domain/components/SessionCard";
import { SITE } from "@/lib/site";
import { listSessions, type SessionSummary } from "@/serverFns/loadReview";

// The session index — every staged change-set read from the proposals/ bind-mount
// (server-side at SSR). Each links to its review page.
export const Route = createFileRoute("/")({
  loader: () => listSessions(),
  component: HomeComponent,
});

function HomeComponent() {
  const sessions = Route.useLoaderData();
  return (
    <main className="wrap">
      <section className="hero">
        <p className="hero-kicker">Iridi</p>
        <h1 className="hero-title">{SITE.title}</h1>
        <p className="hero-lede">{SITE.description}</p>
      </section>
      {sessions.length === 0 ? (
        <section className="empty-note">
          <p>No change-sets are staged. Run the proposer to produce one.</p>
        </section>
      ) : (
        <section className="session-grid">
          {sessions.map((s: SessionSummary) => (
            <SessionCard key={s.date} session={s} />
          ))}
        </section>
      )}
    </main>
  );
}
