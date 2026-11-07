// The sheet's jump bar on a phone: links to its parts that stick under the top of the screen,
// with the part in view marked. A laptop shows the whole sheet at once and hides it
// (sheet.css). The first render marks nothing, so the server and the browser agree.

import { useEffect, useState } from "react";

import type { IconName } from "@/generated/icons";
import { Icon } from "@/ui/Icon";

export interface JumpTarget {
  id: string;
  label: string;
  icon: IconName;
}

export function SheetJump({ targets }: { targets: JumpTarget[] }) {
  const [active, setActive] = useState<string | null>(null);
  const key = targets.map((t) => t.id).join(" ");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const ids = key.split(" ");
        // At the very bottom the last part is the one being read, even if it is short.
        const atEnd =
          window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
        // Otherwise the first part, in sheet order, that crosses the band near the top.
        const first = atEnd ? ids.at(-1) : ids.find((id) => seen.get(id));
        if (first) setActive(first);
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );
    for (const id of key.split(" ")) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [key]);
  return (
    <nav className="sheet-jump" aria-label="Parts of the sheet">
      <ul>
        {targets.map((t) => (
          <li key={t.id}>
            <a
              href={`#${t.id}`}
              aria-current={active === t.id ? "location" : undefined}
              onClick={() => setActive(t.id)}
            >
              <Icon name={t.icon} />
              <span>{t.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
