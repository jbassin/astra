import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { EPISODES } from "@/generated/episodes";
import { TRANSCRIPTS } from "@/generated/transcripts";

// The episode page (slice 3 — data wired). Renders the header + synopsis + the
// speaker-attributed transcript from the static generated modules. The loader does
// the SSR-time 404 for an unknown id; the component reads the (fully typed) modules
// directly. The <Player> island (slice 5) and the gothic re-skin + speaker colors
// (slice 4) land later; this proves the catalog + transcript modules render and that
// a dotted `$id` (e.g. 000.through-a-song-darkly.2026-5-7) round-trips losslessly
// (Risk 2).
export const Route = createFileRoute("/episode/$id")({
  loader: ({ params }) => {
    if (!EPISODES.some((e) => e.id === params.id)) throw notFound();
  },
  component: EpisodeComponent,
});

function EpisodeComponent() {
  const { id } = Route.useParams();
  const episode = EPISODES.find((e) => e.id === id);
  if (!episode) return null; // the loader already threw notFound for unknown ids
  const transcript = TRANSCRIPTS[id] ?? [];
  const hosts = Object.values(episode.hosts).map((h) => h.name);

  return (
    <main className="episode">
      <p>
        <Link to="/">← {episode.arcTitle}</Link>
      </p>
      <h1>{episode.episodeTitle}</h1>
      <p className="episode-meta">
        {episode.episodeNo > 0 ? `Episode ${episode.episodeNo} · ` : ""}
        {episode.date} · {hosts.join(", ")}
      </p>
      {/* Player island slot — wired in slice 5. */}
      <p className="synopsis">{episode.synopsis}</p>
      <details className="transcript">
        <summary>Transcript</summary>
        <div className="transcript-root">
          {transcript.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static, never-reordered transcript
            <p key={i} className={`transcript-line ${line.speaker}`}>
              <span className="transcript-name">{line.name}</span> {line.text}
            </p>
          ))}
        </div>
      </details>
    </main>
  );
}
