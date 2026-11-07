// The quest path: every screen that applies, as a waypoint marked done, to do or blocked, each
// a button that jumps there. The road between two waypoints fills in gilt once the first is
// done. On a laptop or tablet the waypoints run across the page with their labels; on a phone
// a compact bar shows where you are ("3 / 8", one segment per screen) and opens the same
// waypoints as a list, so the path never scrolls sideways.

import { useEffect, useState } from "react";

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
  const [open, setOpen] = useState(false);
  const shown = statuses.filter((s) => s.applicable);
  const at = Math.max(
    0,
    shown.findIndex((s) => s.key === current),
  );
  const here = shown[at];
  useEffect(() => {
    // Escape closes the opened list, wherever the focus is.
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <nav className="stepper" aria-label="Steps" data-open={open ? "" : undefined}>
      <button
        type="button"
        className="stepper-toggle"
        aria-expanded={open}
        aria-controls="steps-list"
        aria-label={`All steps: step ${at + 1} of ${shown.length}, ${here?.label ?? ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="stepper-now">
          {here && <Icon name={VIEW_ICON[here.key]} className="stepper-now-icon" />}
          <span className="stepper-now-label">{here?.label}</span>
          <span className="stepper-count">
            {at + 1} / {shown.length}
          </span>
          <Icon name="ui-chevron-down" className="stepper-chevron" />
        </span>
        <span className="stepper-segments" aria-hidden="true">
          {shown.map((s) => (
            <span
              key={s.key}
              className="segment"
              data-state={s.state}
              data-current={s.key === current ? "" : undefined}
            />
          ))}
        </span>
      </button>
      <ol id="steps-list">
        {shown.map((s) => (
          <li key={s.key} data-state={s.state}>
            <button
              type="button"
              className="step-link"
              data-state={s.state}
              aria-current={s.key === current ? "step" : undefined}
              aria-label={`${s.label} (${STATE_TEXT[s.state]})`}
              onClick={() => {
                setOpen(false);
                onJump(s.key);
              }}
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
              <span className="step-state" aria-hidden="true">
                {STATE_TEXT[s.state]}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
