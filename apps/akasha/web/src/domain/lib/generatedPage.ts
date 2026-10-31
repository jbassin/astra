/**
 * The serializable page record build-content writes into `src/generated/site.ts` (`PAGES`)
 * and runtimeSite reconstructs a {@link SiteDoc} from. Dates are ISO strings and slugs plain
 * strings, so the generated JSON literal type-checks; empty optional lists are omitted.
 */
import type { SiteDoc } from "./site";

export interface GeneratedPage {
  rel: string;
  slug: string;
  simple: string;
  title: string;
  tags: string[];
  aliases: string[];
  img?: string;
  links: string[];
  date?: string;
  /** The campaign slugs the page draws on, oldest first; omitted when there are none. */
  campaigns?: string[];
}

export const toGenerated = (d: SiteDoc): GeneratedPage => ({
  rel: d.rel,
  slug: d.slug,
  simple: d.simple,
  title: d.title,
  tags: d.tags,
  aliases: d.aliases,
  ...(d.img ? { img: d.img } : {}),
  links: d.links,
  ...(d.date ? { date: d.date.toISOString() } : {}),
  ...(d.campaigns.length > 0 ? { campaigns: d.campaigns } : {}),
});
