// P3 S4 (D29-36) — the header search omnibar, mounted on every page
// (`__root.tsx`). Lazy-loads the Pagefind runtime on FIRST FOCUS (never
// eagerly — `pagefindClient.ts`'s own file header on why), 180ms-debounced
// type-ahead with a token/sequence stale-guard, results grouped by category
// (top ~8 overall, `pagefindClient.ts`'s `groupByCategory`), the M5
// same-name-book-inline collision rule (the SAME `collidingNames` helper
// D29-35 built for listings — extended to search per that adversarial note,
// not a second implementation), full keyboard nav (arrows/Enter/Esc,
// Ctrl/Cmd-K global focus — akasha's own muscle-memory precedent), and the
// D29-34 fail-soft disabled state when the index isn't built.
//
// P4.5 D29-48's original R3 carve-out ("search NEVER hides superseded
// content by default") is AMENDED by P6 R11 (D29-67): the omnibar now hides
// superseded content by default too, matching every other surface. It has
// no reveal control of its own (that lives on the full `/search` page,
// `SearchPage.tsx`) and no URL/facet state to read it from, so it always
// passes the fixed `supersededFilter(false)` value — `pagefindClient.ts`'s
// helper, the same one `/search` wires against its own live `superseded`
// state.

import { useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import { collidingNames } from "@/domain/browse/filterEngine";
import { humanizeSlug } from "@/domain/render/text";
import { recordSearch } from "@/server/telemetryFns";

import {
  groupByCategory,
  loadPagefind,
  supersededFilter,
  toDisplayResult,
  type SearchDisplayResult,
} from "./pagefindClient";

const MAX_RESULTS = 8;
const DEBOUNCE_MS = 180;

export function Omnibar(): ReactElement {
  const navigate = useNavigate();

  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchDisplayResult[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [highlight, setHighlight] = useState(-1); // -1 = nothing highlighted
  const timerRef = useRef<number | undefined>(undefined);
  const tokenRef = useRef(0);

  const ensureLoaded = useCallback(async () => {
    const pf = await loadPagefind();
    if (!pf) setDisabled(true);
    return pf;
  }, []);

  const runSearch = useCallback(
    async (term: string) => {
      const token = ++tokenRef.current;
      const trimmed = term.trim();
      if (trimmed === "") {
        setResults([]);
        setHighlight(-1);
        return;
      }
      const pf = await ensureLoaded();
      if (!pf || token !== tokenRef.current) return;
      // "count executed searches (debounced executions, not keystrokes)" —
      // fired exactly once per debounced, non-empty, successfully-loaded
      // search attempt (D29-38). Fire-and-forget: telemetry must never block
      // or fail the actual search UX.
      void recordSearch({ data: { surface: "omnibar" } }).catch(() => undefined);
      // R11 (D29-67): always hide superseded content — the omnibar carries
      // no reveal state of its own, so this is a fixed `false`, never a
      // live toggle.
      const supersededFilterValue = supersededFilter(false);
      const searchOptions =
        supersededFilterValue !== undefined
          ? { filters: { superseded: supersededFilterValue } }
          : {};
      const res = await pf.search(trimmed, searchOptions).catch(() => null);
      if (!res || token !== tokenRef.current) return;
      const stubs = res.results.slice(0, MAX_RESULTS);
      // One fragment fetch per SHOWN result only (D29-34/-36) — never the
      // full result set, which can run into the thousands.
      const fragments = await Promise.all(stubs.map((s) => s.data().catch(() => null)));
      if (token !== tokenRef.current) return;
      setResults(fragments.filter((f) => f !== null).map(toDisplayResult));
      setHighlight(-1);
    },
    [ensureLoaded],
  );

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setQuery(next);
    setOpen(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void runSearch(next), DEBOUNCE_MS);
  };

  const onFocus = () => {
    setOpen(true);
    void ensureLoaded();
  };

  const onBlur = () => {
    // A short delay so a mousedown on a dropdown row/button still registers
    // as a click before the dropdown unmounts.
    window.setTimeout(() => setOpen(false), 150);
  };

  const groups = useMemo(() => groupByCategory(results), [results]);
  const collisions = useMemo(() => collidingNames(results), [results]);
  const rankOf = useMemo(() => {
    const m = new Map<string, number>();
    results.forEach((r, i) => m.set(r.id, i));
    return m;
  }, [results]);
  // The "all results" row sits one past the last real result in the
  // keyboard-nav order.
  const allResultsIndex = results.length;

  const goToAllResults = useCallback(() => {
    setOpen(false);
    const q = query.trim();
    void navigate({ to: "/search", search: q === "" ? {} : { q } });
  }, [navigate, query]);

  const goToResult = useCallback((url: string) => {
    setOpen(false);
    window.location.assign(url);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, allResultsIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight === -1 || highlight === allResultsIndex) {
        goToAllResults();
      } else {
        const target = results[highlight];
        if (target) goToResult(target.url);
        else goToAllResults();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
      inputRef.current?.blur();
    }
  };

  // Ctrl/Cmd-K global focus (SSR-safe: an effect never runs during SSR).
  useEffect(() => {
    const onGlobalKeydown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onGlobalKeydown);
    return () => {
      document.removeEventListener("keydown", onGlobalKeydown);
      window.clearTimeout(timerRef.current);
    };
  }, []);

  const showDropdown = open && !disabled && query.trim() !== "";

  return (
    <div className="codex-omnibar">
      <input
        ref={inputRef}
        type="search"
        className="codex-omnibar-input"
        placeholder={disabled ? "Search unavailable" : "Search the codex… (Ctrl+K)"}
        aria-label="Search the codex"
        autoComplete="off"
        value={query}
        disabled={disabled}
        title={disabled ? "Search index not built" : undefined}
        onChange={onInputChange}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      {showDropdown ? (
        <div className="codex-omnibar-dropdown" aria-label="Search results">
          {groups.length === 0 ? (
            <p className="codex-omnibar-empty">No results.</p>
          ) : (
            groups.map((group) => (
              <div key={group.category} className="codex-omnibar-group">
                <h4 className="codex-omnibar-group-title">{humanizeSlug(group.category)}</h4>
                <ul>
                  {group.items.map((item) => {
                    const idx = rankOf.get(item.id) ?? -1;
                    return (
                      <li key={item.id}>
                        <a
                          href={item.url}
                          aria-current={idx === highlight ? "true" : undefined}
                          className={
                            idx === highlight
                              ? "codex-omnibar-row codex-omnibar-row-active"
                              : "codex-omnibar-row"
                          }
                          onMouseEnter={() => setHighlight(idx)}
                          onClick={() => setOpen(false)}
                        >
                          <span className="codex-omnibar-row-name">
                            {item.name}
                            {collisions.has(item.name) ? (
                              <span className="codex-listing-collision"> ({item.book})</span>
                            ) : null}
                          </span>
                          {item.level !== undefined ? (
                            <span className="codex-listing-level">Lvl {item.level}</span>
                          ) : null}
                          <span className={`codex-edition-pill codex-edition-${item.edition}`}>
                            {item.edition === "remaster" ? "Remaster" : "Legacy"}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          <button
            type="button"
            aria-current={highlight === allResultsIndex ? "true" : undefined}
            className={
              highlight === allResultsIndex
                ? "codex-omnibar-all-results codex-omnibar-row-active"
                : "codex-omnibar-all-results"
            }
            onMouseEnter={() => setHighlight(allResultsIndex)}
            onClick={goToAllResults}
          >
            All results for &ldquo;{query.trim()}&rdquo;
          </button>
        </div>
      ) : null}
    </div>
  );
}
