import { createFileRoute } from "@tanstack/react-router";
import { ChronicleIndex } from "@/domain/components/Chronicle";
import { SHOWS } from "@/generated/chronicle";

// /chronicle — the campaign timeline shows index (0019). Lists every show, main first.
export const Route = createFileRoute("/chronicle/")({
  loader: () => ({ slug: "chronicle", shows: SHOWS }),
  head: () => ({ meta: [{ title: "Chronicle — Akasha" }] }),
  component: ChroniclePage,
});

function ChroniclePage() {
  const { shows } = Route.useLoaderData();
  return <ChronicleIndex shows={shows} />;
}
