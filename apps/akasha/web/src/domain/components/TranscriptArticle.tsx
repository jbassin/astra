// A transcript page (Script/<campaign>/<date>): the episode header, the find field, the lines,
// the player docked to the bottom of the viewport, and beside the lines "What happened" and
// "Speakers". The left rail lists the campaign's sessions.
//
// Everything here renders once on the server. The TranscriptPlayer island then binds to this
// markup imperatively (README trap: a transcript has thousands of lines), so the pieces it
// touches are memoised and never re-render. The right-hand column is part of the page rather
// than PageLayout's right rail, so below 1180 px it sits between the header and the lines
// instead of after 3,000 lines.
import { memo, useEffect, useRef } from "react";

import { SearchIcon } from "@/domain/components/icons";
import { TranscriptPlayer } from "@/domain/components/islands/TranscriptPlayer";
import { PageLayout } from "@/domain/components/PageLayout";
import { RenderedBody } from "@/domain/components/RenderedBody";
import type { ContentView } from "@/domain/lib/runtimeSite";
import { SECTIONS } from "@/domain/lib/sections";
import type {
  SessionsRail,
  TranscriptPageView,
  TranscriptSpeaker,
} from "@/domain/lib/transcriptMeta";

// oxlint-disable-next-line typescript/no-non-null-assertion -- SECTIONS always holds Sessions
const SESSIONS = SECTIONS.find((s) => s.id === "sessions")!;

export function TranscriptArticle({ view, page }: { view: ContentView; page: TranscriptPageView }) {
  return (
    <PageLayout graph={false} leftRail={<SessionsList rail={page.rail} />}>
      <div className="ak-transcript">
        <header className="tp-head popover-hint">
          <nav className="tp-crumbs" aria-label="Breadcrumbs">
            <a href={SESSIONS.href} className="tp-crumb-section">
              {SESSIONS.label}
            </a>
            <span aria-hidden="true">/</span>
            <a href={page.campaignHref}>{page.campaign}</a>
            {page.season !== null && (
              <>
                <span aria-hidden="true">/</span>
                <span>Season {page.season}</span>
              </>
            )}
          </nav>
          <h1 className="tp-title">{page.title}</h1>
          <p className="tp-facts">
            <time dateTime={page.dateTime}>{page.dateLabel}</time>
            {page.sessionLabel && <span>{page.sessionLabel}</span>}
            <span>{page.durationLabel}</span>
          </p>
        </header>
        <TranscriptAside page={page} />
        <div className="tp-body">
          <FindBar />
          {/* The build-rendered lines (transcriptBuild.ts). Not a popover-hint: a wiki link's
              preview of a transcript would otherwise lift every line. */}
          <RenderedBody className="tp-lines" html={view.bodyHtml} popover={false} />
        </div>
      </div>
      <PlayerBar durationSeconds={page.durationSeconds} />
      <TranscriptPlayer />
    </PageLayout>
  );
}

/** "What happened" (when the chronicle has an entry) and "Speakers". */
const TranscriptAside = memo(function TranscriptAside({ page }: { page: TranscriptPageView }) {
  return (
    <aside className="tp-aside ak-rail" aria-label="About this session">
      {page.synopsis && (
        <section className="ak-rail-block">
          <h2 className="ak-rail-title">What happened</h2>
          <p className="tp-synopsis">{page.synopsis}</p>
          {page.chronicleHref && (
            <a className="tp-more" href={page.chronicleHref}>
              Read the full chronicle entry
            </a>
          )}
        </section>
      )}
      <section className="ak-rail-block tp-speakers">
        <h2 className="ak-rail-title">Speakers</h2>
        <ul className="tp-speaker-list">
          {page.speakers.map((s) => (
            <SpeakerRow key={s.user} speaker={s} showPlayer={page.hasCharacters} />
          ))}
        </ul>
        {page.hasCharacters && (
          <label className="tp-names">
            <input type="checkbox" className="tp-names-switch" />
            <span>Show players' names in the transcript</span>
          </label>
        )}
      </section>
    </aside>
  );
});

function SpeakerRow({ speaker, showPlayer }: { speaker: TranscriptSpeaker; showPlayer: boolean }) {
  const label = showPlayer ? `${speaker.char} (${speaker.user})` : speaker.char;
  return (
    <li>
      <label className={`tp-speaker ${speaker.user}`}>
        <input
          type="checkbox"
          defaultChecked
          data-speaker={speaker.user}
          aria-label={`Show lines by ${label}`}
        />
        <span className="tp-speaker-name">{speaker.char}</span>
        {showPlayer && <span className="tp-speaker-player">{speaker.user}</span>}
        <span className="tp-speaker-lines">{speaker.lines.toLocaleString("en-GB")}</span>
      </label>
    </li>
  );
}

