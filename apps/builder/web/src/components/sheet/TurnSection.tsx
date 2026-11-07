// The top of the sheet: the four numbers a player checks most, then "On your turn", which
// sorts every attack, feature and spell by when it's used.

import type { AttackLine, Character } from "@/domain/engine";
import { attackRoll, signed, type TurnItem, turnPlan } from "@/domain/sheet";

export function Vitals({ c }: { c: Character }) {
  const extras = [
    `Passive Perception ${c.passivePerception}`,
    c.darkvision ? `Darkvision ${c.darkvision} ft.` : undefined,
    c.resistances.length > 0 ? `You take half damage from: ${c.resistances.join(", ")}` : undefined,
  ].filter(Boolean);
  return (
    <section className="sheet-section vitals" aria-label="Key numbers">
      <dl className="vital-grid">
        <div className="vital">
          <dt>Hit Points</dt>
          <dd>{c.hitPoints.max}</dd>
          <span className="vital-note">Hit Dice {c.hitPoints.hitDice}</span>
        </div>
        <div className="vital">
          <dt>Armor Class</dt>
          <dd>{c.armorClass.value}</dd>
          <span className="vital-note">What enemies must roll to hit you</span>
        </div>
        <div className="vital">
          <dt>Speed</dt>
          <dd>{c.speed.walk} ft.</dd>
          <span className="vital-note">How far you move each turn</span>
        </div>
        <div className="vital">
          <dt>Initiative</dt>
          <dd>{signed(c.initiative)}</dd>
          <span className="vital-note">Add it to a d20 when a fight starts</span>
        </div>
      </dl>
      {c.armorClass.alternatives.map((a) => (
        <p key={a.label} className="sheet-note">
          Armor Class {a.label}
        </p>
      ))}
      <p className="sheet-note">{extras.join(" · ")}</p>
    </section>
  );
}

function Attack({ a }: { a: AttackLine }) {
  return (
    <li className="turn-item attack">
      <p>
        <strong>{a.name}</strong> <span className="turn-range">({a.range})</span>
      </p>
      <p className="roll">{attackRoll(a)}</p>
      {a.mastery && (
        <p className="turn-detail">
          Mastery, {a.mastery.name}: {a.mastery.summary}
        </p>
      )}
      {a.notes.map((n) => (
        <p key={n} className="turn-detail">
          {n}
        </p>
      ))}
    </li>
  );
}

function Items({ items }: { items: TurnItem[] }) {
  return items.map((i) => (
    <li key={i.id} className="turn-item">
      <p>
        <strong>{i.name}</strong>
        {i.uses && <span className="uses"> {i.uses}</span>}
      </p>
      <p className="turn-detail">{i.detail}</p>
    </li>
  ));
}

function ActionBox({ c, plan }: { c: Character; plan: ReturnType<typeof turnPlan> }) {
  return (
    <div className="turn-box">
      <h4>Your action</h4>
      <p className="turn-hint">Pick one each turn. Most often: attack.</p>
      <ul>
        {c.attacks.map((a) => (
          <Attack key={a.name} a={a} />
        ))}
        {plan.actionSpells.length > 0 && (
          <li className="turn-item">
            <p>
              <strong>Cast a spell:</strong> {plan.actionSpells.join(", ")}. Your spells are listed
              below.
            </p>
          </li>
        )}
        <Items items={plan.action} />
        <li className="turn-item">
          <p className="turn-detail">
            Or: Dash (move again), Disengage (move away safely), Dodge (enemies have a harder time
            hitting you), Help a friend, or Hide.
          </p>
        </li>
      </ul>
    </div>
  );
}

export function OnYourTurn({ c }: { c: Character }) {
  const plan = turnPlan(c);
  return (
    <section className="sheet-section">
      <h4 className="section-title">On your turn</h4>
      <p className="sheet-note">
        Each turn you can move up to your speed and take one action. Some things let you also take a
        bonus action. Once a round, even on someone else’s turn, you can take one reaction.
      </p>
      <div className="turn-grid">
        <ActionBox c={c} plan={plan} />
        <div className="turn-box">
          <h4>Your bonus action</h4>
          <p className="turn-hint">Optional, at most one each turn.</p>
          <ul>
            {plan.bonus.length > 0 ? (
              <Items items={plan.bonus} />
            ) : (
              <li className="turn-detail">Nothing yet.</li>
            )}
          </ul>
        </div>
        <div className="turn-box">
          <h4>Your reaction</h4>
          <p className="turn-hint">At most one each round, when its trigger happens.</p>
          <ul>
            <li className="turn-item">
              <p>
                <strong>Opportunity attack</strong>
              </p>
              <p className="turn-detail">
                When an enemy you can reach moves away from you, make one melee attack against it.
              </p>
            </li>
            <Items items={plan.reaction} />
          </ul>
        </div>
        {plan.always.length > 0 && (
          <div className="turn-box wide">
            <h4>Always on, or when it says</h4>
            <ul>
              <Items items={plan.always} />
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
