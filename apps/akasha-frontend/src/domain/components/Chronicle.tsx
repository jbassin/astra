// The campaign chronicle (0019): a Show → Season → Episode timeline. The index lists
// every show (main first); a show page renders its GLM-derived seasons with an episode
// card per session that links to the existing transcript page. Data comes from the
// build-generated module (scripts/build-content.ts → src/generated/chronicle.ts).
import { PageLayout } from "@/domain/components/PageLayout";
import type { ChronicleEpisode, ChronicleShow } from "@/generated/chronicle";

function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** /chronicle — the shows index (landing). */
export function ChronicleIndex({ shows }: { shows: ChronicleShow[] }) {
  return (
    <PageLayout>
      <div className="page-header">
        <h1 className="chronicle-title">Chronicle</h1>
      </div>
      <p className="chronicle-intro">
        An automatically structured timeline of every recorded campaign — each show split into
        seasons, each session an episode.
      </p>
      <div className="chronicle-shows">
        {shows.map((show) => (
          <a key={show.show} href={`/chronicle/${show.show}`} className="chronicle-show-card">
            {show.isMain && <span className="chronicle-badge">Main campaign</span>}
            <h2 className="chronicle-show-name">{show.name}</h2>
            <p className="chronicle-show-meta">
              {countLabel(show.seasonCount, "season", "seasons")} ·{" "}
              {countLabel(show.episodeCount, "episode", "episodes")}
            </p>
          </a>
        ))}
      </div>
    </PageLayout>
  );
}

function TagRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="chronicle-tagrow">
      <span className="chronicle-tagrow-label">{label}</span>
      <span className="chronicle-tags">
        {items.map((item) => (
          <span key={item} className="chronicle-tag">
            {item}
          </span>
        ))}
      </span>
    </div>
  );
}

function EpisodeCard({
  seasonNumber,
  episode,
}: {
  seasonNumber: number;
  episode: ChronicleEpisode;
}) {
  const code = `S${seasonNumber}E${episode.episodeNumber}`;
  return (
    <article className="chronicle-episode">
      <header className="chronicle-episode-head">
        <span className="chronicle-code">{code}</span>
        <div className="chronicle-episode-titles">
          <h4 className="chronicle-episode-title">
            {episode.href ? (
              <a href={episode.href} className="internal">
                {episode.title}
              </a>
            ) : (
              episode.title
            )}
          </h4>
          <span className="chronicle-date">{episode.date}</span>
        </div>
      </header>
      <p className="chronicle-synopsis">{episode.synopsis}</p>
      {episode.keyBeats.length > 0 && (
        <ol className="chronicle-beats">
          {episode.keyBeats.map((beat, i) => (
            // beats are ordered prose with no stable id; index key is correct here
            // biome-ignore lint/suspicious/noArrayIndexKey: ordered static beat list
            <li key={i}>{beat}</li>
          ))}
        </ol>
      )}
      <TagRow label="Characters" items={episode.charactersPresent} />
      <TagRow label="Locations" items={episode.locations} />
      <TagRow label="Factions" items={episode.factions} />
      <TagRow label="Items" items={episode.items} />
      {episode.cliffhanger && (
        <p className="chronicle-cliffhanger">
          <span className="chronicle-cliffhanger-label">Cliffhanger</span> {episode.cliffhanger}
        </p>
      )}
    </article>
  );
}

/** /chronicle/$show — one show's seasons + episodes. */
export function ShowChronicle({ show }: { show: ChronicleShow }) {
  return (
    <PageLayout>
      <div className="page-header">
        <p className="chronicle-crumb">
          <a href="/chronicle" className="internal">
            Chronicle
          </a>
        </p>
        <h1 className="chronicle-title">{show.name}</h1>
        <p className="chronicle-show-meta">
          {countLabel(show.seasonCount, "season", "seasons")} ·{" "}
          {countLabel(show.episodeCount, "episode", "episodes")}
        </p>
      </div>
      {show.seasons.map((season) => (
        <section key={season.number} className="chronicle-season">
          <h3 className="chronicle-season-title">
            <span className="chronicle-season-num">Season {season.number}</span>
            {season.title}
          </h3>
          {season.arcSummary && <p className="chronicle-arc">{season.arcSummary}</p>}
          <div className="chronicle-episodes">
            {season.episodes.map((episode) => (
              <EpisodeCard key={episode.date} seasonNumber={season.number} episode={episode} />
            ))}
          </div>
        </section>
      ))}
    </PageLayout>
  );
}
