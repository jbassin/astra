/** One linked site on the ledger landing page. `key` names the target's config
 *  namespace (its `href` is that namespace's public-origin, read at build time —
 *  config-single-source); `title`/`blurb`/order are ledger-owned content. */
export interface SiteLink {
  key: string;
  title: string;
  blurb: string;
  href: string;
}
