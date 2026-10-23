/**
 * Explorer "Looking Glass" — React port of faerrin's Solid island. The tree is built
 * at BUILD time (buildExplorerTree → generated EXPLORER_TREE) and rendered recursively
 * with per-folder collapse state. Defaults match Quartz: folderClickBehavior "link"
 * (the title links to the folder, the chevron toggles), folderDefaultState "collapsed",
 * useSavedState true; folders that prefix the current slug auto-open; the current file
 * gets `.active`.
 *
 * SSR-safe collapse: the open map is seeded from currentSlug only (no localStorage) so
 * the first client render matches SSR; a useEffect then applies the saved state. The
 * map re-derives on navigation (N5 — listeners are torn down on unmount).
 */

import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { computeOpen } from "@/domain/lib/explorerState";
import { type FullSlug, resolveRelative } from "@/domain/lib/slug";
import { EXPLORER_TREE, type TreeNode } from "@/generated/site";

type SavedState = { path: string; collapsed: boolean };

function loadSaved(): Map<string, boolean> {
  try {
    const raw = localStorage.getItem("fileTree");
    if (!raw) return new Map();
    return new Map((JSON.parse(raw) as SavedState[]).map((e) => [e.path, e.collapsed]));
  } catch {
    return new Map();
  }
}

function persist(map: Map<string, boolean>) {
  try {
    const arr: SavedState[] = [...map.entries()].map(([path, collapsed]) => ({ path, collapsed }));
    localStorage.setItem("fileTree", JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function Explorer({ title = "Looking Glass" }: { title?: string }) {
  const currentSlug = useRouterState({
    select: (s) => {
      for (let i = s.matches.length - 1; i >= 0; i--) {
        const ld = s.matches[i]?.loaderData as { slug?: string } | undefined;
        if (ld?.slug) return ld.slug;
      }
      return "";
    },
  });

  // SSR-safe seed (no localStorage); saved state is merged in after mount.
  const [open, setOpen] = useState(() => computeOpen(EXPLORER_TREE, currentSlug, new Map()));
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  useEffect(() => {
    setOpen(computeOpen(EXPLORER_TREE, currentSlug, loadSaved()));
  }, [currentSlug]);

  const toggleFolder = (slug: string) => {
    setOpen((prev) => {
      const next = new Map(prev);
      const nowOpen = !(prev.get(slug) ?? false);
      next.set(slug, nowOpen);
      const saved = loadSaved();
      saved.set(slug, !nowOpen);
      persist(saved);
      return next;
    });
  };

  const hrefFor = (node: TreeNode) =>
    node.href ?? resolveRelative(currentSlug as FullSlug, node.slug as FullSlug);

  const renderNode = (node: TreeNode) => {
    if (!node.isFolder) {
      return (
        <li key={node.slug}>
          <a
            href={hrefFor(node)}
            data-for={node.slug}
            className={node.slug === currentSlug ? "active" : undefined}
          >
            {node.displayName}
          </a>
        </li>
      );
    }
    const isOpen = open.get(node.slug) ?? false;
    return (
      <li key={node.slug}>
        <div
          className={isOpen ? "folder-container open" : "folder-container"}
          data-folderpath={node.slug}
        >
          <button
            type="button"
            className="folder-icon"
            aria-label={`Toggle ${node.displayName}`}
            aria-expanded={isOpen}
            onClick={() => toggleFolder(node.slug)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="5 8 14 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div>
            <a href={hrefFor(node)} data-for={node.slug} className="folder-title">
              {node.displayName}
            </a>
          </div>
        </div>
        <div className={isOpen ? "folder-outer open" : "folder-outer"}>
          <ul>{node.children.map(renderNode)}</ul>
        </div>
      </li>
    );
  };

  return (
    <div className={panelCollapsed ? "explorer collapsed" : "explorer"}>
      <button
        type="button"
        className="title-button explorer-toggle"
        aria-expanded={!panelCollapsed}
        onClick={() => setPanelCollapsed((c) => !c)}
      >
        <h2>{title}</h2>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="5 8 14 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="fold"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <nav className="explorer-content" aria-label="Site explorer">
        <ul className="explorer-ul">{EXPLORER_TREE.map(renderNode)}</ul>
      </nav>
    </div>
  );
}
