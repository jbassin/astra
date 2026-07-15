// P4 S2 (D29-40) — the `/rules` tree browser island. Purely a function of
// `books`/`legacy` (no router/URL awareness of its own — the ROUTE FILE,
// `routes/rules.tsx`, owns the `legacy` URL<->live-toggle codec, same split
// `BrowseListing.tsx` uses for its own `legacy` prop). Collapse state is
// local: a `Map<key, boolean>` seeded EMPTY on first render (server AND the
// matching first client render — no localStorage access during SSR) and
// re-derived from the real saved state in a mount effect, the exact
// SSR-safe two-phase pattern `legacyToggle.ts`'s own header comment and
// akasha's `Explorer.tsx` both use.

import { Input } from "@astra/gothic";
import { useEffect, useMemo, useState, type ReactElement } from "react";

import type { RulesTreeBook, TreeNode } from "@/schema/rulesTree";

import { computeOpen, filterTreeByQuery, nodeKeyFor, pruneForLegacy } from "./treeModel";

const STORAGE_KEY = "codex:rulesTree";

function loadSavedOpen(): Map<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, boolean>));
  } catch {
    return new Map(); // private-mode/disabled storage, or corrupt JSON -> fail soft
  }
}

function persistOpen(map: ReadonlyMap<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(map)));
  } catch {
    /* ignore — collapse state still works for this tab, just unpersisted */
  }
}

export function RulesTree({
  books,
  legacy,
  currentId,
}: {
  books: readonly RulesTreeBook[];
  legacy: boolean;
  /** S3's own use: the entity page currently being viewed, so its book's
   * sidebar auto-expands to it (D29-41). `undefined` on the plain `/rules`
   * browse page (S2) — no node is "current". */
  currentId?: string;
}): ReactElement {
  const [queryText, setQueryText] = useState("");
  const query = queryText.trim();

  const [savedOpen, setSavedOpen] = useState<Map<string, boolean>>(() => new Map());
  useEffect(() => {
    setSavedOpen(loadSavedOpen());
  }, []);

  function toggle(key: string): void {
    setSavedOpen((prev) => {
      const wasOpen = prev.get(key) ?? false;
      const next = new Map(prev);
      next.set(key, !wasOpen);
      persistOpen(next);
      return next;
    });
  }

  return (
    <div className="codex-rules-tree">
      <Input
        type="search"
        aria-label="Filter rules by name"
        placeholder="Filter rules by name…"
        value={queryText}
        onChange={(e) => setQueryText(e.target.value)}
      />
      <div className="codex-rules-books">
        {books.map((book) => (
          <RulesBookSection
            key={book.book}
            book={book}
            legacy={legacy}
            query={query}
            currentId={currentId}
            savedOpen={savedOpen}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}

function RulesBookSection({
  book,
  legacy,
  query,
  currentId,
  savedOpen,
  onToggle,
}: {
  book: RulesTreeBook;
  legacy: boolean;
  query: string;
  currentId: string | undefined;
  savedOpen: ReadonlyMap<string, boolean>;
  onToggle: (key: string) => void;
}): ReactElement {
  const legacyPruned = useMemo(() => pruneForLegacy(book.nodes, legacy), [book.nodes, legacy]);
  const queryFiltered = useMemo(
    () => filterTreeByQuery(legacyPruned, query),
    [legacyPruned, query],
  );
  const filterActive = queryFiltered !== null;
  const visibleNodes = queryFiltered ?? legacyPruned;

  const openMap = useMemo(
    () => computeOpen(book.book, legacyPruned, currentId, savedOpen),
    [book.book, legacyPruned, currentId, savedOpen],
  );

  // D29-40 pinned behavior: a book that's 100% superseded (Dark Archive
  // 29/29, Guns & Gears 65/65) prunes to an EMPTY root list under
  // legacy-off — render it as a collapsed "all N hidden" header, never
  // silently drop the section.
  const allHidden = !legacy && legacyPruned.length === 0 && book.hiddenWhenLegacyOff > 0;

  return (
    <section className="codex-rules-book" data-book={book.book}>
      <header className="codex-rules-book-header">
        <h2 className="codex-heading">{book.book}</h2>
        <span className={`codex-edition-pill codex-edition-${book.edition}`}>
          {book.edition === "remaster" ? "Remaster" : "Legacy"}
        </span>
        <span
          className={`codex-license-badge${book.license === "unknown" ? " codex-license-unknown" : ""}`}
        >
          {book.license === "unknown" ? "License unknown" : book.license}
        </span>
        {!legacy && book.hiddenWhenLegacyOff > 0 ? (
          <span className="codex-rules-hidden-note">
            {allHidden
              ? `all ${book.hiddenWhenLegacyOff} hidden`
              : `${book.hiddenWhenLegacyOff} hidden`}
          </span>
        ) : null}
      </header>
      {allHidden ? null : (
        <ul className="codex-rules-tree-list">
          {visibleNodes.map((node) => (
            <RulesTreeNodeView
              key={nodeKeyFor(book.book, [], node)}
              book={book.book}
              node={node}
              path={[]}
              query={filterActive ? query : ""}
              forceOpen={filterActive}
              openMap={openMap}
              currentId={currentId}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RulesTreeNodeView({
  book,
  node,
  path,
  query,
  forceOpen,
  openMap,
  currentId,
  onToggle,
}: {
  book: string;
  node: TreeNode;
  path: readonly string[];
  query: string;
  forceOpen: boolean;
  openMap: ReadonlyMap<string, boolean>;
  currentId: string | undefined;
  onToggle: (key: string) => void;
}): ReactElement {
  const key = nodeKeyFor(book, path, node);
  const hasChildren = node.children.length > 0;
  const isOpen = forceOpen || (openMap.get(key) ?? false);
  const isMatch = query !== "" && node.name.toLowerCase().includes(query.toLowerCase());
  const isCurrent = currentId !== undefined && node.id === currentId;
  const nextPath = useMemo(() => [...path, node.name], [path, node.name]);

  return (
    <li className="codex-rules-node" data-key={key}>
      <div
        className={`codex-rules-node-row${isCurrent ? " codex-rules-node-current" : ""}${isMatch ? " codex-rules-node-match" : ""}`}
      >
        {hasChildren ? (
          <button
            type="button"
            className="codex-rules-toggle"
            aria-expanded={isOpen}
            aria-label={`Toggle ${node.name}`}
            onClick={() => onToggle(key)}
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : (
          <span className="codex-rules-toggle-spacer" aria-hidden="true" />
        )}
        {node.id !== undefined ? (
          <a href={`/${node.id}`} className="codex-rules-node-name">
            {node.name}
          </a>
        ) : (
          <span className="codex-rules-node-name codex-rules-node-synthetic">{node.name}</span>
        )}
        {node.superseded === true ? (
          <span className="codex-edition-pill codex-edition-legacy">Legacy</span>
        ) : null}
      </div>
      {hasChildren && isOpen ? (
        <ul className="codex-rules-tree-list codex-rules-tree-children">
          {node.children.map((child) => (
            <RulesTreeNodeView
              key={nodeKeyFor(book, nextPath, child)}
              book={book}
              node={child}
              path={nextPath}
              query={query}
              forceOpen={forceOpen}
              openMap={openMap}
              currentId={currentId}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
