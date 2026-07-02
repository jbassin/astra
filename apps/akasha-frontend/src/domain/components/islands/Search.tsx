/**
 * Search — React port of faerrin's Solid island over Pagefind (an upgrade from
 * Quartz's FlexSearch). A sidebar trigger opens a Ctrl/Cmd-K modal; the Pagefind
 * runtime (`/pagefind/pagefind.js`, written by scripts/build-search.ts into the
 * client output) is lazy-imported on first open so reading pages ship zero search JS.
 *
 * Solid→React: createSignal→useState, refs→useRef, onMount/onCleanup→useEffect +
 * cleanup (N5). NOTE: Pagefind indexes the built corpus, so search is empty under
 * `vite dev` until a `build` produces `/pagefind/` (same caveat faerrin carried).
 */
import { useCallback, useEffect, useRef, useState } from "react";

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

export function Search() {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PFResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const pagefindRef = useRef<Pagefind | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const tokenRef = useRef(0);
  const openRef = useRef(false);

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

  const setOpenState = useCallback((v: boolean) => {
    openRef.current = v;
    setOpen(v);
  }, []);

  const openSearch = useCallback(async () => {
    setOpenState(true);
    await ensurePagefind().catch(() => null);
    queueMicrotask(() => inputRef.current?.focus());
  }, [ensurePagefind, setOpenState]);

  const closeSearch = useCallback(() => {
    setOpenState(false);
    setResults([]);
    if (inputRef.current) inputRef.current.value = "";
  }, [setOpenState]);

  const runSearch = useCallback(
    async (q: string) => {
      const token = ++tokenRef.current; // discard out-of-order / post-close responses
      if (!q || q.trim().length < 1) {
        setResults([]);
        return;
      }
      const pf = await ensurePagefind().catch(() => null);
      if (!pf || token !== tokenRef.current) return;
      const res = await pf.search(q.trim());
      const data = await Promise.all(res.results.slice(0, 20).map((r) => r.data()));
      if (token !== tokenRef.current || !openRef.current) return;
      setResults(data);
    },
    [ensurePagefind],
  );

  const onInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const q = e.currentTarget.value;
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void runSearch(q), 180);
    },
    [runSearch],
  );

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (openRef.current) closeSearch();
        else void openSearch();
      } else if (e.key === "Escape" && openRef.current) {
        closeSearch();
      }
    };
    document.addEventListener("keydown", onKeydown);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      window.clearTimeout(timerRef.current);
    };
  }, [openSearch, closeSearch]);

  return (
    <div className="search">
      <button className="search-button" type="button" onClick={() => void openSearch()}>
        <p>Search</p>
        <svg viewBox="0 0 512 512" width="18" height="18" aria-hidden="true">
          <title>Search</title>
          <path
            className="search-path"
            fill="none"
            d="M504 480L348 324a204 204 0 1 0-24 24l156 156zM52 212a160 160 0 1 1 320 0 160 160 0 0 1-320 0z"
          />
        </svg>
      </button>

      <div
        className={open ? "search-container active" : "search-container"}
        onClick={(e) => {
          if (e.currentTarget === e.target) closeSearch();
        }}
      >
        <div className="search-space">
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            className="search-bar"
            placeholder="Search"
            aria-label="Search"
            onInput={onInput}
          />
          <div className={results.length > 0 ? "search-layout display-results" : "search-layout"}>
            <div className="results-container">
              {results.map((r) => (
                <a className="result-card" key={r.url} href={r.url.replace(/\.html$/, "")}>
                  <h3>{r.meta.title ?? r.url}</h3>
                  <p dangerouslySetInnerHTML={{ __html: r.excerpt }} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
