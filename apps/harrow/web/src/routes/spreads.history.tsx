import { createFileRoute } from "@tanstack/react-router";

import { SpreadHistory } from "@/domain/components/SpreadHistory";

// /spreads/history — every curated spread, reverse-chronological.
export const Route = createFileRoute("/spreads/history")({
  component: SpreadHistory,
});
