import { Link } from "@tanstack/react-router";
import { formatRuntime } from "@/domain/lib/format";
import type { GeneratedEpisode } from "@/generated/episodes";

// One episode in the grid (gothic re-skin of faerrin face's EpisodeCard — structure
// kept, the neon-HUD chrome dropped for the gothic void palette). Recaps (episodeNo
// 0) read "Recap"; runtime shows only once audio is seeded (durationMs > 0).
export function EpisodeCard({ episode }: { episode: GeneratedEpisode }) {
  const kind = episode.isMain ? "Campaign" : "One-Shot";
  const num = episode.episodeNo > 0 ? `#${episode.episodeNo}` : "Recap";
  return (
    <Link to="/episode/$id" params={{ id: episode.id }} className="card">
      <div className="card-top">
        <span className="card-num">{num}</span>
        <span className="card-kind">{kind}</span>
        <span className="card-date">{episode.date}</span>
      </div>
      <h2 className="card-title">{episode.episodeTitle}</h2>
      <p className="card-arc">{episode.arcTitle}</p>
      <div className="card-foot">
        <span className="hosts">
          {Object.entries(episode.hosts).map(([speaker, host]) => (
            <span key={speaker} className={`host ${speaker}`}>
              {host.name}
            </span>
          ))}
        </span>
        {episode.durationMs > 0 && (
          <span className="card-runtime">{formatRuntime(episode.durationMs)}</span>
        )}
      </div>
    </Link>
  );
}
