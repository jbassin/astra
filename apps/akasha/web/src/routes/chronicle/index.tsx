import { createFileRoute } from "@tanstack/react-router";

import { ChronicleIndex } from "@/domain/components/Chronicle";
import { getChronicleIndex } from "@/domain/lib/pageDataFns";
import { pageData } from "@/domain/lib/staleBuild";

// /chronicle — Sessions: the main campaign's seasons and episodes, then the other shows (0019).
export const Route = createFileRoute("/chronicle/")({
  loader: async () => ({ slug: "chronicle", shows: pageData(await getChronicleIndex()) }),
  head: () => ({ meta: [{ title: "Sessions — Akasha" }] }),
  component: ChroniclePage,
});

function ChroniclePage() {
  const { shows } = Route.useLoaderData();
  return <ChronicleIndex shows={shows} />;
}
