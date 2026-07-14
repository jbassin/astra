/**
 * Popover hover-previews — ported VERBATIM from akasha-frontend's React island
 * (D29-28: "the component itself has no akasha-specific data deps; its
 * `fetchCanonical` alias hop is harmless here" — adversarial M10). Progressive
 * enhancement: renders nothing, binds mouseenter/leave to every resolved
 * internal link on mount. On hover it fetches the target page, extracts its
 * `.popover-hint`, prefixes inner ids to avoid dupes, and floats a card
 * positioned with @floating-ui/dom.
 *
 * Attaches to `a[data-crossref]` (codex's crossref links AND trait-pill links,
 * `nodes.tsx`/`traits.tsx`) AND `a.internal` (unused in codex today, kept for
 * parity with the source — costs nothing, matches zero links). Re-runs on
 * route change so the new page's links get bound and the old ones torn down.
 * Mounted ONLY on the entity route (`$category/$slug.tsx`) per D29-28 —
 * listing rows navigate, they don't get hover cards.
 */
import { computePosition, flip, inline, shift } from "@floating-ui/dom";
import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

const canonicalRegex = /<link rel="canonical" href="([^"]*)">/;

async function fetchCanonical(url: URL): Promise<Response> {
  const res = await fetch(`${url}`);
  if (!res.headers.get("content-type")?.startsWith("text/html")) return res;
  const text = await res.clone().text();
  const [, redirect] = text.match(canonicalRegex) ?? [];
  return redirect ? fetch(`${new URL(redirect, url)}`) : res;
}

function rebase(el: Element, attr: string, destination: string | URL) {
  const current = el.getAttribute(attr);
  if (current == null) return;
  const rebased = new URL(current, destination);
  el.setAttribute(attr, rebased.pathname + rebased.hash);
}
function normalizeRelativeURLs(el: Document, destination: string | URL) {
  for (const i of el.querySelectorAll('[href=""], [href^="./"], [href^="../"]'))
    rebase(i, "href", destination);
  for (const i of el.querySelectorAll('[src=""], [src^="./"], [src^="../"]'))
    rebase(i, "src", destination);
}

function initPopovers(): () => void {
  const parser = new DOMParser();
  let activeAnchor: HTMLAnchorElement | null = null;

  const clearActivePopover = () => {
    activeAnchor = null;
    for (const p of document.querySelectorAll(".popover")) p.classList.remove("active-popover");
  };

  async function onEnter(link: HTMLAnchorElement, ev: MouseEvent) {
    activeAnchor = link;
    if (link.dataset.noPopover === "true") return;
    const { clientX, clientY } = ev;

    const targetUrl = new URL(link.href);
    const hash = decodeURIComponent(targetUrl.hash);
    targetUrl.hash = "";
    targetUrl.search = "";
    const popoverId = `popover-${link.pathname}`;

    const setPosition = async (popoverElement: HTMLElement) => {
      const { x, y } = await computePosition(link, popoverElement, {
        strategy: "fixed",
        middleware: [inline({ x: clientX, y: clientY }), shift(), flip()],
      });
      Object.assign(popoverElement.style, {
        transform: `translate(${x.toFixed()}px, ${y.toFixed()}px)`,
      });
    };

    const showPopover = (popoverElement: HTMLElement, popoverInner: HTMLElement) => {
      clearActivePopover();
      popoverElement.classList.add("active-popover");
      void setPosition(popoverElement);
      if (hash !== "") {
        const heading = popoverInner.querySelector(
          `#popover-internal-${hash.slice(1)}`,
        ) as HTMLElement | null;
        if (heading) popoverInner.scroll({ top: heading.offsetTop - 12, behavior: "instant" });
      }
    };

    const prev = document.getElementById(popoverId);
    if (prev) {
      showPopover(prev, prev.querySelector(".popover-inner") as HTMLElement);
      return;
    }

    const response = await fetchCanonical(targetUrl).catch((err) => console.error(err));
    if (!response) return;
    const [contentType = ""] = (response.headers.get("Content-Type") ?? "").split(";");
    const [category, typeInfo] = contentType.split("/");

    const popoverElement = document.createElement("div");
    popoverElement.id = popoverId;
    popoverElement.classList.add("popover");
    const popoverInner = document.createElement("div");
    popoverInner.classList.add("popover-inner");
    popoverInner.dataset.contentType = contentType ?? undefined;
    popoverElement.appendChild(popoverInner);

    if (category === "image") {
      const img = document.createElement("img");
      img.src = targetUrl.toString();
      img.alt = targetUrl.pathname;
      popoverInner.appendChild(img);
    } else if (category === "application" && typeInfo === "pdf") {
      const pdf = document.createElement("iframe");
      pdf.src = targetUrl.toString();
      popoverInner.appendChild(pdf);
    } else {
      const contents = await response.text();
      const html = parser.parseFromString(contents, "text/html");
      normalizeRelativeURLs(html, targetUrl);
      for (const el of html.querySelectorAll("[id]")) el.id = `popover-internal-${el.id}`;
      const elts = [...html.getElementsByClassName("popover-hint")];
      if (elts.length === 0) return;
      for (const elt of elts) popoverInner.appendChild(elt);
    }

    if (document.getElementById(popoverId)) return;
    document.body.appendChild(popoverElement);
    if (activeAnchor !== link) return;
    showPopover(popoverElement, popoverInner);
  }

  const links = [
    ...document.querySelectorAll("a[data-crossref], a.internal"),
  ] as HTMLAnchorElement[];
  const bound: Array<[HTMLAnchorElement, (ev: MouseEvent) => void]> = [];
  for (const link of links) {
    const enter = (ev: MouseEvent) => void onEnter(link, ev);
    link.addEventListener("mouseenter", enter);
    link.addEventListener("mouseleave", clearActivePopover);
    bound.push([link, enter]);
  }

  return () => {
    for (const [link, enter] of bound) {
      link.removeEventListener("mouseenter", enter);
      link.removeEventListener("mouseleave", clearActivePopover);
    }
    for (const p of document.querySelectorAll(".popover")) p.remove();
  };
}

export function Popover() {
  // Re-bind on every navigation: the new page's DOM (links) is committed before this
  // effect runs, and the cleanup tears down the previous page's listeners + cards.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => initPopovers(), [pathname]);
  return null;
}
