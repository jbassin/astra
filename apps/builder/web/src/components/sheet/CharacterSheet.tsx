// The character sheet: built from `buildCharacter`, in plain words, laid out around "On your
// turn". The player page shows it at the end of the flow, the DM page under each player, and
// the browser's print gives a clean copy with cut-out cards (print.css). While anything is
// still to choose it lists that instead of showing numbers that would be wrong.

import { useId } from "react";

import type { Character } from "@/domain/engine";
import { backgroundIcon, classTincture, hueStyle, speciesIcon } from "@/ui/heraldry";
import { Crest, Icon } from "@/ui/Icon";

import { Cards } from "./Cards";
import { Details } from "./Details";
import { type JumpTarget, SheetJump } from "./SheetJump";
import { SpellSection } from "./SpellSection";
import { OnYourTurn, Vitals } from "./TurnSection";

/** "Level 2 High Elf Wizard". */
function calling(c: Character): string {
  return [`Level ${c.level}`, c.species?.name, c.class?.name].filter(Boolean).join(" ");
}

function SheetHeader({ c }: { c: Character }) {
  const crest = classTincture(c.class?.id);
  return (
    <header className="sheet-banner">
      <Crest icon={crest?.icon ?? "wax-seal"} className="sheet-crest" />
      <div className="sheet-title">
        <h3 className="sheet-name">{c.name || "Your hero"}</h3>
        <p className="sheet-sub">{calling(c)}</p>
        {(c.species || c.background) && (
          <p className="sheet-origins">
            {c.species && (
              <span className="origin">
                <Icon name={speciesIcon(c.species.id)} />
                {c.species.name}
              </span>
            )}
            {c.background && (
              <span className="origin">
                <Icon name={backgroundIcon(c.background.id)} />
                {c.background.name} background
              </span>
            )}
          </p>
        )}
      </div>
      {(c.look || c.personality) && (
        <div className="sheet-story">
          {c.look && (
            <p>
              <span className="story-label">Looks</span>
              {c.look}
            </p>
          )}
          {c.personality && (
            <p>
              <span className="story-label">Manner</span>
              {c.personality}
            </p>
          )}
        </div>
      )}
    </header>
  );
}

function StillToChoose({ missing, onFinish }: { missing: string[]; onFinish?: () => void }) {
  return (
    <section className="sheet-section still">
      <h4 className="section-title">Still to choose</h4>
      <p>Your numbers appear here once these are done:</p>
      <ul>
        {missing.map((m) => (
          <li key={m}>
            <span className="still-box" aria-hidden="true" />
            {m}
          </li>
        ))}
      </ul>
      {onFinish && (
        <button type="button" className="button" onClick={onFinish}>
          Go to the next choice
          <Icon name="ui-chevron-right" />
        </button>
      )}
    </section>
  );
}

/** The jump bar's links; Spells only when the character casts any. */
function jumpTargets(c: Character, prefix: string): JumpTarget[] {
  const casts = c.spellcasting.some((b) => b.cantrips.length + b.spells.length > 0);
  const spells: JumpTarget[] = casts
    ? [{ id: `${prefix}-spells`, label: "Spells", icon: "spell-book" }]
    : [];
  return [
    { id: `${prefix}-turn`, label: "Turn", icon: "sword-brandish" },
    ...spells,
    { id: `${prefix}-abilities`, label: "Abilities", icon: "biceps" },
    { id: `${prefix}-gear`, label: "Gear", icon: "backpack" },
    { id: `${prefix}-cards`, label: "Cards", icon: "scroll-unfurled" },
  ];
}

export function CharacterSheet({
  character: c,
  onFinish,
}: {
  character: Character;
  /** Shown as "Go to the next choice" while the sheet is incomplete; also enables printing. */
  onFinish?: () => void;
}) {
  const hue = hueStyle(classTincture(c.class?.id));
  // The DM page shows several sheets at once, so each one's anchors carry its own prefix.
  const prefix = `sheet${useId().replaceAll(/[^\w-]/g, "")}`;
  if (c.missing.length > 0) {
    return (
      <article className="sheet hued" style={hue}>
        <SheetHeader c={c} />
        <StillToChoose missing={c.missing} onFinish={onFinish} />
      </article>
    );
  }
  return (
    <article className="sheet hued" style={hue}>
      <SheetHeader c={c} />
      {onFinish && (
        <div className="sheet-print">
          <button type="button" className="button quiet" onClick={() => window.print()}>
            <Icon name="ui-printer" />
            Print your sheet
          </button>
          <p>The cards at the end print ready to cut out.</p>
        </div>
      )}
      <SheetJump targets={jumpTargets(c, prefix)} />
      <Vitals c={c} />
      <OnYourTurn c={c} id={`${prefix}-turn`} />
      <SpellSection c={c} id={`${prefix}-spells`} />
      <Details c={c} ids={{ abilities: `${prefix}-abilities`, gear: `${prefix}-gear` }} />
      <Cards c={c} id={`${prefix}-cards`} />
    </article>
  );
}
