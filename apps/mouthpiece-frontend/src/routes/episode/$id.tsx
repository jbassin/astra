import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import Player from "@/domain/components/Player";
import { formatRuntime } from "@/domain/lib/format";
import { EPISODES } from "@/generated/episodes";
import { TRANSCRIPTS } from "@/generated/transcripts";

// The episode page (slice 4 — gothic re-skin of faerrin face's [id].astro). Header +
// native-audio placeholder + synopsis + speaker-colored transcript. The custom
// <Player> island (MediaSession/scrubbing/resume) replaces the native audio in
// slice 5. The loader does the SSR 404; the component reads the static, fully-typed
// generated modules directly. Dotted `$id` round-trips losslessly (Risk 2).
const ROLE: Record<string, string> = { A: "Recapper", B: "Lorekeeper", C: "Instigator" };

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
  const kind = episode.isMain ? "Campaign" : "One-Shot";
  const num = episode.episodeNo > 0 ? `Episode ${episode.episodeNo}` : "Recap";

  return (
    <main className="wrap-narrow ep">
      <p className="ep-back">
        <Link to="/">← All Episodes</Link>
      </p>

      <header className="ep-head">
        <div className="ep-meta">
          <span className="ep-num">{num}</span>
          <span className="ep-kind">{kind}</span>
          <span>{episode.date}</span>
          {episode.durationMs > 0 && <span>{formatRuntime(episode.durationMs)}</span>}
        </div>
        <h1 className="ep-title">{episode.episodeTitle}</h1>
        <p className="ep-arc">{episode.arcTitle}</p>
        <div className="ep-hosts">
          {Object.entries(episode.hosts).map(([speaker, host]) => (
            <span key={speaker} className={`host ${speaker}`}>
              {host.name}
              {ROLE[speaker] ? ` · ${ROLE[speaker]}` : ""}
            </span>
          ))}
        </div>
      </header>

      {/* The custom Player island (slice 5) — MediaSession / pointer-capture
          scrubbing / localStorage resume. SSR-renders the transport + hydrates; the
          audio serves once seeded (D2, slice 6). */}
      <section className="ep-player" aria-label="Player">
        <Player
          id={episode.id}
          src={episode.mp3Url}
          title={episode.episodeTitle}
          artist={episode.arcTitle}
          runtimeMs={episode.durationMs}
        />
      </section>

      {episode.synopsis && (
        <section className="ep-synopsis">
          <h2 className="ep-section">Synopsis</h2>
          <p className="ep-lede">{episode.synopsis}</p>
        </section>
      )}

      <details className="ep-transcript">
        <summary className="ep-summary">
          Transcript <span className="ep-count">{transcript.length} lines</span>
        </summary>
        <div className="transcript-root">
          {transcript.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static, never-reordered transcript
            <p key={i} className={`transcript-line ${line.speaker}`}>
              <span className="transcript-name">{line.name}</span>{" "}
              <span className="transcript-text">{line.text}</span>
            </p>
          ))}
        </div>
      </details>
    </main>
  );
}
