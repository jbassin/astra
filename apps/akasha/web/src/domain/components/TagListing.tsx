// Tag pages (ports faerrin tags/[...tag].astro). A tag page lists the pages carrying the tag
// (or a tag below it); the tag index shows every tag with its first few pages and a link to
// the rest. Tags belong to no section, so these pages have no crumbs.
import { ListingHead } from "@/domain/components/ListingHead";
import { PageLayout } from "@/domain/components/PageLayout";
import { PageList } from "@/domain/components/PageList";
import { pagesLabel, plural } from "@/domain/lib/listingFormat";
import type { ListingTagIndexView, ListingTagView } from "@/domain/lib/pageData";

/** Pages shown under each tag on the tag index. */
const INDEX_ROWS = 3;

export function TagPage({ view }: { view: ListingTagView }) {
  return (
    <PageLayout>
      <ListingHead label="Tag" title={view.tag} />
      <section className="ak-listing" aria-label={`Pages tagged ${view.tag}`}>
        <p className="ak-listing-count">{pagesLabel(view.entries.length)}</p>
        <PageList entries={view.entries} exceptTag={view.tag} />
      </section>
    </PageLayout>
  );
}

export function TagIndex({ view }: { view: ListingTagIndexView }) {
  return (
    <PageLayout>
      <ListingHead title="Tags">
        <p className="ak-list-lede">
          {plural(view.sections.length, "tag", "tags")}, each with its first pages.
        </p>
      </ListingHead>
      <div className="ak-tag-groups">
        {view.sections.map((s) => {
          const total = s.entries.length + s.overflow;
          return (
            <section key={s.tag} className="ak-tag-group">
              <h2 className="ak-tag-group-title">
                <a href={s.href}>{s.tag}</a>
                <span className="ak-count">{pagesLabel(total)}</span>
              </h2>
              <PageList entries={s.entries.slice(0, INDEX_ROWS)} showTags={false} />
              {total > INDEX_ROWS && (
                <a className="ak-show-all" href={s.href}>
                  Show all {total}
                  <span className="ak-visually-hidden"> pages tagged {s.tag}</span>
                </a>
              )}
            </section>
          );
        })}
      </div>
    </PageLayout>
  );
}
