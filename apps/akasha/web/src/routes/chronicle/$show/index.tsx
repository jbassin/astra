import { createFileRoute, notFound } from "@tanstack/react-router";

import { ShowChronicle } from "@/domain/components/Chronicle";
import { getChronicleShow } from "@/domain/lib/pageDataFns";
import { pageData } from "@/domain/lib/staleBuild";

// /chronicle/<show> — one show's seasons, each with a row per episode (0019).
export const Route = createFileRoute("/chronicle/$show/")({
  loader: async ({ params }) => {
    const show = pageData(await getChronicleShow({ data: params.show }));
    if (!show) throw notFound();
    return { slug: `chronicle/${show.show}`, show };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.show.name ?? "Sessions"} — Sessions — Akasha` }],
  }),
  component: ShowChroniclePage,
});

function ShowChroniclePage() {
  const { show } = Route.useLoaderData();
  return <ShowChronicle show={show} />;
}
