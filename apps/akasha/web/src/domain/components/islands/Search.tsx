/**
 * Search over Pagefind. `SearchDialog` is the one Ctrl/Cmd-K modal per page (PageLayout
 * mounts it outside the header, so it still shows when a header part is hidden); the
 * triggers (`SearchTrigger` in the header, the phone header's icon, the phone menu's field)
 * open it through `openSearch()`. The Pagefind runtime (`/pagefind/pagefind.js`, written by
 * scripts/build-search.ts into the client output) is lazy-imported on first open, so reading
 * pages ship no search JS.
 *
 * Every listener goes in the effect cleanup (each page mounts fresh). NOTE: Pagefind indexes
 * the built corpus, so search is empty under `vite dev` until a `build` writes `/pagefind/`.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { SearchIcon } from "@/domain/components/icons";
import { sectionOfHref } from "@/domain/lib/sections";

interface PFResult {
  url: string;
  meta: { title?: string };
  excerpt: string;
}

// Minimal shape of the lazily-imported pagefind runtime.
interface Pagefind {
  options?: (o: Record<string, unknown>) => Promise<void>;
  init?: () => void;
  search: (q: string) => Promise<{ results: { data: () => Promise<PFResult> }[] }>;
}

const OPEN_EVENT = "akasha:open-search";
export const SEARCH_PLACEHOLDER = "Search the wiki and sessions";

/** Opens the page's search dialog (any trigger). */
export function openSearch(): void {
  document.dispatchEvent(new Event(OPEN_EVENT));
}

/** The header's search field look-alike: a button that opens the dialog. */
export function SearchTrigger() {
  return (
    <button type="button" className="ak-search-trigger" onClick={openSearch}>
      <SearchIcon />
      <span className="ak-search-trigger-text">{SEARCH_PLACEHOLDER}</span>
      <kbd className="ak-kbd">Ctrl K</kbd>
    </button>
  );
}

/**
 * A native modal `<dialog>`: the browser makes the page behind it inert, closes it on Escape
 * and returns focus to the trigger. Clicking outside the panel (on the dialog's own padding)
 * closes it too.
 */
export function SearchDialog() {
  const [results, setResults] = useState<PFResult[]>([]);
  const [query, setQuery] = useState("");
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pagefindRef = useRef<Pagefind | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const tokenRef = useRef(0);
  const titleId = useId();

  const ensurePagefind = useCallback(async (): Promise<Pagefind | null> => {
    if (pagefindRef.current) return pagefindRef.current;
    // Built from a variable (+ @vite-ignore) so the bundler can't resolve it at build
    // time — `/pagefind/pagefind.js` is a runtime asset that only exists post-build.
    const pagefindPath = "/pagefind/pagefind.js";
    const pf = (await import(/* @vite-ignore */ pagefindPath)) as Pagefind;
    await pf.options?.({ excerptLength: 25 });
    pf.init?.();
    pagefindRef.current = pf;
    return pf;
  }, []);

  const isOpen = () => dialogRef.current?.open ?? false;

  const showDialog = useCallback(async () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    inputRef.current?.focus();
    await ensurePagefind().catch(() => null);
  }, [ensurePagefind]);

  const closeDialog = useCallback(() => dialogRef.current?.close(), []);

  // Runs on every close (Escape, a click outside, Ctrl-K, a result): reset for next time.
  const onClosed = useCallback(() => {
    tokenRef.current++; // drop any search still in flight
    window.clearTimeout(timerRef.current);
    setResults([]);
    setQuery("");
    setResultsFor(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const runSearch = useCallback(
    async (q: string) => {
      const token = ++tokenRef.current; // discard out-of-order / post-close responses
      if (!q || q.trim().length === 0) {
        setResults([]);
        return;
      }
      const pf = await ensurePagefind().catch(() => null);
      if (!pf || token !== tokenRef.current) return;
      const res = await pf.search(q.trim());
      const data = await Promise.all(res.results.slice(0, 20).map((r) => r.data()));
      if (token !== tokenRef.current || !isOpen()) return;
      setResults(data);
      setResultsFor(q.trim());
    },
    [ensurePagefind],
  );

  const onInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const q = e.currentTarget.value;
      setQuery(q);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void runSearch(q), 180);
    },
    [runSearch],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen()) closeDialog();
        else void showDialog();
      }
    };
    const onOpen = () => void showDialog();
    // A click whose target is the dialog itself landed outside the panel.
    const onClick = (e: MouseEvent) => {
      if (e.target === dialog) closeDialog();
    };
    document.addEventListener("keydown", onKeydown);
    document.addEventListener(OPEN_EVENT, onOpen);
    dialog?.addEventListener("click", onClick);
    dialog?.addEventListener("close", onClosed);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener(OPEN_EVENT, onOpen);
      dialog?.removeEventListener("click", onClick);
      dialog?.removeEventListener("close", onClosed);
      window.clearTimeout(timerRef.current);
    };
  }, [showDialog, closeDialog, onClosed]);

  // Only once a search for the text in the field has come back empty.
  const noResults = query.trim().length > 0 && resultsFor === query.trim() && results.length === 0;

  return (
    <dialog ref={dialogRef} className="ak-search-backdrop" aria-labelledby={titleId}>
      <div className="ak-search-dialog">
        <h2 id={titleId} className="ak-visually-hidden">
          Search
        </h2>
        <label className="ak-search-field">
          <SearchIcon />
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            className="ak-search-input"
            placeholder={SEARCH_PLACEHOLDER}
            aria-label={SEARCH_PLACEHOLDER}
            onInput={onInput}
            // Chrome's autofill can add an empty `style` to a search field before
            // hydration; the field's attributes are static, so the warning is noise.
            suppressHydrationWarning
          />
          <kbd className="ak-kbd">Esc</kbd>
        </label>
        {results.length > 0 && (
          <ul className="ak-search-results">
            {results.map((r) => {
              const href = r.url.replace(/\.html$/, "");
              const section = sectionOfHref(href);
              return (
                <li key={r.url}>
                  <a
                    className="ak-search-result"
                    href={href}
                    style={section ? { "--hue": section.hue } : undefined}
                    onClick={closeDialog}
                  >
                    <span className="ak-search-result-title">
                      {section ? <span className="ak-dot" aria-hidden="true" /> : null}
                      {r.meta.title ?? href}
                      {section ? (
                        <span className="ak-search-result-section">{section.label}</span>
                      ) : null}
                    </span>
                    <span
                      className="ak-search-result-excerpt"
                      // oxlint-disable-next-line react/no-danger -- a Pagefind excerpt; Pagefind escapes the page text
                      dangerouslySetInnerHTML={{ __html: r.excerpt }}
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
        {noResults && <p className="ak-search-empty">Nothing matches that search.</p>}
      </div>
    </dialog>
  );
}
