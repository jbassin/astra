import type { CrossRef as CrossRefNode } from "@astra/vellum-lang";
import { createContext } from "react";

/**
 * The crossref resolver seam (full-vellum §3.2; akasha-frontend 0011 / N3).
 *
 * gothic deliberately does NOT know how to turn a `[[target]]` into a URL (L6 —
 * that's the consuming app's job, computed from akasha-backend's resolved
 * `edges` + the lifted `slug.ts`). But a consumer that DOES know can inject a
 * resolver: `<DocumentView resolveCrossref={fn} />` makes every nested
 * `<CrossRef>` render a real `<a href>` instead of the unresolved placeholder.
 *
 * The resolver is a pure function `node -> {href} | null`. Returning `null`
 * (the default — no provider) keeps the placeholder `<span>`, so gothic's
 * stand-alone behaviour and the vellum-frontend render service are unchanged.
 *
 * It MUST be deterministic across SSR + hydration (close over a static
 * build-time edge map, not request state) or React will warn on a mismatch.
 */
export type CrossRefResolution = { href: string };

export type CrossRefResolver = (node: CrossRefNode) => CrossRefResolution | null;

/** Provided by `<DocumentView resolveCrossref>`; consumed by `<CrossRef>`. */
export const CrossRefResolverContext = createContext<CrossRefResolver | null>(null);
