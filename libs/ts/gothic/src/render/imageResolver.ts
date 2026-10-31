import { createContext } from "react";

/**
 * The image resolver seam, the twin of the crossref resolver.
 *
 * gothic never fetches from another origin: without a resolver an `![alt](src)` renders its
 * alt text only, so the vellum render service, Storybook and every app that ships no images
 * are unchanged. An app that ships image files itself (akasha-frontend, from astra-data's
 * `akasha/assets/`) injects `<DocumentView resolveImage={fn} />`; `fn` maps the author's
 * path to the URL the app serves it at, or returns null for a path it doesn't ship.
 *
 * gothic renders the `<img>` only when the resolved `src` is a same-origin absolute path
 * (`/…`, never `//host`), so a resolver bug can't make a page fetch from elsewhere. Like the
 * crossref resolver it must be deterministic (a static build-time map), or hydration warns.
 */
export interface ImageResolution {
  /** The same-origin URL path the app serves the file at, e.g. `/assets/wiki/map.3f2a.png`. */
  src: string;
  /** Intrinsic size in pixels, when known: reserves the space before a lazy image loads. */
  width?: number;
  height?: number;
}

export type ImageResolver = (src: string) => ImageResolution | null;

/** Provided by `<DocumentView resolveImage>`; consumed by the image components. */
export const ImageResolverContext = createContext<ImageResolver | null>(null);

/** True for a same-origin absolute path: one leading `/`, not a protocol-relative `//`. */
export function isSameOriginPath(src: string): boolean {
  return src.startsWith("/") && !src.startsWith("//") && !src.startsWith("/\\");
}
