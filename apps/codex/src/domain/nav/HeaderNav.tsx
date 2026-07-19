import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import { humanizeSlug } from "@/domain/render/text";

import { NAV_ITEMS, type NavItem } from "./navData";

const HOVER_OPEN_DELAY_MS = 120;

/**
 * P4.5 S2 (D29-47), CURATED P11 S4 (D29-110) — the global header nav: 5
 * category dropdowns (Player/Spells/Equipment/GM/Setting) + the bare
 * "Rules"/"Sources"/"All categories" links, spanning the CURATED 28-category
 * set (`navData.ts` owns the grouping — the long tail lives at
 * `/categories`/the omnibar/in-context links instead). No headless-UI
 * dependency (repo idiom, scope doc §7 risks) — every dropdown panel is a
 * real, ALWAYS-rendered `<ul>` of `<a>` tags; a JS-disabled client reaches
 * every category link because the panel's no-JS reveal is pure CSS
 * `:hover` on the container (`globals.css`'s `.codex-nav-item:hover
 * .codex-nav-panel`), not a mount/unmount. JS only adds: click-to-toggle,
 * hover-INTENT (a short open delay so a mouse merely passing over the
 * trigger doesn't flash it open), and the full keyboard contract (D29-47):
 * Tab reaches the trigger; Enter/Space/ArrowDown opens + focuses the first
 * item; ArrowUp/ArrowDown move focus within; Escape closes + returns focus
 * to the trigger; Tab out of an open panel closes it.
 *
 * D29-110 also DELETES the old Rules split control (a plain `<a>` label
 * plus a separate caret `<button>` disclosing an 8-category dropdown tail,
 * adversarial M4 from D29-47): "Rules" is a bare `kind: "link"` item now,
 * same shape as "Sources"/"All categories", so it renders via the plain
 * `PlainNavLink` branch below like every other bare link — no dropdown, no
 * caret, no second tab stop.
 */
function useDropdown(itemCount: number) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const hoverTimerRef = useRef<number | undefined>(undefined);
  // Set by a keyboard-driven open (Enter/Space/ArrowDown on the trigger) so
  // the effect below focuses the first item exactly once, AFTER React
  // commits the `open` class change to the DOM — a real browser won't
  // `.focus()` an element that's still `display:none` at call time, so this
  // can't happen synchronously inside the same keydown handler (no
  // `requestAnimationFrame` dependency either — jsdom doesn't implement it).
  const focusFirstOnOpenRef = useRef(false);
  itemRefs.current.length = itemCount;

  const focusItem = useCallback((index: number) => {
    itemRefs.current[index]?.focus();
  }, []);

  useEffect(() => {
    if (open && focusFirstOnOpenRef.current) {
      focusFirstOnOpenRef.current = false;
      focusItem(0);
    }
  }, [open, focusItem]);

  const openAndFocusFirst = useCallback(() => {
    focusFirstOnOpenRef.current = true;
    setOpen(true);
  }, []);

  const close = useCallback((refocusTrigger: boolean) => {
    setOpen(false);
    if (refocusTrigger) triggerRef.current?.focus();
  }, []);

  const onTriggerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openAndFocusFirst();
      } else if (e.key === "Escape") {
        close(true);
      }
    },
    [openAndFocusFirst, close],
  );

  const onItemKeyDown = useCallback(
    (e: KeyboardEvent<HTMLAnchorElement>, index: number) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusItem(Math.min(index + 1, itemCount - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusItem(Math.max(index - 1, 0));
      } else if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    },
    [focusItem, itemCount, close],
  );

  const onContainerBlur = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      const next = e.relatedTarget as Node | null;
      if (!containerRef.current?.contains(next)) close(false);
    },
    [close],
  );

  const onMouseEnter = useCallback(() => {
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_DELAY_MS);
  }, []);

  const onMouseLeave = useCallback(() => {
    window.clearTimeout(hoverTimerRef.current);
    setOpen(false);
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(hoverTimerRef.current);
  }, []);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  return {
    open,
    containerRef,
    triggerRef,
    itemRefs,
    onTriggerKeyDown,
    onItemKeyDown,
    onContainerBlur,
    onMouseEnter,
    onMouseLeave,
    toggle,
  };
}

function NavPanel({
  categories,
  label,
  dd,
}: {
  categories: readonly string[];
  label: string;
  dd: ReturnType<typeof useDropdown>;
}): ReactElement {
  return (
    <ul
      className={dd.open ? "codex-nav-panel codex-nav-panel-open" : "codex-nav-panel"}
      role="menu"
      aria-label={`${label} categories`}
    >
      {categories.map((category, index) => (
        <li key={category} role="none">
          <a
            href={`/${category}`}
            role="menuitem"
            ref={(el) => {
              dd.itemRefs.current[index] = el;
            }}
            onKeyDown={(e) => dd.onItemKeyDown(e, index)}
          >
            {humanizeSlug(category)}
          </a>
        </li>
      ))}
    </ul>
  );
}

function NavDropdown({ item }: { item: NavItem }): ReactElement {
  const categories = item.categories ?? [];
  const dd = useDropdown(categories.length);
  return (
    <div
      className="codex-nav-item"
      ref={dd.containerRef}
      onMouseEnter={dd.onMouseEnter}
      onMouseLeave={dd.onMouseLeave}
      onBlur={dd.onContainerBlur}
    >
      <button
        type="button"
        ref={dd.triggerRef}
        className="codex-nav-trigger"
        aria-haspopup="true"
        aria-expanded={dd.open}
        onClick={dd.toggle}
        onKeyDown={dd.onTriggerKeyDown}
      >
        {item.label}
        {/* P8 S2 (D29-80b): the same `▾` affordance every dropdown trigger
            carries — aria-hidden so the button's accessible name stays just
            `item.label` (unchanged from before this, still matched by
            `getByRole("button", {name: item.label})` in tests and by AT).
            D29-110: this was originally described as matching the Rules
            split control's own separate caret — that control (and its
            `.codex-nav-caret` class) is gone now, Rules being a bare link
            like every other non-dropdown item. */}
        <span aria-hidden="true" className="codex-nav-trigger-caret">
          ▾
        </span>
      </button>
      <NavPanel categories={categories} label={item.label} dd={dd} />
    </div>
  );
}

function PlainNavLink({ item }: { item: NavItem }): ReactElement {
  return (
    <a href={item.href} className="codex-nav-item codex-nav-plain-link">
      {item.label}
    </a>
  );
}

export function HeaderNav(): ReactElement {
  return (
    <nav className="codex-header-nav" aria-label="Category navigation">
      {NAV_ITEMS.map((item) =>
        item.kind === "dropdown" ? (
          <NavDropdown key={item.label} item={item} />
        ) : (
          <PlainNavLink key={item.label} item={item} />
        ),
      )}
    </nav>
  );
}
