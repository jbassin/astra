import { createFileRoute } from "@tanstack/react-router";

import { ChronicleIndex } from "@/domain/components/Chronicle";
import { getChronicleIndex } from "@/domain/lib/pageDataFns";

// /chronicle — the campaign timeline shows index (0019). Lists every show, main first.
export const Route = createFileRoute("/chronicle/")({
  loader: async () => ({ slug: "chronicle", shows: await getChronicleIndex() }),
  head: () => ({ meta: [{ title: "Chronicle — Akasha" }] }),
  component: ChroniclePage,
});

function ChroniclePage() {
  const { shows } = Route.useLoaderData();
  return <ChronicleIndex shows={shows} />;
}
