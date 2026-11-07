// The spells part of the sheet: one block per source (class, fighting style, species, Magic
// Initiate), each with its save DC, attack bonus, slots and what to roll for every spell.

import type { Character, SpellcastingBlock, SpellEntry } from "@/domain/engine";
import { ABILITY_NAMES, signed, slotLine, spellGist, spellRoll, spellUses } from "@/domain/sheet";

function Spell({ s }: { s: SpellEntry }) {
  const roll = spellRoll(s);
  return (
    <li className="turn-item">
      <p>
        <strong>{s.name}</strong> <span className="uses">{spellUses(s)}</span>
      </p>
      <p className={roll ? "roll" : "turn-detail"}>{roll ?? spellGist(s.summary)}</p>
      {s.note && <p className="turn-detail">{s.note}</p>}
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
      <p className="sheet-note">
        Uses {ABILITY_NAMES[b.ability]} · Spell save DC {b.saveDc} · Spell attack{" "}
        {signed(b.attackBonus)}
      </p>
      {slots && <p className="sheet-note">{slots}</p>}
      <ul>
        {[...b.cantrips, ...b.spells].map((s) => (
          <Spell key={s.id} s={s} />
        ))}
      </ul>
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
    <section className="sheet-section">
      <h4 className="section-title">Your spells</h4>
      <p className="sheet-note">
        A cantrip costs nothing. A level 1 spell uses a spell slot unless it says otherwise. When a
        spell asks for a save, the target rolls a d20 and needs to reach your DC.
      </p>
      {blocks.map((b) => (
        <Block key={b.label} b={b} />
      ))}
    </section>
  );
}
