// The quest path: every screen that applies, as a waypoint marked done, to do or blocked, each
// a button that jumps there. The road between two waypoints fills in gilt once the first is
// done. On a narrow phone with every screen showing it scrolls sideways, keeping the current
// waypoint in view; labels show under each waypoint from tablet width up.

import { useEffect, useRef } from "react";

import type { ViewKey, ViewStatus } from "@/domain/flow";
import type { IconName } from "@/generated/icons";
import { Icon } from "@/ui/Icon";

const STATE_TEXT: Record<ViewStatus["state"], string> = {
  done: "done",
  todo: "to do",
  blocked: "needs an earlier step",
};

const VIEW_ICON: Record<ViewKey, IconName> = {
  archetype: "crossed-swords",
  class: "wax-seal",
  species: "village",
  background: "scroll-unfurled",
  options: "laurels",
  spells: "spell-book",
  about: "quill-ink",
  sheet: "scroll-quill",
};

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
    // When the path scrolls: keep the current step in view, sideways only.
    const ol = list.current;
    const at = ol?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!ol || !at || ol.scrollWidth <= ol.clientWidth) return;
    const li = at.parentElement ?? at;
    ol.scrollLeft = li.offsetLeft - (ol.clientWidth - li.offsetWidth) / 2;
  }, [current]);
  const at = shown.findIndex((s) => s.key === current);
  const done = shown.filter((s) => s.state === "done").length;
  return (
    <nav className="stepper" aria-label="Steps">
      <ol ref={list}>
        {shown.map((s) => (
          <li key={s.key} data-state={s.state}>
            <button
              type="button"
              className="step-link"
              data-state={s.state}
              aria-current={s.key === current ? "step" : undefined}
              aria-label={`${s.label} (${STATE_TEXT[s.state]})`}
              onClick={() => onJump(s.key)}
            >
              <span className="step-mark" aria-hidden="true">
                <Icon name={VIEW_ICON[s.key]} className="step-icon" />
                {s.state === "done" && (
                  <span className="step-done">
                    <Icon name="ui-check" />
                  </span>
                )}
              </span>
              <span className="step-label" aria-hidden="true">
                {s.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="stepper-where">
        Step {at + 1} of {shown.length}
        <span className="stepper-done">{done} done</span>
      </p>
    </nav>
  );
}
