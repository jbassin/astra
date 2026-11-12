// The top of the sheet: the four numbers a player checks most, as medallions, then "On your
// turn", which sorts every attack, feature and spell by when it's used into three columns.
// An attack shows what to roll; everything else shows its name and how often, and its card
// says what it does.

import { Fragment } from "react";

import type { AttackLine, Character } from "@/domain/engine";
import { attackCardId, attackRoll, signed, type TurnItem, turnPlan } from "@/domain/sheet";
import type { IconName } from "@/generated/icons";
import { damageIcon, SLOT_ICON } from "@/ui/heraldry";
import { Icon } from "@/ui/Icon";

import { CardName } from "./CardLinks";

function Medallion({
  icon,
  label,
  value,
  note,
}: {
  icon: IconName;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="vital">
      <dt>
        <Icon name={icon} className="vital-icon" />
        {label}
      </dt>
      <dd className="vital-value">{value}</dd>
      <dd className="vital-note">{note}</dd>
    </div>
  );
}

export function Vitals({ c }: { c: Character }) {
  return (
    <section className="sheet-section vitals" aria-label="Key numbers">
      <dl className="vital-grid">
        <Medallion
          icon="heart-plus"
          label="Hit Points"
          value={String(c.hitPoints.max)}
          note={`Hit Dice ${c.hitPoints.hitDice}`}
        />
        <Medallion
          icon="checked-shield"
          label="Armor Class"
          value={String(c.armorClass.value)}
          note="What enemies must roll to hit you"
        />
        <Medallion
          icon="run"
          label="Speed"
          value={`${c.speed.walk} ft.`}
          note="How far you move each turn"
        />
        <Medallion
          icon="hourglass"
          label="Initiative"
          value={signed(c.initiative)}
          note="Add it to a d20 when a fight starts"
        />
      </dl>
      <ul className="vital-extras">
        {c.armorClass.alternatives.map((a) => (
          <li key={a.label}>
            <Icon name="checked-shield" />
            Armor Class {a.label}
          </li>
        ))}
        <li>
          <Icon name="eye-target" />
          Passive Perception {c.passivePerception}
        </li>
        {c.darkvision ? (
          <li>
            <Icon name="owl" />
            Darkvision {c.darkvision} ft.
          </li>
        ) : null}
        {c.resistances.length > 0 && (
          <li>
            <Icon name="magic-shield" />
            You take half damage from: {c.resistances.join(", ")}
          </li>
        )}
      </ul>
    </section>
  );
}

function Attack({ a, cardId }: { a: AttackLine; cardId?: string }) {
  return (
    <li className="turn-item attack">
      <p className="turn-name">
        <strong>
          <CardName id={cardId}>{a.name}</CardName>
        </strong>{" "}
        <span className="turn-range">{a.range}</span>
      </p>
      <p className="roll">
        <Icon name={damageIcon(a.damageType)} className="roll-icon" />
        <span>{attackRoll(a)}</span>
      </p>
      {a.mastery && (
        <p className="turn-detail">
          <span className="mastery">Mastery, {a.mastery.name}:</span> {a.mastery.summary}
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
      <p className="turn-name">
        <strong>
          <CardName id={i.id}>{i.name}</CardName>
        </strong>
        {i.uses && <span className="uses">{i.uses}</span>}
      </p>
    </li>
  ));
}

function ActionBox({ c, plan }: { c: Character; plan: ReturnType<typeof turnPlan> }) {
  return (
    <div className="turn-box" data-slot="action">
      <h4>
        <Icon name={SLOT_ICON.action} className="turn-icon" />
        Your action
      </h4>
      <p className="turn-hint">Pick one each turn. Most often: attack.</p>
      <ul>
        {c.attacks.map((a) => (
          <Attack key={a.name} a={a} cardId={attackCardId(c, a)} />
        ))}
        {plan.actionSpells.length > 0 && (
          <li className="turn-item">
            <p>
              <strong>Cast a spell:</strong>{" "}
              {plan.actionSpells.map((s, n) => (
                <Fragment key={s.id}>
                  {n > 0 && ", "}
                  <CardName id={s.id}>{s.name}</CardName>
                </Fragment>
              ))}
              . Your spells are listed below.
            </p>
          </li>
        )}
        <Items items={plan.action} />
        <li className="turn-item turn-other">
          <p className="turn-detail">
            Or: Dash (move again), Disengage (move away safely), Dodge (enemies have a harder time
            hitting you), Help a friend, or Hide.
          </p>
        </li>
      </ul>
    </div>
  );
}

export function OnYourTurn({ c, id }: { c: Character; id?: string }) {
  const plan = turnPlan(c);
  return (
    <section className="sheet-section turn" id={id}>
      <h4 className="section-title">On your turn</h4>
      <p className="sheet-note">
        Each turn you can move up to your speed and take one action. Some things let you also take a
        bonus action. Once a round, even on someone else’s turn, you can take one reaction.
      </p>
      <div className="turn-grid">
        <ActionBox c={c} plan={plan} />
        <div className="turn-box" data-slot="bonus">
          <h4>
            <Icon name={SLOT_ICON.bonus} className="turn-icon" />
            Your bonus action
          </h4>
          <p className="turn-hint">Optional, at most one each turn.</p>
          <ul>
            {plan.bonus.length > 0 ? (
              <Items items={plan.bonus} />
            ) : (
              <li className="turn-empty">Nothing yet.</li>
            )}
          </ul>
        </div>
        <div className="turn-box" data-slot="reaction">
          <h4>
            <Icon name={SLOT_ICON.reaction} className="turn-icon" />
            Your reaction
          </h4>
          <p className="turn-hint">At most one each round, when its trigger happens.</p>
          <ul>
            <li className="turn-item">
              <p className="turn-name">
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
          <div className="turn-box wide" data-slot="always">
            <h4>
              <Icon name={SLOT_ICON.always} className="turn-icon" />
              Always on, or when it says
            </h4>
            <ul>
              <Items items={plan.always} />
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
