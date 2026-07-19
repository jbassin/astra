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
import { displayCategoryName } from "@/domain/render/displayCategoryName";
import { capitalize } from "@/domain/render/text";
import { abbreviateBook } from "@/domain/sources/abbreviations";
import { recordSearch } from "@/server/telemetryFns";
import { EditionIcon } from "@/ui";

import {
  groupByCategory,
  loadPagefind,
  NAME_BOOST_HYDRATE_WINDOW,
  NAME_MATCH_PIN_CAP,
  partitionNameMatches,
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
  // D29-81 — how many of `results`' LEADING items are the pinned "Name
  // matches" group (always a prefix of `results`, so keyboard nav's
  // `rankOf`/`highlight` over the full flat array still walks pinned-then-
  // categories in visual top-to-bottom order with no separate index space).
  const [pinnedCount, setPinnedCount] = useState(0);
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
        setPinnedCount(0);
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
      // D29-81 — hydrate a WIDER window than we'll ever display: an
      // exact-name hit can rank below `MAX_RESULTS` (the measured `fireball`
      // case, rank 10), and stub `.data()` is the only way to learn a
      // result's name to check for that in the first place. Still far short
      // of "the full result set" (thousands) — fragments are small.
      const scanCount = Math.min(res.results.length, NAME_BOOST_HYDRATE_WINDOW);
      const stubs = res.results.slice(0, scanCount);
      const fragments = await Promise.all(stubs.map((s) => s.data().catch(() => null)));
      if (token !== tokenRef.current) return;
      const hydrated = fragments.filter((f) => f !== null).map(toDisplayResult);
      const { pinned, rest } = partitionNameMatches(hydrated, trimmed, NAME_MATCH_PIN_CAP);
      // DISPLAY total stays at the pre-boost budget (`MAX_RESULTS`) — a
      // non-name query (`pinned` empty) is byte-identical to the old
      // `hydrated.slice(0, MAX_RESULTS)` since `hydrated`'s first
      // `MAX_RESULTS` entries are exactly the old `stubs.slice(0,
      // MAX_RESULTS)` in the same rank order.
      const display =
        pinned.length > 0
          ? [...pinned, ...rest.slice(0, MAX_RESULTS - pinned.length)]
          : hydrated.slice(0, MAX_RESULTS);
      setResults(display);
      setPinnedCount(pinned.length);
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

  // D29-81 — `results` is [pinned..., categorized...]; slice the pinned
  // prefix off before grouping so it never also appears inside a category
  // group below (the "pinned hits are not repeated below" dedupe).
  const pinnedGroup = useMemo(() => results.slice(0, pinnedCount), [results, pinnedCount]);
  const categoryResults = useMemo(() => results.slice(pinnedCount), [results, pinnedCount]);
  const groups = useMemo(() => groupByCategory(categoryResults), [categoryResults]);
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

  // Shared row markup for both the pinned "Name matches" group and the
  // regular category groups below it (D29-81) — factored out rather than
  // duplicated inline across the two `.map` calls.
  function renderRow(item: SearchDisplayResult): ReactElement {
    const idx = rankOf.get(item.id) ?? -1;
    return (
      <li key={item.id}>
        <a
          href={item.url}
          aria-current={idx === highlight ? "true" : undefined}
          className={
            idx === highlight ? "codex-omnibar-row codex-omnibar-row-active" : "codex-omnibar-row"
          }
          onMouseEnter={() => setHighlight(idx)}
          onClick={() => setOpen(false)}
        >
          <span className="codex-omnibar-row-name">
            {item.name}
            {collisions.has(item.name) ? (
              <span className="codex-listing-collision" title={item.book}>
                {" "}
                ({abbreviateBook(item.book) ?? item.book})
              </span>
            ) : null}
          </span>
          {item.level !== undefined ? (
            <span className="codex-listing-level">Lvl {item.level}</span>
          ) : null}
          {/* D29-101c render half (P11 S5) — rarity + owning class ONLY
              (level already rendered above; category rides the group
              header, the draft's per-row category would have duplicated
              it). Both are the S1-built `meta.rarity`/`meta.class` search
              index fields, already carried unrendered on
              `SearchDisplayResult` since S1. */}
          {item.rarity !== undefined ? (
            <span className="codex-rarity">{capitalize(item.rarity)}</span>
          ) : null}
          {item.class !== undefined ? (
            <span className="codex-listing-class">{item.class}</span>
          ) : null}
          <EditionIcon edition={item.edition === "remaster" ? "remaster" : "legacy"} />
        </a>
      </li>
    );
  }

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
          {pinnedGroup.length === 0 && groups.length === 0 ? (
            <p className="codex-omnibar-empty">No results.</p>
          ) : (
            <>
              {pinnedGroup.length > 0 ? (
                <div className="codex-omnibar-group codex-omnibar-group-pinned">
                  <h4 className="codex-omnibar-group-title">Name matches</h4>
                  <ul>{pinnedGroup.map(renderRow)}</ul>
                </div>
              ) : null}
              {groups.map((group) => (
                <div key={group.category} className="codex-omnibar-group">
                  <h4 className="codex-omnibar-group-title">
                    {displayCategoryName(group.category)}
                  </h4>
                  <ul>{group.items.map(renderRow)}</ul>
                </div>
              ))}
            </>
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
