import { useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState, type FormEvent, type ReactElement } from "react";

import { loadPagefind } from "./pagefindClient";

/**
 * P4.5 S2 (D29-47, adversarial M3) — the landing page's DISTINCT hero search
 * box. This is deliberately NOT a second `<Omnibar>` mount: `Omnibar.tsx`
 * registers a global `document` Ctrl/Cmd-K keydown listener in a per-instance
 * `useEffect` (~L159-171) — a second instance would double-register and the
 * two would race for focus. `HeroSearch` shares the SAME memoized
 * `loadPagefind()` module promise (so the Pagefind runtime still loads at
 * most once per page load regardless of which search surface warms it
 * first — first focus here just as eagerly as the header Omnibar's own
 * `onFocus`) but owns no `document`-level listener at all: Ctrl/Cmd-K stays
 * the header Omnibar's alone (the S2 gate proves exactly one such listener
 * is registered on `/`).
 *
 * It also renders no live type-ahead dropdown of its own — that full
 * ranked-result UI (grouping/collision/edition pills) has exactly one real
 * implementation, the header Omnibar (plus `/search`'s own page); the hero
 * box's only job is to get the visitor to `/search?q=...`, at hero/tile
 * scale (bigger input, its own styling), never a second copy of that logic.
 */
export function HeroSearch(): ReactElement {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const warmedRef = useRef(false);

  const warm = useCallback(() => {
    if (warmedRef.current) return;
    warmedRef.current = true;
    void loadPagefind();
  }, []);

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const q = query.trim();
      void navigate({ to: "/search", search: q === "" ? {} : { q } });
    },
    [navigate, query],
  );

  return (
    <form className="codex-hero-search" onSubmit={onSubmit}>
      <input
        type="search"
        className="codex-hero-search-input"
        placeholder="Search the codex…"
        aria-label="Search the codex"
        autoComplete="off"
        value={query}
        onFocus={warm}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button type="submit" className="codex-hero-search-button">
        Search
      </button>
    </form>
  );
}
