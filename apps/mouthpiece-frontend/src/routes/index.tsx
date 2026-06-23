import { createFileRoute, Link } from "@tanstack/react-router";
import { EPISODES, SITE } from "@/generated/episodes";

// The episode grid (slice 3 — data wired from episodes-index.json). EPISODES is a
// static, fully-typed generated module, so the component reads it directly (no
// loader needed). The gothic masthead + hero (count + summed runtime) + the
// EpisodeCard grid land in slice 4; for now a minimal linked list.
export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <main className="masthead">
      <h1>{SITE.title}</h1>
      <p>{SITE.description}</p>
      {EPISODES.length === 0 ? (
        <p className="empty-state">No episodes yet.</p>
      ) : (
        <ul>
          {EPISODES.map((e) => (
            <li key={e.id}>
              <Link to="/episode/$id" params={{ id: e.id }}>
                {e.episodeNo > 0 ? `#${e.episodeNo} · ` : ""}
                {e.episodeTitle}
              </Link>{" "}
              <small>
                {e.arcTitle} — {e.date}
              </small>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
