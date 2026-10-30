// The wiki page's right-rail blocks, above the "Connections" graph that PageLayout adds:
// "On this page" (the body's headings and block titles, from two entries up), "Sessions"
// (which session transcripts link here, with the main campaign as a strip of ticks) and
// "Mentioned on" (the wiki pages that link here). Each block hides when it has nothing to show.
// Every href and label is pre-resolved in runtimeSite's contentView.
import { SidebarImage } from "@/domain/components/SidebarImage";
import type { PageLinkView, SessionsView, TocEntry } from "@/domain/lib/runtimeSite";
import { SECTIONS, type SectionId } from "@/domain/lib/sections";

/** How many "Mentioned on" pages show before "Show all". */
const MENTIONS_SHOWN = 6;

const hueOf = (id: SectionId | null) => SECTIONS.find((s) => s.id === id)?.hue;

function OnThisPage({ toc }: { toc: TocEntry[] }) {
  if (toc.length < 2) return null;
  // Indent only below the page's top heading level: a page of h3s lists them flush.
  const top = Math.min(...toc.map((e) => e.level));
  return (
    <section className="ak-rail-block ak-toc">
      <h2 className="ak-rail-title">On this page</h2>
      <ol>
        {toc.map((e) => (
          <li key={e.id} className={e.level > top ? "ak-toc-sub" : undefined}>
            <a href={`#${e.id}`}>{e.text}</a>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Sessions({ sessions }: { sessions: SessionsView | null }) {
  if (!sessions) return null;
  const { strip, sessions: list } = sessions;
  return (
    <section className="ak-rail-block ak-sessions">
      <h2 className="ak-rail-title">
        Sessions
        <span className="ak-count">
          {strip ? `${strip.hits} of ${strip.ticks.length}` : list.length}
        </span>
      </h2>
      {strip && (
        <>
          <p className="ak-visually-hidden">
            {`Mentioned in ${strip.hits} of ${strip.ticks.length} sessions of ${strip.show}, ` +
              `${strip.start} to ${strip.end}.`}
          </p>
          <div className="ak-ticks" aria-hidden="true">
            {strip.ticks.map((t) => (
              <i key={t.date} className={t.hit ? "hit" : undefined} />
            ))}
          </div>
          <p className="ak-tick-axis" aria-hidden="true">
            <span>{strip.start}</span>
            <span>{strip.end}</span>
          </p>
        </>
      )}
      <details className="ak-rail-more">
        <summary>
          {list.length === 1 ? "Show the session" : `Show the ${list.length} sessions`}
        </summary>
        <ul className="ak-session-list">
          {list.map((s) => (
            <li key={s.href}>
              <a href={s.href}>
                <span className="ak-session-meta">
                  <time>{s.date}</time>
                  {s.show && <span>{s.show}</span>}
                </span>
                {s.title && <span className="ak-session-title">{s.title}</span>}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function PageLinks({ links }: { links: PageLinkView[] }) {
  return (
    <ul className="ak-page-links">
      {links.map((b) => (
        <li key={b.href}>
          <a href={b.href} className="internal" style={{ "--hue": hueOf(b.section) }}>
            <span className="ak-dot" aria-hidden="true" />
            {b.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function MentionedOn({ backlinks }: { backlinks: PageLinkView[] }) {
  if (backlinks.length === 0) return null;
  const n = backlinks.length;
  return (
    <section className="ak-rail-block ak-mentions">
      <h2 className="ak-rail-title">
        Mentioned on<span className="ak-count">{n === 1 ? "1 page" : `${n} pages`}</span>
      </h2>
      <PageLinks links={backlinks.slice(0, MENTIONS_SHOWN)} />
      {n > MENTIONS_SHOWN && (
        <details className="ak-rail-more">
          <summary>{`Show all ${n}`}</summary>
          <PageLinks links={backlinks.slice(MENTIONS_SHOWN)} />
        </details>
      )}
    </section>
  );
}

export function WikiRail({
  img,
  toc,
  sessions,
  backlinks,
}: {
  img?: string;
  toc: TocEntry[];
  sessions: SessionsView | null;
  backlinks: PageLinkView[];
}) {
  return (
    <>
      <SidebarImage img={img} />
      <OnThisPage toc={toc} />
      <Sessions sessions={sessions} />
      <MentionedOn backlinks={backlinks} />
    </>
  );
}
