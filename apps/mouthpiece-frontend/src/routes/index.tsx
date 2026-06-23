import { createFileRoute } from "@tanstack/react-router";
import { EpisodeCard } from "@/domain/components/EpisodeCard";
import { formatRuntime, sumRuntimeMs } from "@/domain/lib/format";
import { EPISODES, SITE } from "@/generated/episodes";

// The episode grid (slice 4 — gothic re-skin of faerrin face's index). Masthead +
// footer live in __root; this route owns the hero (count + summed runtime) + the
// EpisodeCard grid. EPISODES is a static, fully-typed generated module.
export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const totalMs = sumRuntimeMs(EPISODES);
  return (
    <main className="wrap">
      <section className="hero">
        <span className="hero-ghost" aria-hidden="true">
          {String(EPISODES.length).padStart(2, "0")}
        </span>
        <p className="hero-kicker">Transmission Log</p>
        <h1 className="hero-title">{SITE.title}</h1>
        <p className="hero-lede">
          Three hosts talk through each Pathfinder&nbsp;2e session like a roundtable, grounded
          against the campaign wiki and rendered to audio.
        </p>
        <div className="hero-stats">
          <span>
            {EPISODES.length} Episode{EPISODES.length === 1 ? "" : "s"}
          </span>
          {totalMs > 0 && <span>{formatRuntime(totalMs)} total</span>}
        </div>
      </section>

      {EPISODES.length === 0 ? (
        <p className="empty-state">No episodes yet.</p>
      ) : (
        <section className="grid" aria-label="Episodes">
          {EPISODES.map((e) => (
            <EpisodeCard key={e.id} episode={e} />
          ))}
        </section>
      )}
    </main>
  );
}
