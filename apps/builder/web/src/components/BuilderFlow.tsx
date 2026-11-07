// The player's builder: one screen at a time, driven by steps.ts through flow.ts, ending on
// the character sheet. It never saves anything itself: the page passes `persist`, which gets
// every change (the player page's debounced server save; a no-op in test mode).

import { type ReactNode, useEffect, useRef, useState } from "react";

import type { Answers } from "@/domain/character";
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

import {
  ArchetypeScreen,
  BackgroundScreen,
  ClassScreen,
  type ScreenProps,
  SpeciesScreen,
} from "./flow/OriginScreens";
import { AboutScreen, OptionsScreen, SpellsScreen } from "./flow/PickScreens";
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
    hint: "The people your hero was born into. Each gives a few natural gifts.",
    Body: SpeciesScreen,
  },
  background: {
    title: "Pick your background",
    hint: "What your hero did before adventuring. It adds skills, gear and a special talent.",
    Body: BackgroundScreen,
  },
  options: {
    title: "Make your class choices",
    hint: "Read each one and pick what sounds most like your hero. None is wrong.",
    Body: OptionsScreen,
  },
  spells: {
    title: "Pick your spells",
    hint: "Cantrips are small spells you can cast as often as you like. Level 1 spells are stronger: each cast uses a spell slot, and your slots come back when you rest.",
    Body: SpellsScreen,
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
    <p className="blocked">
      This depends on an earlier choice.{" "}
      <button type="button" className="link-button" onClick={() => go(first)}>
        Go to {labelOf(first)}
      </button>
    </p>
  );
}

function FlowNav({
  answers,
  view,
  go,
}: {
  answers: Answers;
  view: ViewKey;
  go: (v: ViewKey) => void;
}) {
  const back = viewBefore(answers, view);
  const next = view === "sheet" ? undefined : viewAfter(answers, view);
  return (
    <div className="flow-nav">
      {back && (
        <button type="button" className="button quiet" onClick={() => go(back)}>
          Back
        </button>
      )}
      {next && (
        <button type="button" className="button" onClick={() => go(next)}>
          Next: {labelOf(next)}
        </button>
      )}
    </div>
  );
}

function Screen({
  answers,
  update,
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
  return <Body answers={answers} update={update} />;
}

export function BuilderFlow({
  initial,
  persist,
  title,
  intro,
  banner,
}: {
  initial: Answers;
  persist: (answers: Answers) => void;
  title: ReactNode;
  intro: ReactNode;
  banner?: ReactNode;
}) {
  const [answers, setAnswers] = useState<Answers>(initial);
  const [view, setView] = useState<ViewKey>(() => startView(initial));
  const [notice, setNotice] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const statuses = viewStatuses(answers);

  useEffect(() => {
    // Move focus (and the scroll position) to the new screen's heading, but not on first load.
    if (moved.current) heading.current?.focus();
  }, [view]);

  function update(patch: Partial<Answers>) {
    const merged = { ...answers, ...patch };
    const next = pruneAnswers(merged, answers);
    setNotice(clearedSummary(merged, next));
    setAnswers(next);
    persist(next);
  }

  function go(next: ViewKey) {
    moved.current = true;
    setNotice(null);
    setView(next);
  }

  const screen = view === "sheet" ? undefined : SCREENS[view];
  return (
    <main className="flow">
      <header className="flow-head">
        <h1>{title}</h1>
        <div className="lede">{intro}</div>
      </header>
      {banner}
      <div className="flow-body">
        <Stepper statuses={statuses} current={view} onJump={go} />
        <section className="flow-screen" aria-labelledby="screen-title">
          <h2 id="screen-title" ref={heading} tabIndex={-1} className="screen-title">
            {screen?.title ?? "Your character sheet"}
          </h2>
          {screen && <p className="screen-hint">{screen.hint}</p>}
          {notice && <output className="notice">{notice}</output>}
          <Screen answers={answers} update={update} view={view} statuses={statuses} go={go} />
          <FlowNav answers={answers} view={view} go={go} />
        </section>
      </div>
    </main>
  );
}
