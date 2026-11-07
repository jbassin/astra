// The progress rail: every screen that applies, marked done, to do or blocked, each a button
// that jumps there. A rail down the side on a laptop, a scrolling strip on a phone.

import { useEffect, useRef } from "react";

import type { ViewKey, ViewStatus } from "@/domain/flow";

const STATE_TEXT: Record<ViewStatus["state"], string> = {
  done: "done",
  todo: "to do",
  blocked: "needs an earlier step",
};

function Mark({ state, n }: { state: ViewStatus["state"]; n: number }) {
  if (state === "done")
    return (
      <span className="step-mark" aria-hidden="true">
        ✓
      </span>
    );
  // A blocked step keeps its number; the rail dims it (flow.css).
  return (
    <span className="step-mark" aria-hidden="true">
      {n}
    </span>
  );
}

export function Stepper({
  statuses,
  current,
  onJump,
}: {
  statuses: ViewStatus[];
  current: ViewKey;
  onJump: (view: ViewKey) => void;
}) {
  const shown = statuses.filter((s) => s.applicable);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    // On a phone the rail is a scrolling strip: keep the current step in view, sideways only.
    const ol = list.current;
    const at = ol?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!ol || !at || ol.scrollWidth <= ol.clientWidth) return;
    ol.scrollLeft = at.offsetLeft - (ol.clientWidth - at.offsetWidth) / 2;
  }, [current]);
  return (
    <nav className="stepper" aria-label="Steps">
      <ol ref={list}>
        {shown.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              className="step-link"
              data-state={s.state}
              aria-current={s.key === current ? "step" : undefined}
              aria-label={`${s.label} (${STATE_TEXT[s.state]})`}
              onClick={() => onJump(s.key)}
            >
              <Mark state={s.state} n={i + 1} />
              <span className="step-label">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
