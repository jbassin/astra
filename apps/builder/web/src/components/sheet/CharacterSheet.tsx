// The character sheet: built from `buildCharacter`, in plain words, laid out around "On your
// turn". The player page shows it at the end of the flow, the DM page under each player, and
// the browser's print gives a clean copy with cut-out cards (print.css). While anything is
// still to choose it lists that instead of showing numbers that would be wrong.

import { useId, useMemo, useRef, useState } from "react";

import type { PlayState } from "@/domain/character";
import type { Character } from "@/domain/engine";
import { sheetCards } from "@/domain/sheet";
import { backgroundIcon, classTincture, hueStyle, speciesIcon } from "@/ui/heraldry";
import { Crest, Icon } from "@/ui/Icon";

import { CardDialog } from "./CardDialog";
import { type CardLinks, CardLinksContext } from "./CardLinks";
import { Cards } from "./Cards";
import { Details } from "./Details";
import { PlayContext } from "./PlayContext";
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
  play,
  onPlay,
  onFinish,
}: {
  character: Character;
  /** The saved marks: Hit Points and what is used. */
  play?: PlayState;
  /** With it the marks can be changed (the player page, `/test`); without, they only show. */
  onPlay?: (next: PlayState) => void;
  /** Shown as "Go to the next choice" while the sheet is incomplete; also enables printing. */
  onFinish?: () => void;
}) {
  const tincture = classTincture(c.class?.id);
  const hue = hueStyle(tincture);
  // The DM page shows several sheets at once, so each one's anchors carry its own prefix, and
  // each keeps its own open card.
  const prefix = `sheet${useId().replaceAll(/[^\w-]/g, "")}`;
  const [openId, setOpenId] = useState<string>();
  const trigger = useRef<HTMLElement | null>(null);
  const cards = useMemo(() => (c.missing.length > 0 ? [] : sheetCards(c)), [c]);
  const links = useMemo<CardLinks>(
    () => ({
      has: (id) => cards.some((card) => card.id === id),
      open: (id, el) => {
        trigger.current = el;
        setOpenId(id);
      },
    }),
    [cards],
  );
  const playValue = useMemo(() => ({ play: play ?? {}, onPlay }), [play, onPlay]);
  const openCard = cards.find((card) => card.id === openId);
  const classIcon = tincture?.icon ?? "wax-seal";
  const close = () => {
    setOpenId(undefined);
    // Native dialogs restore focus themselves; the fallback doesn't, so do it for both.
    trigger.current?.focus();
    trigger.current = null;
  };
  if (c.missing.length > 0) {
    return (
      <article className="sheet hued" style={hue}>
        <SheetHeader c={c} />
        <StillToChoose missing={c.missing} onFinish={onFinish} />
      </article>
    );
  }
  return (
    <PlayContext.Provider value={playValue}>
      <CardLinksContext.Provider value={links}>
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
          <Cards cards={cards} classIcon={classIcon} id={`${prefix}-cards`} />
          {openCard && <CardDialog card={openCard} classIcon={classIcon} onClose={close} />}
        </article>
      </CardLinksContext.Provider>
    </PlayContext.Provider>
  );
}
