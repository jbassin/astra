/**
 * SpaLinks — routes clicks on internal `<a href>` through the router, so moving between
 * pages is a client navigation instead of a full page load. It renders nothing and
 * listens once on the document, which covers the build-rendered wiki bodies, the
 * listings, the Explorer, search results and Popover cards alike. `spaHref` decides
 * which links the browser keeps (other origins, files, same-page anchors).
 */
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { isBrowserClick, spaHref } from "@/domain/lib/spaNav";

export function SpaLinks() {
  const router = useRouter();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || isBrowserClick(e, anchor)) return;
      const href = spaHref(new URL(anchor.href), new URL(window.location.href));
      if (href === null) return;
      e.preventDefault();
      void router.navigate({ href });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [router]);
  return null;
}
