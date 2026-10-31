// Sessions, the campaign chronicle (0019): Show, then Season, then Episode. `/chronicle`
// lists the main campaign's seasons and episodes, then the other shows; a show page lists its
// seasons; an episode page carries the full summary and a link to the transcript. Data comes
// from the build-generated chronicle (scripts/build-content.ts, through the page-data server
// functions). These pages have no graph.
import { type ListCrumb, ListingHead } from "@/domain/components/ListingHead";
import { PageLayout } from "@/domain/components/PageLayout";
import type { ChronicleEpisode, ChronicleSeason, ChronicleShow } from "@/domain/lib/chronicleTypes";
import { campaignLabel, groupShows } from "@/domain/lib/listingData";
import { dayInWords, firstSentence, plural } from "@/domain/lib/listingFormat";
import { SECTIONS } from "@/domain/lib/sections";

const SESSIONS_HUE = SECTIONS.find((s) => s.id === "sessions")?.hue;
const SESSIONS_CRUMB: ListCrumb = { label: "Sessions", href: "/chronicle", hue: SESSIONS_HUE };

const showFacts = (show: ChronicleShow) =>
  `${plural(show.seasonCount, "season", "seasons")}, ${plural(show.episodeCount, "episode", "episodes")}`;

function ShowRows({ id, title, shows }: { id: string; title: string; shows: ChronicleShow[] }) {
  if (shows.length === 0) return null;
  return (
    <section className="ak-show" aria-labelledby={id}>
      <h2 className="ak-show-title" id={id}>
        {title}
      </h2>
      <ul className="ak-show-rows">
        {shows.map((show) => (
          <li key={show.show}>
            <a className="ak-show-row" href={`/chronicle/${show.show}`}>
              <span className="ak-show-row-name">{show.name}</span>
              <span className="ak-show-row-facts">
                {[campaignLabel(show), showFacts(show)].filter(Boolean).join(" · ")}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Season 3: The Pilgrimage"; just "Season 1" when the season has no title of its own. */
function seasonHeading(season: ChronicleSeason): string {
  const plain = `Season ${season.number}`;
  return season.title && season.title !== plain ? `${plain}: ${season.title}` : plain;
}

const seasonId = (season: ChronicleSeason) => `season-${season.number}`;

/** A season: its heading, the arc summary, and a row per episode (date, title, the
 *  synopsis's first sentence) linking to the episode's page. */
function Season({
  show,
  season,
  level,
}: {
  show: ChronicleShow;
  season: ChronicleSeason;
  level: "h2" | "h3";
}) {
  const Heading = level;
  return (
    <section className="ak-season" id={seasonId(season)}>
      <Heading className="ak-season-title">{seasonHeading(season)}</Heading>
      {season.arcSummary && <p className="ak-season-arc">{season.arcSummary}</p>}
      <ol className="ak-episodes">
        {season.episodes.map((episode) => (
          <li key={episode.date}>
            <a className="ak-episode-row" href={`/chronicle/${show.show}/${episode.date}`}>
              <time dateTime={episode.date}>{dayInWords(episode.date)}</time>
              <span className="ak-episode-text">
                <span className="ak-episode-title">{episode.title}</span>
                {episode.synopsis && (
                  <span className="ak-episode-blurb">{firstSentence(episode.synopsis)}</span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** /chronicle: Sessions. */
export function ChronicleIndex({ shows }: { shows: ChronicleShow[] }) {
  const { main, earlier, oneShots } = groupShows(shows);
  return (
    <PageLayout graph={false}>
      <ListingHead title="Sessions">
        <p className="ak-list-lede">
          Every session we have recorded, by campaign and season. Each one has a summary here and a
          full transcript.
        </p>
      </ListingHead>
      {main && (
        <section className="ak-show" aria-labelledby="ak-main-show">
          <h2 className="ak-show-title" id="ak-main-show">
            <a href={`/chronicle/${main.show}`}>{main.name}</a>
          </h2>
          <p className="ak-show-facts">
            {campaignLabel(main)}: {showFacts(main)}
          </p>
          {main.seasons.map((season) => (
            <Season key={season.number} show={main} season={season} level="h3" />
          ))}
        </section>
      )}
      <ShowRows id="ak-earlier-shows" title="Earlier campaigns" shows={earlier} />
      <ShowRows id="ak-one-shots" title="One-shots" shows={oneShots} />
    </PageLayout>
  );
}

/** /chronicle/$show: one show's seasons. */
export function ShowChronicle({ show }: { show: ChronicleShow }) {
  return (
    <PageLayout graph={false}>
      <ListingHead crumbs={[SESSIONS_CRUMB, { label: show.name }]} title={show.name}>
        <p className="ak-list-facts">
          {campaignLabel(show) && <span>{campaignLabel(show)}</span>}
          <span>{showFacts(show)}</span>
        </p>
      </ListingHead>
      {show.seasons.map((season) => (
        <Season key={season.number} show={show} season={season} level="h2" />
      ))}
    </PageLayout>
  );
}

/** Characters, locations, factions or items: a faint label, then a chip each. */
function ChipGroup({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="ak-chip-group">
      <dt>{label}</dt>
      <dd>
        <ul>
          {items.map((item) => (
            <li key={item} className="ak-chip">
              {item}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

/** /chronicle/$show/$episode: one episode's summary. */
export function EpisodeDetail({
  show,
  season,
  episode,
}: {
  show: ChronicleShow;
  season: ChronicleSeason;
  episode: ChronicleEpisode;
}) {
  const crumbs: ListCrumb[] = [
    SESSIONS_CRUMB,
    { label: show.name, href: `/chronicle/${show.show}` },
    { label: `Season ${season.number}`, href: `/chronicle/${show.show}#${seasonId(season)}` },
  ];
  const groups = [
    { label: "Characters", items: episode.charactersPresent },
    { label: "Locations", items: episode.locations },
    { label: "Factions", items: episode.factions },
    { label: "Items", items: episode.items },
  ].filter((g) => g.items.length > 0);
  return (
    <PageLayout graph={false}>
      <ListingHead crumbs={crumbs} title={episode.title}>
        <p className="ak-list-facts">
          <span>{show.name}</span>
          <span>
            Season {season.number}, episode {episode.episodeNumber}
          </span>
          <time dateTime={episode.date}>{dayInWords(episode.date)}</time>
        </p>
      </ListingHead>

      <div className="ak-episode">
        {episode.synopsis && <p className="ak-episode-synopsis">{episode.synopsis}</p>}

        {episode.keyBeats.length > 0 && (
          <section aria-labelledby="ak-key-beats">
            <h2 className="ak-episode-heading" id="ak-key-beats">
              Key beats
            </h2>
            <ol className="ak-beats">
              {episode.keyBeats.map((beat, i) => (
                // oxlint-disable-next-line react/no-array-index-key -- a static list in source order with no unique id; it never reorders
                <li key={i}>{beat}</li>
              ))}
            </ol>
          </section>
        )}

        {groups.length > 0 && (
          <dl className="ak-chip-groups">
            {groups.map((g) => (
              <ChipGroup key={g.label} label={g.label} items={g.items} />
            ))}
          </dl>
        )}

        {episode.cliffhanger && (
          <aside className="ak-cliffhanger" aria-label="Cliffhanger">
            <p className="ak-cliffhanger-label">Cliffhanger</p>
            <p>{episode.cliffhanger}</p>
          </aside>
        )}

        {episode.href && (
          <div className="ak-actions">
            <a className="ak-button ak-button-primary" href={episode.href}>
              Read the transcript
            </a>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
