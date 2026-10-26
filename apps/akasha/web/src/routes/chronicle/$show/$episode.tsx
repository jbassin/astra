import { createFileRoute, notFound } from "@tanstack/react-router";

import { EpisodeDetail } from "@/domain/components/Chronicle";
import { getChronicleEpisode } from "@/domain/lib/pageDataFns";
import { pageData } from "@/domain/lib/staleBuild";

// /chronicle/<show>/<episode> — one episode's full detail. `episode` is the
// session date; the server function locates it (and its season) within the show.
export const Route = createFileRoute("/chronicle/$show/$episode")({
  loader: async ({ params }) => {
    const page = pageData(
      await getChronicleEpisode({ data: { show: params.show, episode: params.episode } }),
    );
    if (!page) throw notFound();
    return page;
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
