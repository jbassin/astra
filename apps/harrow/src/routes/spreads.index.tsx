import { createFileRoute } from "@tanstack/react-router";

import { SpreadFeatured } from "@/domain/components/SpreadFeatured";

// /spreads — the featured (most-recent) curated spread.
export const Route = createFileRoute("/spreads/")({
  component: SpreadFeatured,
});
