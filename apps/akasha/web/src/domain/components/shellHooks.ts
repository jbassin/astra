// Small hooks the shell's components share: the page on screen and the section counts.
import { useLoaderData, useRouterState } from "@tanstack/react-router";

import type { SectionCounts } from "@/domain/lib/sections";

/** The deepest route match's `slug` (the same value `<body data-slug>` carries). */
export function useCurrentSlug(): string {
  return useRouterState({
    select: (s) => {
      for (let i = s.matches.length - 1; i >= 0; i--) {
        const ld = s.matches[i]?.loaderData as { slug?: string } | undefined;
        if (ld?.slug) return ld.slug;
      }
      return "";
    },
  });
}

/** Pages per section from the root loader, or null when the server call failed. */
export function useSectionCounts(): SectionCounts | null {
  return useLoaderData({ from: "__root__", select: (d) => d.sectionCounts });
}
