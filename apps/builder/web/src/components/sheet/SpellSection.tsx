// The spells part of the sheet: one block per source (class, fighting style, species, Magic
// Initiate), each with its save DC, attack bonus, slots and the names of its spells. What a
// spell does, what to roll and how often are on its card.

import { CONTENT } from "@/domain/content";
import type { Character, SpellcastingBlock, SpellEntry } from "@/domain/engine";
import { slotTracker, spellTracker } from "@/domain/play";
import { ABILITY_NAMES, signed, slotLine } from "@/domain/sheet";
import type { IconName } from "@/generated/icons";
import { ABILITY_ICON, schoolIcon } from "@/ui/heraldry";
import { Icon } from "@/ui/Icon";

import { CardName } from "./CardLinks";
import { Pips } from "./Pips";

/** One level's spells, by name; each carries its school's icon, as its card does. */
function Names({ title, icon, spells }: { title: string; icon: IconName; spells: SpellEntry[] }) {
  if (spells.length === 0) return null;
  return (
    <>
      <h6 className="spell-level">
        <Icon name={icon} />
        {title}
      </h6>
      <ul className="spell-names">
        {spells.map((s) => {
          const tracker = spellTracker(s);
          return (
            <li key={s.id}>
              <Icon name={schoolIcon(CONTENT.spells[s.id]?.school)} />
              <CardName id={`spell-${s.id}`}>{s.name}</CardName>
              {tracker && <Pips tracker={tracker} />}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Block({ b }: { b: SpellcastingBlock }) {
  const slots = slotLine(b.slots, b.pactSlotLevel);
  const tracker = slotTracker(b);
  return (
    <div className="spell-block">
      <h5>{b.label}</h5>
      <ul className="spell-stats">
        <li>
          <Icon name={ABILITY_ICON[b.ability]} />
          Uses {ABILITY_NAMES[b.ability]}
        </li>
        <li>
          <span className="stat-label">Spell save DC</span>
          <strong className="stat-num">{b.saveDc}</strong>
        </li>
        <li>
          <span className="stat-label">Spell attack</span>
          <strong className="stat-num">{signed(b.attackBonus)}</strong>
        </li>
      </ul>
      {slots && tracker && (
        <p className="slot-line">
          <Pips tracker={tracker} className="slot-pips" />
          {slots}
        </p>
      )}
      <Names title="Cantrips" icon="magic-swirl" spells={b.cantrips} />
      <Names title="Level 1 spells" icon="spell-book" spells={b.spells} />
    </div>
  );
}

export function SpellSection({ c, id }: { c: Character; id?: string }) {
  const blocks = c.spellcasting.filter((b) => b.cantrips.length + b.spells.length > 0);
  if (blocks.length === 0) return null;
  return (
    <section className="sheet-section spells" id={id}>
      <h4 className="section-title">Your spells</h4>
      <p className="sheet-note">
        A cantrip costs nothing. A level 1 spell uses a spell slot unless it says otherwise. When a
        spell asks for a save, the target rolls a d20 and needs to reach your DC.
      </p>
      <div className="spell-blocks">
        {blocks.map((b) => (
          <Block key={b.label} b={b} />
        ))}
      </div>
    </section>
  );
}
