// The player's builder: one screen at a time, driven by steps.ts through flow.ts, ending on
// the character sheet. It never saves anything itself: the page passes `persist`, which gets
// every change (the player page's debounced server save; a no-op in test mode).
//
// Phone first: the quest path sits above the screen, and Back, the save state and Next live
// in a bar pinned to the bottom of the screen, within reach of a thumb.

import { type ReactNode, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import type { Answers } from "@/domain/character";
import { classOf } from "@/domain/content";
import { buildCharacter } from "@/domain/engine";
import {
  clearedSummary,
  startView,
  VIEWS,
  type ViewKey,
  type ViewStatus,
  viewAfter,
  viewBefore,
  viewStatuses,
} from "@/domain/flow";
import { pruneAnswers } from "@/domain/steps";
import type { TakenClasses } from "@/server/builder";
import { CLASS_HERALDRY, hueStyle } from "@/ui/heraldry";
import { Icon } from "@/ui/Icon";

import {
  ArchetypeScreen,
  BackgroundScreen,
  ClassScreen,
  type ScreenProps,
  SpeciesScreen,
} from "./flow/OriginScreens";
import { AboutScreen, OptionsScreen } from "./flow/PickScreens";
import { Stepper } from "./flow/Stepper";
import { CharacterSheet } from "./sheet/CharacterSheet";

const SCREENS: Record<
  Exclude<ViewKey, "sheet">,
  { title: string; hint: string; Body: (p: ScreenProps) => ReactNode }
> = {
  archetype: {
    title: "What kind of hero do you want to be?",
    hint: "Pick the one that sounds most fun. You can change it later.",
    Body: ArchetypeScreen,
  },
  class: {
    title: "Pick your class",
    hint: "Your class is your hero’s calling: how they fight and what they’re best at.",
    Body: ClassScreen,
  },
  species: {
    title: "Pick your species",
    hint: "The people your hero was born into.",
    Body: SpeciesScreen,
  },
  background: {
    title: "Pick your background",
    hint: "What your hero did before adventuring.",
    Body: BackgroundScreen,
  },
  options: {
    title: "Make your class choices",
    hint: "Read each one and pick what sounds most like your hero. None is wrong.",
    Body: OptionsScreen,
  },
  about: {
    title: "Tell us about your hero",
    hint: "Give them a name and a little life. There are no rules here.",
    Body: AboutScreen,
  },
};

function labelOf(view: ViewKey): string {
  return VIEWS.find((v) => v.key === view)?.label ?? view;
}

function Blocked({ status, go }: { status: ViewStatus; go: (v: ViewKey) => void }) {
  const first = status.blockedBy ?? "archetype";
  return (
    <div className="blocked">
      <Icon name="ui-lock" className="blocked-icon" />
      <p>This depends on an earlier choice.</p>
      <button type="button" className="button" onClick={() => go(first)}>
        Go to {labelOf(first)}
      </button>
    </div>
  );
}

function FlowBar({
  answers,
  view,
  go,
  status,
}: {
  answers: Answers;
  view: ViewKey;
  go: (v: ViewKey) => void;
  status?: ReactNode;
}) {
  const back = viewBefore(answers, view);
  const next = view === "sheet" ? undefined : viewAfter(answers, view);
  return (
    <div className="flow-bar">
      <div className="flow-bar-inner">
        {back ? (
          <button type="button" className="button quiet bar-back" onClick={() => go(back)}>
            <Icon name="ui-chevron-left" />
            Back
          </button>
        ) : (
          <span className="bar-spacer" />
        )}
        <div className="bar-status">{status}</div>
        {next && (
          <button type="button" className="button bar-next" onClick={() => go(next)}>
            Next: {labelOf(next)}
            <Icon name="ui-chevron-right" />
          </button>
        )}
      </div>
    </div>
  );
}

function Screen({
  answers,
  update,
  taken,
  view,
  statuses,
  go,
}: ScreenProps & {
  view: ViewKey;
  statuses: ViewStatus[];
  go: (v: ViewKey) => void;
}) {
  if (view === "sheet") {
    return (
      <CharacterSheet character={buildCharacter(answers)} onFinish={() => go(startView(answers))} />
    );
  }
  const status = statuses.find((s) => s.key === view);
  const { Body } = SCREENS[view];
  if (status?.state === "blocked") return <Blocked status={status} go={go} />;
  return <Body answers={answers} update={update} taken={taken} />;
}

export function BuilderFlow({
  initial,
  persist,
  title,
  intro,
  banner,
  status,
  taken,
}: {
  initial: Answers;
  persist: (answers: Answers) => void;
  title: ReactNode;
  intro: ReactNode;
  banner?: ReactNode;
  /** Shown in the bottom bar between Back and Next: the save state. */
  status?: ReactNode;
  /** Class id to the name of the player who holds it; none in test mode. */
  taken?: TakenClasses;
}) {
  const [answers, setAnswers] = useState<Answers>(initial);
  const [view, setView] = useState<ViewKey>(() => startView(initial));
  const [notice, setNotice] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  // Once the player moves on from the screen they opened, a phone folds the greeting and the
  // test banner away (flow.css), so each step's heading starts near the top of the screen.
  const [compact, setCompact] = useState(false);
  const statuses = viewStatuses(answers);

  useEffect(() => {
    // Land on the new screen's heading, just under the sticky quest path (its scroll margin,
    // flow.css), and focus it; not on first load.
    if (!moved.current) return;
    const h = heading.current;
    if (!h) return;
    if (typeof h.scrollIntoView === "function") h.scrollIntoView({ block: "start" });
    h.focus({ preventScroll: true });
  }, [view]);

  function update(patch: Partial<Answers>) {
    const merged = { ...answers, ...patch };
    const next = pruneAnswers(merged, answers);
    setNotice(clearedSummary(merged, next));
    setAnswers(next);
    persist(next);
  }

  // A class someone else took first (a lost race): clear it and say so.
  const lostClass = answers.classId && taken ? taken[answers.classId] : undefined;
  useEffect(() => {
    if (!lostClass) return;
    const lost = classOf(answers)?.name;
    update({ classId: undefined });
    setNotice(`${lostClass} picked ${lost} first. Pick another class.`);
    // `update` closes over the current answers; the effect runs once per lost class.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- fires on a newly lost class only
  }, [lostClass, answers.classId]);

  function go(next: ViewKey) {
    moved.current = true;
    const show = () => {
      setNotice(null);
      setCompact(next !== "archetype");
      setView(next);
    };
    // A view transition slides the old screen out and the new one in (flow.css); without
    // one, or when the player asks for less motion, the CSS entrance plays instead.
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (typeof document.startViewTransition === "function" && !calm) {
      document.startViewTransition(() => flushSync(show));
    } else {
      show();
    }
  }

  const screen = view === "sheet" ? undefined : SCREENS[view];
  const cls = classOf(answers);
  return (
    <main
      className="flow hued"
      style={hueStyle(cls ? CLASS_HERALDRY[cls.id] : undefined)}
      data-compact={compact ? "" : undefined}
      data-view={view}
    >
      <div className="flow-top">
        <header className="flow-head">
          <h1>{title}</h1>
          <div className="flow-intro">{intro}</div>
        </header>
        {banner}
      </div>
      {/* A child of <main> itself, so it can stick for the whole page (path.css). */}
      <Stepper statuses={statuses} current={view} onJump={go} />
      <section className="flow-screen" aria-labelledby="screen-title" data-view={view}>
        <div className="screen-enter" key={view}>
          <h2 id="screen-title" ref={heading} tabIndex={-1} className="screen-title">
            {screen?.title ?? "Your character sheet"}
          </h2>
          {screen && <p className="screen-hint">{screen.hint}</p>}
          {notice && (
            <output className="notice">
              <Icon name="ui-info" />
              <span>{notice}</span>
            </output>
          )}
          <Screen
            answers={answers}
            update={update}
            taken={taken}
            view={view}
            statuses={statuses}
            go={go}
          />
        </div>
      </section>
      <FlowBar answers={answers} view={view} go={go} status={status} />
    </main>
  );
}
