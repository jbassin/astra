/**
 * The left rail: the current section's tree. It shows only the top-level subtree of the
 * build-time `EXPLORER_TREE` that holds the page on screen (`Org` for an organisation, `Script`
 * for a transcript, `chronicle` for a chronicle page), headed by the section's hue dot, label
 * and page count. Folders link to their own page and have a toggle; the open state is saved
 * in localStorage `fileTree` (the Quartz Explorer's key, so readers keep their folders).
 * Pages outside every section (home, tags) get the list of sections instead.
 *
 * SSR-safe: the open map is seeded from the current slug only, so the first client render
 * matches SSR; an effect then applies the saved state and scrolls the current item into
 * view inside the rail (README trap: localStorage only in effects).
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { ChevronIcon } from "@/domain/components/icons";
import { SectionList } from "@/domain/components/SectionList";
import { useCurrentSlug, useSectionCounts } from "@/domain/components/shellHooks";
import { computeOpen, isCurrentNode, treeHref, treeRootFor } from "@/domain/lib/explorerState";
import { type Section, sectionOf } from "@/domain/lib/sections";
import { withStorage } from "@/domain/lib/storage";
import { EXPLORER_TREE, type TreeNode } from "@/generated/site";

type SavedState = { path: string; collapsed: boolean };
const STORAGE_KEY = "fileTree";

// Saved state that fails to read or parse counts as none.
function loadSaved(): Map<string, boolean> {
  return withStorage((s) => {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return new Map<string, boolean>();
    return new Map((JSON.parse(raw) as SavedState[]).map((e) => [e.path, e.collapsed]));
  }, new Map<string, boolean>());
}

function persist(map: Map<string, boolean>) {
  const arr: SavedState[] = [...map.entries()].map(([path, collapsed]) => ({ path, collapsed }));
  withStorage((s) => s.setItem(STORAGE_KEY, JSON.stringify(arr)), undefined);
}

/** Scrolls the rail (never the window) so the current item sits in its upper third. */
function revealCurrent(nav: HTMLElement | null) {
  const rail = nav?.closest<HTMLElement>(".ak-rail-left");
  const item = nav?.querySelector<HTMLElement>('[aria-current="page"]');
  if (!rail || !item || rail.scrollHeight <= rail.clientHeight) return;
  const top = item.getBoundingClientRect().top - rail.getBoundingClientRect().top;
  if (top >= 0 && top + item.offsetHeight <= rail.clientHeight) return;
  rail.scrollTop += top - rail.clientHeight / 3;
}

export function SectionTree() {
  const currentSlug = useCurrentSlug();
  const counts = useSectionCounts();
  const root = treeRootFor(EXPLORER_TREE, currentSlug);
  const section = root ? sectionOf(root.slug) : null;

  if (!root || !section) {
    return <SectionList variant="rail" counts={counts} />;
  }
  return (
    <Tree
      root={root}
      section={section}
      count={counts?.[section.id] ?? null}
      currentSlug={currentSlug}
    />
  );
}

function Tree({
  root,
  section,
  count,
  currentSlug,
}: {
  root: TreeNode;
  section: Section;
  count: number | null;
  currentSlug: string;
}) {
  // Memoised: the effect below keys on it, and a fresh `[root]` each render would loop.
  const nodes = useMemo(() => (root.isFolder ? root.children : [root]), [root]);
  const navRef = useRef<HTMLElement>(null);
  // SSR-safe seed (no localStorage); saved state is merged in after mount.
  const [open, setOpen] = useState(() => computeOpen(nodes, currentSlug, new Map()));

  useEffect(() => {
    setOpen(computeOpen(nodes, currentSlug, loadSaved()));
    // Reveal once the saved state has rendered.
    const frame = requestAnimationFrame(() => revealCurrent(navRef.current));
    return () => cancelAnimationFrame(frame);
  }, [nodes, currentSlug]);

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

  const renderNode = (node: TreeNode) => {
    const current = isCurrentNode(node, currentSlug);
    const link = (
      <a
        href={treeHref(node, currentSlug)}
        data-for={node.slug}
        className="ak-tree-link"
        aria-current={current ? "page" : undefined}
      >
        {node.displayName}
      </a>
    );
    if (!node.isFolder) {
      return (
        <li key={node.slug}>
          <div className={current ? "ak-tree-row is-current" : "ak-tree-row"}>{link}</div>
        </li>
      );
    }
    const isOpen = open.get(node.slug) ?? false;
    return (
      <li key={node.slug}>
        <div className={current ? "ak-tree-row is-current" : "ak-tree-row"}>
          {link}
          <button
            type="button"
            className="ak-tree-toggle"
            aria-label={`Pages in ${node.displayName}`}
            aria-expanded={isOpen}
            onClick={() => toggleFolder(node.slug)}
          >
            <ChevronIcon />
          </button>
        </div>
        {isOpen && <ul className="ak-tree-kids">{node.children.map(renderNode)}</ul>}
      </li>
    );
  };

  return (
    <nav
      ref={navRef}
      className="ak-tree"
      aria-label={section.label}
      style={{ "--hue": section.hue }}
    >
      <p className="ak-tree-head">
        <span className="ak-dot" aria-hidden="true" />
        <a href={section.href} className="ak-tree-head-link">
          {section.label}
        </a>
        {count !== null && section.id !== "timeline" && <span className="ak-count">{count}</span>}
      </p>
      <ul className="ak-tree-list">{nodes.map(renderNode)}</ul>
    </nav>
  );
}
