// The character sheet: built from `buildCharacter`, in plain words, laid out around "On your
// turn". The player page shows it at the end of the flow, the DM page under each player, and
// the browser's print gives a clean copy with cut-out cards (print.css). While anything is
// still to choose it lists that instead of showing numbers that would be wrong.

import type { Character } from "@/domain/engine";

import { Cards } from "./Cards";
import { Details } from "./Details";
import { SpellSection } from "./SpellSection";
import { OnYourTurn, Vitals } from "./TurnSection";

function subtitle(c: Character): string {
  const species =
    c.species && (c.species.option ? `${c.species.option} ${c.species.name}` : c.species.name);
  const who = [`Level ${c.level}`, species, c.class?.name].filter(Boolean).join(" ");
  return c.background ? `${who} · ${c.background.name} background` : who;
}

function SheetHeader({ c }: { c: Character }) {
  return (
    <header className="sheet-head">
      <h3 className="sheet-name">{c.name || "Your hero"}</h3>
      <p className="sheet-sub">{subtitle(c)}</p>
      {c.look && <p className="sheet-story">{c.look}</p>}
      {c.personality && <p className="sheet-story">{c.personality}</p>}
    </header>
  );
}

function StillToChoose({ missing, onFinish }: { missing: string[]; onFinish?: () => void }) {
  return (
    <section className="sheet-section still">
      <h4>Still to choose</h4>
      <p>Your numbers appear here once these are done:</p>
      <ul>
        {missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      {onFinish && (
        <button type="button" className="button" onClick={onFinish}>
          Go to the next choice
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
  if (c.missing.length > 0) {
    return (
      <article className="sheet">
        <SheetHeader c={c} />
        <StillToChoose missing={c.missing} onFinish={onFinish} />
      </article>
    );
  }
  return (
    <article className="sheet">
      <SheetHeader c={c} />
      {onFinish && (
        <p className="sheet-print">
          <button type="button" className="button quiet" onClick={() => window.print()}>
            Print your sheet
          </button>{" "}
          The cards at the end print ready to cut out.
        </p>
      )}
      <Vitals c={c} />
      <OnYourTurn c={c} />
      <SpellSection c={c} />
      <Details c={c} />
      <Cards c={c} />
    </article>
  );
}
