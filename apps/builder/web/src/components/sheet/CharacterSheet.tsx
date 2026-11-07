// The character sheet: built from `buildCharacter`, in plain words, laid out around "On your
// turn". The player page shows it at the end of the flow, the DM page under each player, and
// the browser's print gives a clean copy with cut-out cards (print.css). While anything is
// still to choose it lists that instead of showing numbers that would be wrong.

import type { Character } from "@/domain/engine";
import { backgroundIcon, classTincture, hueStyle, speciesIcon } from "@/ui/heraldry";
import { Crest, Icon } from "@/ui/Icon";

import { Cards } from "./Cards";
import { Details } from "./Details";
import { SpellSection } from "./SpellSection";
import { OnYourTurn, Vitals } from "./TurnSection";

/** "Level 2 High Elf Wizard". */
function calling(c: Character): string {
  const species =
    c.species && (c.species.option ? `${c.species.option} ${c.species.name}` : c.species.name);
  return [`Level ${c.level}`, species, c.class?.name].filter(Boolean).join(" ");
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

export function CharacterSheet({
  character: c,
  onFinish,
}: {
  character: Character;
  /** Shown as "Go to the next choice" while the sheet is incomplete; also enables printing. */
  onFinish?: () => void;
}) {
  const hue = hueStyle(classTincture(c.class?.id));
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
      <Vitals c={c} />
      <OnYourTurn c={c} />
      <SpellSection c={c} />
      <Details c={c} />
      <Cards c={c} />
    </article>
  );
}
