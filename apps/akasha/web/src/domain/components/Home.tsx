// The home page (`/`): the hero (the wordmark, the lede and the section spectrum), the
// latest session with the four before it, the wiki pages updated after it, and the wiki's
// own front page (the "Recovered Log" handout). Full width: no rails (PageLayout
// `rails={false}`). The data comes from `homePageData` (pageData.ts); the page counts come
// from the root loader.
import { PageLayout } from "@/domain/components/PageLayout";
import { RenderedBody } from "@/domain/components/RenderedBody";
import { useSectionCounts } from "@/domain/components/shellHooks";
import { dayInWords, pagesLabel } from "@/domain/lib/listingFormat";
import type { HomePageData } from "@/domain/lib/pageData";
import { SECTIONS, type SectionCounts, type SectionId } from "@/domain/lib/sections";

const LEDE =
  "Everything the table knows about Færrin: its places, people and powers, and a full transcript of every session we have recorded.";

// The spectrum leaves out Timeline: one page, with no hue of its own.
const SPECTRUM = SECTIONS.filter((s) => s.id !== "timeline");

const sectionById = (id: SectionId) => SECTIONS.find((s) => s.id === id);

/**
 * One segment per section, as wide as its share of the pages, linking to the section. On
 * phones the segments become a two-column list (each bar a dot) under one unlabelled strip
 * that keeps the proportions (home.css).
 */
function Spectrum({ counts }: { counts: SectionCounts | null }) {
  return (
    <nav className="ak-spectrum" aria-label="Sections">
      <div className="ak-spectrum-strip" aria-hidden="true">
        {SPECTRUM.map((s) => (
          <span key={s.id} style={{ "--hue": s.hue, flexGrow: counts?.[s.id] ?? 1 }} />
        ))}
      </div>
      <ul>
        {SPECTRUM.map((s) => {
          const n = counts?.[s.id] ?? null;
          return (
            <li key={s.id} style={{ "--hue": s.hue, flexGrow: n ?? 1 }}>
              <a href={s.href}>
                <span className="ak-spectrum-bar" aria-hidden="true" />
                <span className="ak-spectrum-label">{s.label}</span>
                {n !== null && (
                  <span className="ak-spectrum-count">{pagesLabel(n, s.id === "sessions")}</span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function LatestSession({ latest }: { latest: NonNullable<HomePageData["latest"]> }) {
  return (
    <div className="ak-latest">
      <h2 className="ak-home-heading">Latest session</h2>
      <p className="ak-latest-facts">
        <a className="ak-latest-show" href={`/chronicle/${latest.show}`}>
          {latest.showName}
        </a>
        <span>
          Season {latest.seasonNumber}, {latest.seasonTitle}
        </span>
        <time dateTime={latest.date}>{dayInWords(latest.date)}</time>
      </p>
      <h3 className="ak-latest-title">
        <a href={latest.chronicleHref}>{latest.title}</a>
      </h3>
      {latest.synopsis && <p className="ak-latest-synopsis">{latest.synopsis}</p>}
      <div className="ak-actions">
        {latest.transcriptHref && (
          <a className="ak-button ak-button-primary" href={latest.transcriptHref}>
            Read the transcript
          </a>
        )}
        <a className="ak-button ak-button-quiet" href={latest.chronicleHref}>
          Read the chronicle entry
        </a>
      </div>
      {latest.earlier.length > 0 && (
        <>
          <h3 className="ak-visually-hidden">Earlier sessions</h3>
          <ul className="ak-earlier">
            {latest.earlier.map((s) => (
              <li key={s.date}>
                <a href={s.href}>
                  <time dateTime={s.date}>{dayInWords(s.date)}</time>
                  <span className="ak-earlier-title">{s.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function UpdatedPages({ updated, date }: { updated: HomePageData["updated"]; date: string }) {
  return (
    <aside className="ak-updated" aria-labelledby="ak-updated-heading">
      <h2 className="ak-home-heading" id="ak-updated-heading">
        Updated after that session
      </h2>
      <p className="ak-updated-sub">Pages the wiki keeper changed on {dayInWords(date)}.</p>
      <ul className="ak-updated-list">
        {updated.map((p) => {
          const section = sectionById(p.section);
          return (
            <li key={p.href}>
              <a href={p.href} style={{ "--hue": section?.hue }}>
                <span className="ak-dot" aria-hidden="true" />
                <span className="ak-updated-name">{p.title}</span>
                <span className="ak-updated-section">{section?.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export function Home({ data }: { data: HomePageData }) {
  const counts = useSectionCounts();
  const { view, latest, updated } = data;
  return (
    <PageLayout rails={false}>
      <div className="ak-home">
        <section className="ak-hero">
          <h1 className="ak-hero-title">Akasha</h1>
          <p className="ak-hero-lede">{LEDE}</p>
          <Spectrum counts={counts} />
        </section>

        {latest && (
          <section className={updated.length > 0 ? "ak-home-band" : "ak-home-band is-single"}>
            <LatestSession latest={latest} />
            {updated.length > 0 && <UpdatedPages updated={updated} date={latest.date} />}
          </section>
        )}

        {view.bodyHtml && (
          <section className="ak-home-band ak-home-archive">
            {/* The wiki's front page, rendered at build time (its own title header is hidden
                in home.css; the aside names it). */}
            <RenderedBody className="ak-home-body" html={view.bodyHtml} />
            <aside className="ak-home-archive-note">
              <h2 className="ak-home-heading">{view.title}</h2>
              <p>
                From the front page of the wiki.
                {view.backlinks.length > 0 && (
                  <>
                    {" Mentioned in "}
                    {view.backlinks.map((b, i) => (
                      <span key={b.href}>
                        {i > 0 && (i === view.backlinks.length - 1 ? " and " : ", ")}
                        <a href={b.href}>{b.label}</a>
                      </span>
                    ))}
                    .
                  </>
                )}
              </p>
            </aside>
          </section>
        )}
      </div>
    </PageLayout>
  );
}
