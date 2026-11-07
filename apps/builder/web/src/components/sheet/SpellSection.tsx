// The spells part of the sheet: one block per source (class, fighting style, species, Magic
// Initiate), each with its save DC, attack bonus, slots and what to roll for every spell.

import { CONTENT } from "@/domain/content";
import type { Character, SpellcastingBlock, SpellEntry } from "@/domain/engine";
import { ABILITY_NAMES, signed, slotLine, spellGist, spellRoll, spellUses } from "@/domain/sheet";
import type { IconName } from "@/generated/icons";
import { ABILITY_ICON, damageIcon, schoolIcon } from "@/ui/heraldry";
import { Icon } from "@/ui/Icon";

/** The damage type's icon, a heart for a heal, else the d20. */
function rollIcon(s: SpellEntry): IconName {
  if (s.attack?.damageType) return damageIcon(s.attack.damageType);
  return s.healing ? "heart-plus" : "dice-twenty-faces-twenty";
}

function Spell({ s }: { s: SpellEntry }) {
  const roll = spellRoll(s);
  return (
    <li className="spell" data-level={s.level}>
      <Icon name={schoolIcon(CONTENT.spells[s.id]?.school)} className="spell-icon" />
      <div className="spell-main">
        <p className="turn-name">
          <strong>{s.name}</strong> <span className="uses">{spellUses(s)}</span>
        </p>
        {roll ? (
          <p className="roll">
            <Icon name={rollIcon(s)} className="roll-icon" />
            <span>{roll}</span>
          </p>
        ) : (
          <p className="turn-detail">{spellGist(s.summary)}</p>
        )}
        {s.note && <p className="turn-detail">{s.note}</p>}
      </div>
    </li>
  );
}

function Block({ b }: { b: SpellcastingBlock }) {
  const slots = slotLine(b.slots, b.pactSlotLevel);
  const prepared = new Set(b.spells.map((s) => s.id));
  const unprepared = (b.spellbook ?? []).filter((s) => !prepared.has(s.id));
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
      {slots && (
        <p className="slot-line">
          <span className="slot-pips" aria-hidden="true">
            {Array.from({ length: b.slots?.[0] ?? 0 }, (_, n) => n).map((n) => (
              <span key={n} className="slot-pip" />
            ))}
          </span>
          {slots}
        </p>
      )}
      {b.cantrips.length > 0 && (
        <>
          <h6 className="spell-level">
            <Icon name="magic-swirl" />
            Cantrips
          </h6>
          <ul className="spell-list">
            {b.cantrips.map((s) => (
              <Spell key={s.id} s={s} />
            ))}
          </ul>
        </>
      )}
      {b.spells.length > 0 && (
        <>
          <h6 className="spell-level">
            <Icon name="spell-book" />
            Level 1 spells
          </h6>
          <ul className="spell-list">
            {b.spells.map((s) => (
              <Spell key={s.id} s={s} />
            ))}
          </ul>
        </>
      )}
      {unprepared.length > 0 && (
        <p className="sheet-note">
          Also in your spellbook (swap them in after a Long Rest):{" "}
          {unprepared.map((s) => s.name).join(", ")}.
        </p>
      )}
    </div>
  );
}

export function SpellSection({ c }: { c: Character }) {
  const blocks = c.spellcasting.filter((b) => b.cantrips.length + b.spells.length > 0);
  if (blocks.length === 0) return null;
  return (
    <section className="sheet-section spells">
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
