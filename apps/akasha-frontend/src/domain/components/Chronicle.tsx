// The campaign chronicle (0019): a Show → Season → Episode timeline. The index lists
// every show (main first); a show page lists its seasons with a compact card (title +
// blurb) per episode that links to the episode's own page; the episode page carries the
// full detail. Data comes from the build-generated module (scripts/build-content.ts →
// src/generated/chronicle.ts). Chronicle pages opt out of the wiki force-graph.
import { PageLayout } from "@/domain/components/PageLayout";
import type { ChronicleEpisode, ChronicleSeason, ChronicleShow } from "@/generated/chronicle";

function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** /chronicle — the shows index (landing). */
export function ChronicleIndex({ shows }: { shows: ChronicleShow[] }) {
  return (
    <PageLayout graph={false}>
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

/** A compact episode card on the show page — title + blurb, links to the episode page. */
function EpisodeCardLink({
  showSlug,
  seasonNumber,
  episode,
}: {
  showSlug: string;
  seasonNumber: number;
  episode: ChronicleEpisode;
}) {
  return (
    <a href={`/chronicle/${showSlug}/${episode.date}`} className="chronicle-ep-card">
      <span className="chronicle-code">{`S${seasonNumber}E${episode.episodeNumber}`}</span>
      <h4 className="chronicle-ep-card-title">{episode.title}</h4>
      <p className="chronicle-ep-card-blurb">{episode.synopsis}</p>
      <span className="chronicle-date">{episode.date}</span>
    </a>
  );
}

/** /chronicle/$show — one show's seasons, each a grid of compact episode cards. */
export function ShowChronicle({ show }: { show: ChronicleShow }) {
  return (
    <PageLayout graph={false}>
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
          <div className="chronicle-ep-grid">
            {season.episodes.map((episode) => (
              <EpisodeCardLink
                key={episode.date}
                showSlug={show.show}
                seasonNumber={season.number}
                episode={episode}
              />
            ))}
          </div>
        </section>
      ))}
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

/** /chronicle/$show/$episode — one episode's full detail. */
export function EpisodeDetail({
  show,
  season,
  episode,
}: {
  show: ChronicleShow;
  season: ChronicleSeason;
  episode: ChronicleEpisode;
}) {
  const code = `S${season.number}E${episode.episodeNumber}`;
  return (
    <PageLayout graph={false}>
      <div className="page-header">
        <p className="chronicle-crumb">
          <a href="/chronicle" className="internal">
            Chronicle
          </a>{" "}
          /{" "}
          <a href={`/chronicle/${show.show}`} className="internal">
            {show.name}
          </a>
        </p>
        <div className="chronicle-episode-head">
          <span className="chronicle-code">{code}</span>
          <div className="chronicle-episode-titles">
            <h1 className="chronicle-title">{episode.title}</h1>
            <span className="chronicle-date">
              Season {season.number} · {season.title} · {episode.date}
            </span>
          </div>
        </div>
      </div>

      <p className="chronicle-synopsis">{episode.synopsis}</p>

      {episode.keyBeats.length > 0 && (
        <ol className="chronicle-beats">
          {episode.keyBeats.map((beat, i) => (
            // beats are ordered prose with no stable id; index key is correct here
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

      {episode.href && (
        <p className="chronicle-transcript-link">
          <a href={episode.href} className="internal">
            Read the full transcript →
          </a>
        </p>
      )}
    </PageLayout>
  );
}
