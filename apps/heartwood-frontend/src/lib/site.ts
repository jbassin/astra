// Static site metadata (brand + description). Heartwood has no build-time generated
// modules — its content (the staged proposals) is read at runtime via server fns — so
// this small constant stands in for the other frontends' generated `SITE`.
export const SITE = {
  title: "Heartwood",
  description: "Review LLM-proposed changes to the akasha setting wiki, then write them back.",
} as const;
