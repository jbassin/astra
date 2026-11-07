// Test mode (`/test`): the same flow and sheet with nothing saved anywhere. The answers live
// only in this tab's React state, so a reload starts fresh. This module must never import the
// server functions; TestBuilder.test.tsx checks that the save path is never called.

import { useState } from "react";

import type { Answers } from "@/domain/character";
import { Icon } from "@/ui/Icon";

import { BuilderFlow } from "./BuilderFlow";

function keepInTab(_answers: Answers): void {
  // Test mode keeps nothing: the flow already holds the answers in React state.
}

export function TestBuilder() {
  // Bumping the key remounts the flow with empty answers.
  const [run, setRun] = useState(0);
  return (
    <BuilderFlow
      key={run}
      initial={{}}
      persist={keepInTab}
      title="Try the builder"
      intro="Make a practice character. Your real character lives at the link your DM sent you."
      banner={
        <div className="test-banner" role="note">
          <Icon name="ui-flask-conical" className="test-banner-icon" />
          <p>
            <strong>Test mode — nothing is saved.</strong> Reloading the page loses this character.
          </p>
          <button type="button" className="button quiet small" onClick={() => setRun((n) => n + 1)}>
            <Icon name="ui-rotate-ccw" />
            Start over
          </button>
        </div>
      }
      status={
        <span className="save-state" data-state="practice">
          <Icon name="ui-flask-conical" />
          <span>Practice</span>
        </span>
      }
    />
  );
}
