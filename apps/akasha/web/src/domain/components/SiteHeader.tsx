// The sticky site header: the wordmark, the section nav (the current section underlined in
// its hue), the search trigger and the theme button. Below 1100 px the nav and the theme
// button give way to a search icon and the phone menu button (shell.css); the phone menu
// carries the sections and the theme control instead.

import { SearchIcon } from "@/domain/components/icons";
import { PhoneMenu } from "@/domain/components/islands/PhoneMenu";
import { openSearch, SearchTrigger } from "@/domain/components/islands/Search";
import { ThemeToggle } from "@/domain/components/islands/ThemeControls";
import { PageTitle } from "@/domain/components/PageTitle";
import { useCurrentSlug } from "@/domain/components/shellHooks";
import { NAV_DIVIDER_BEFORE, SECTIONS, sectionOf } from "@/domain/lib/sections";

export function SiteHeader() {
  const current = sectionOf(useCurrentSlug())?.id ?? null;
  return (
    <header className="ak-header">
      <div className="ak-header-inner">
        <PageTitle />
        <nav className="ak-nav" aria-label="Sections">
          {SECTIONS.map((s) => (
            <span key={s.id} className="ak-nav-item">
              {s.id === NAV_DIVIDER_BEFORE && <span className="ak-nav-sep" aria-hidden="true" />}
              <a
                href={s.href}
                className={s.id === current ? "ak-nav-link is-current" : "ak-nav-link"}
                aria-current={s.id === current ? "true" : undefined}
                style={{ "--hue": s.hue }}
              >
                {s.label}
              </a>
            </span>
          ))}
        </nav>
        <div className="ak-header-tools">
          <SearchTrigger />
          <button
            type="button"
            className="ak-iconbtn ak-search-icon"
            aria-label="Search"
            onClick={openSearch}
          >
            <SearchIcon size={20} />
          </button>
          <ThemeToggle />
          <PhoneMenu />
        </div>
      </div>
    </header>
  );
}