/** The find field above the lines; the island wires it up. */
const FindBar = memo(function FindBar() {
  return (
    <search className="tp-find">
      <label className="tp-find-field">
        <SearchIcon />
        <input
          type="search"
          className="tp-search-input"
          placeholder="Find in this transcript"
          aria-label="Find in this transcript"
          aria-keyshortcuts="/"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="tp-search-count" aria-live="polite" />
      </label>
      <button type="button" className="tp-find-nav tp-search-prev" aria-label="Previous match">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      <button type="button" className="tp-find-nav tp-search-next" aria-label="Next match">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
    </search>
  );
});

/** h:mm:ss, as the line times and the player show it. */
function clock(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(t / 3600)}:${pad(Math.floor((t / 60) % 60))}:${pad(t % 60)}`;
}

const strokeIcon = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** The player docked to the bottom of the viewport; the island drives it. */
const PlayerBar = memo(function PlayerBar({ durationSeconds }: { durationSeconds: number }) {
  const total = clock(durationSeconds);
  return (
    <section
      className="transcript-player"
      aria-label="Session recording"
      data-duration={durationSeconds}
    >
      <div className="tp-controls">
        <button type="button" className="tp-skip tp-back" aria-label="Back 10 seconds">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path {...strokeIcon} d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path {...strokeIcon} d="M3 3v5h5" />
          </svg>
        </button>
        <button type="button" className="tp-play" aria-label="Play" aria-keyshortcuts="Space">
          <svg
            className="tp-icon-play"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
          </svg>
          <svg
            className="tp-icon-pause"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        </button>
        <button type="button" className="tp-skip tp-fwd" aria-label="Forward 10 seconds">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path {...strokeIcon} d="M21 12a9 9 0 1 1-3-6.7L21 8" />
            <path {...strokeIcon} d="M21 3v5h-5" />
          </svg>
        </button>
      </div>
      <div className="tp-timeline">
        <span className="tp-time tp-current">0:00:00</span>
        <input
          type="range"
          className="tp-scrubber"
          min="0"
          max="100"
          step="0.01"
          defaultValue="0"
          aria-label="Position in the recording"
          aria-valuetext={`0:00:00 of ${total}`}
        />
        <span className="tp-time tp-total">{total}</span>
      </div>
      <div className="tp-options">
        <button type="button" className="tp-speed">
          <span className="ak-visually-hidden">Playback speed </span>
          <span className="tp-speed-value">1×</span>
        </button>
        <button
          type="button"
          className="tp-follow"
          aria-pressed="false"
          aria-keyshortcuts="F"
          title="Keep the playing line in view"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path {...strokeIcon} strokeWidth={2} d="M12 5v14M5 12l7 7 7-7" />
          </svg>
          <span>Follow along</span>
        </button>
      </div>
    </section>
  );
});

/** The left rail: the campaign's sessions, by season where the chronicle knows them. */
function SessionsList({ rail }: { rail: SessionsRail }) {
  const navRef = useRef<HTMLElement>(null);
  // Scroll the rail (never the window) so the current session sits in its upper third.
  useEffect(() => {
    const nav = navRef.current;
    const scroller = nav?.closest<HTMLElement>(".ak-rail-left");
    const item = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!scroller || !item || scroller.scrollHeight <= scroller.clientHeight) return;
    const top = item.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (top >= 0 && top + item.offsetHeight <= scroller.clientHeight) return;
    scroller.scrollTop += top - scroller.clientHeight / 3;
  }, []);

  return (
    <nav
      ref={navRef}
      className="tp-sessions"
      aria-label={`${rail.heading} sessions`}
      style={{ "--hue": SESSIONS.hue }}
    >
      <p className="tp-sessions-head">
        <span className="ak-dot" aria-hidden="true" />
        <a href={rail.href}>{rail.heading}</a>
      </p>
      <p className="tp-sessions-sub">{rail.subtitle}</p>
      {rail.groups.map((g) => {
        const list = (
          <ul className="tp-session-list">
            {g.items.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={item.current ? "tp-session is-current" : "tp-session"}
                  aria-current={item.current ? "page" : undefined}
                >
                  <span className="tp-session-title">{item.title}</span>
                  {item.date && <span className="tp-session-date">{item.date}</span>}
                </a>
              </li>
            ))}
          </ul>
        );
        if (g.label === null) return <div key="all">{list}</div>;
        return (
          <details key={g.label} className="tp-season" open={g.open}>
            <summary>
              {g.number !== null && g.label !== `Season ${g.number}` && (
                <span className="tp-season-number">
                  <span className="ak-visually-hidden">Season </span>
                  {g.number}
                  <span className="ak-visually-hidden">: </span>
                </span>
              )}
              <span>{g.label}</span>
            </summary>
            {list}
          </details>
        );
      })}
    </nav>
  );
}
