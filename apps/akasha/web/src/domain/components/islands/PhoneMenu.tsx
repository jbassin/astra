/**
 * The phone menu: the header's menu button and the full-height sheet it opens. The sheet
 * holds a search field (it opens the search dialog), one row per section with its page
 * count, the current section's tree excerpt open under its row (the page on screen and its
 * neighbours, then a link to the section's own page), and the Light / Dark / System control.
 *
 * The sheet renders only while open, so nothing in it runs during SSR. Each page mounts
 * fresh, so a navigation from inside the sheet closes it.
 */
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { CloseIcon, MenuIcon, SearchIcon } from "@/domain/components/icons";
import { openSearch, SEARCH_PLACEHOLDER } from "@/domain/components/islands/Search";
import { ThemeSegments } from "@/domain/components/islands/ThemeControls";
import { PageTitle } from "@/domain/components/PageTitle";
import { SectionList } from "@/domain/components/SectionList";
import { useCurrentSlug, useSectionCounts } from "@/domain/components/shellHooks";
import {
  isCurrentNode,
  siblingWindow,
  type TreeNode,
  treeHref,
  treeRootFor,
} from "@/domain/lib/explorerState";
import { allPagesLabel, type Section, type SectionCounts, sectionOf } from "@/domain/lib/sections";
import { EXPLORER_TREE } from "@/generated/site";

export function PhoneMenu() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="ak-iconbtn ak-menu-button"
        aria-label="Open the menu"
        aria-expanded={open}
        aria-controls="ak-phone-menu"
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </button>
      {open && <Sheet onClose={close} />}
    </>
  );
}

/**
 * Shows the dialog as a native modal while mounted: the page behind is inert and doesn't
 * scroll, Escape closes it (the `close` event), and `focus` takes the focus.
 */
function useModal(
  dialogRef: RefObject<HTMLDialogElement | null>,
  focusRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    // The dialog is rendered with the component, so the ref is set by now.
    const dialog = dialogRef.current;
    dialog?.showModal();
    focusRef.current?.focus();
    // `close` fires a task later: one queued by a cleanup's close() can arrive after the
    // effect has opened the dialog again (StrictMode runs effects twice), so check.
    const onCloseEvent = () => {
      if (!dialog?.open) onClose();
    };
    dialog?.addEventListener("close", onCloseEvent);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.removeEventListener("close", onCloseEvent);
      if (dialog?.open) dialog.close();
      document.body.style.overflow = overflow;
    };
  }, [dialogRef, focusRef, onClose]);
}

function Sheet({ onClose }: { onClose: () => void }) {
  const currentSlug = useCurrentSlug();
  const counts = useSectionCounts();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModal(dialogRef, closeRef, onClose);
  const root = treeRootFor(EXPLORER_TREE, currentSlug);
  const section = root ? sectionOf(root.slug) : null;

  return (
    <dialog ref={dialogRef} id="ak-phone-menu" className="ak-phone-menu" aria-label="Menu">
      <div className="ak-phone-menu-head">
        <PageTitle />
        <button
          ref={closeRef}
          type="button"
          className="ak-iconbtn"
          aria-label="Close the menu"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="ak-phone-menu-body">
        <button
          type="button"
          className="ak-search-trigger ak-search-trigger-wide"
          onClick={() => {
            onClose();
            openSearch();
          }}
        >
          <SearchIcon />
          <span className="ak-search-trigger-text">{SEARCH_PLACEHOLDER}</span>
        </button>
        <SectionList
          variant="menu"
          counts={counts}
          current={section?.id ?? null}
          expanded={
            root &&
            section && (
              <Excerpt root={root} section={section} counts={counts} currentSlug={currentSlug} />
            )
          }
        />
        <ThemeSegments />
      </div>
    </dialog>
  );
}

/** The page on screen and its neighbours in the section tree, then the section's own page. */
function Excerpt({
  root,
  section,
  counts,
  currentSlug,
}: {
  root: TreeNode;
  section: Section;
  counts: SectionCounts | null;
  currentSlug: string;
}) {
  if (!root.isFolder) return null;
  return (
    <ul className="ak-menu-excerpt">
      {siblingWindow(root.children, currentSlug, 1).map((node) => {
        const current = isCurrentNode(node, currentSlug);
        return (
          <li key={node.slug}>
            <a
              href={treeHref(node, currentSlug)}
              className={current ? "ak-menu-item is-current" : "ak-menu-item"}
              aria-current={current ? "page" : undefined}
            >
              {node.displayName}
            </a>
          </li>
        );
      })}
      <li>
        <a href={section.href} className="ak-menu-item ak-menu-all">
          {counts ? allPagesLabel(section, counts[section.id]) : `All of ${section.label}`}
        </a>
      </li>
    </ul>
  );
}
