import { createFileRoute, notFound } from "@tanstack/react-router";

import { EpisodeDetail } from "@/domain/components/Chronicle";
import { SHOWS } from "@/generated/chronicle";

// /chronicle/<show>/<episode> — one episode's full detail (0019). `episode` is the
// session date; we locate it (and its season) within the show.
export const Route = createFileRoute("/chronicle/$show/$episode")({
  loader: ({ params }) => {
    const show = SHOWS.find((s) => s.show === params.show);
    if (!show) throw notFound();
    for (const season of show.seasons) {
      const episode = season.episodes.find((e) => e.date === params.episode);
      if (episode) {
        // slug nests under the season (matches the Explorer tree node) so the current
        // episode's folders auto-open and the leaf highlights active.
        return {
          slug: `chronicle/${show.show}/s${season.number}/${episode.date}`,
          show,
          season,
          episode,
        };
      }
    }
    throw notFound();
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.episode.title} — ${loaderData.show.name} — Akasha`
          : "Chronicle — Akasha",
      },
    ],
  }),
  component: EpisodePage,
});

function EpisodePage() {
  const { show, season, episode } = Route.useLoaderData();
  return <EpisodeDetail show={show} season={season} episode={episode} />;
}
