// The player's builder: one card per step, every change auto-saved. The content here is a stub
// (archetype, name, look) that exercises saving; the real steps are to be built on top of
// steps.ts and engine.ts.

import { useState } from "react";

import { ARCHETYPES, type Answers } from "@/domain/character";
import { isAnswered, pruneAnswers } from "@/domain/steps";
import { saveAnswers } from "@/server/builderFns";

import { type SaveState, useAutosave } from "./useAutosave";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "",
  pending: "Saving…",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn’t save. Check your connection; your next change tries again.",
};

export function BuilderFlow({
  id,
  playerName,
  initial,
}: {
  id: string;
  playerName: string;
  initial: Answers;
}) {
  const [answers, setAnswers] = useState<Answers>(initial);
  const autosave = useAutosave((next: Answers) => saveAnswers({ data: { id, answers: next } }));

  function update(patch: Partial<Answers>) {
    const next = pruneAnswers({ ...answers, ...patch }, answers);
    setAnswers(next);
    autosave.schedule(next);
  }

  return (
    <main className="wrap">
      <h1>Hi, {playerName}</h1>
      <p className="lede">
        Make your choices below. Everything saves as you go, so you can close this page and come
        back to the same link any time.{" "}
        <output className="save-state" data-state={autosave.state} title={autosave.error}>
          {SAVE_LABEL[autosave.state]}
        </output>
      </p>

      <div className="steps">
        <section className={`step${isAnswered(answers, "archetype") ? " done" : ""}`}>
          <h2 className="step-head">
            <span className="step-num">1</span> What kind of hero?
          </h2>
          <p className="step-hint">Pick the one that sounds most fun. You can change it later.</p>
          <fieldset className="choices">
            <legend className="sr-only">Archetype</legend>
            {ARCHETYPES.map((a) => (
              <label key={a.id} className="choice">
                <input
                  type="radio"
                  name="archetype"
                  value={a.id}
                  checked={answers.archetype === a.id}
                  onChange={() => update({ archetype: a.id })}
                />
                <span className="choice-label">{a.label}</span>
                <span className="choice-blurb">{a.blurb}</span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className={`step${isAnswered(answers, "name") ? " done" : ""}`}>
          <h2 className="step-head">
            <span className="step-num">2</span> Your character’s name
          </h2>
          <input
            className="field"
            type="text"
            aria-label="Character name"
            maxLength={80}
            value={answers.name ?? ""}
            onChange={(e) => update({ name: e.target.value })}
          />
        </section>

        <section className={`step${isAnswered(answers, "look") ? " done" : ""}`}>
          <h2 className="step-head">
            <span className="step-num">3</span> What do they look like?
          </h2>
          <p className="step-hint">A sentence or two is plenty: height, hair, clothes, a scar.</p>
          <textarea
            className="field"
            aria-label="Character look"
            maxLength={2000}
            value={answers.look ?? ""}
            onChange={(e) => update({ look: e.target.value })}
          />
        </section>
      </div>
    </main>
  );
}
