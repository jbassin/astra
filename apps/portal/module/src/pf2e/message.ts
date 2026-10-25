/**
 * Chat-message accessors: the `flags.pf2e` fields pf2e writes onto a check or damage roll's
 * message (verified against `pf2e.mjs`: the context at ~:23931/:23028/:383, the modifier
 * list at :24070, the origin from `Item#getOriginData`). Each reads a {@link Pf2eFlags} tree
 * from {@link liveFlags}; every one is fail-soft and returns `undefined` for a missing or
 * wrong-shaped field.
 */
import {
  numberOrUndefined,
  type Pf2eFlags,
  record,
  recordOrUndefined,
  stringOrUndefined,
} from "./data";

/** `flags.pf2e.context`: pf2e's own check and damage-roll taxonomy. */
export interface Pf2eRollContext {
  type?: string;
  outcome?: string;
  actor?: string;
  secret: boolean;
  dc?: { value?: number; visible: boolean };
}

/** `flags.pf2e.context`, or `undefined` for a message with none (a plain `/roll` has no
 * `flags.pf2e` at all). `secret` is true only for a literal `true`, as is `dc.visible`. */
export function rollContext(flags: Pf2eFlags): Pf2eRollContext | undefined {
  const context = recordOrUndefined(flags.context);
  if (!context) return undefined;
  const dc = recordOrUndefined(context.dc);
  return {
    type: stringOrUndefined(context.type),
    outcome: stringOrUndefined(context.outcome),
    actor: stringOrUndefined(context.actor),
    secret: context.secret === true,
    dc: dc ? { value: numberOrUndefined(dc.value), visible: dc.visible === true } : undefined,
  };
}

/** `flags.pf2e.modifierName`: the check's display name ("Perception Check"). */
export function rollModifierName(flags: Pf2eFlags): string | undefined {
  return stringOrUndefined(flags.modifierName);
}

/** `flags.pf2e.origin.uuid`: the item the roll came from. pf2e stores no name for it. */
export function rollOriginUuid(flags: Pf2eFlags): string | undefined {
  return stringOrUndefined(record(flags.origin).uuid);
}

/** One serialized `ModifierPF2e#toObject()` entry of `flags.pf2e.modifiers`. `enabled` and
 * `ignored` are true only for a literal `true`. */
interface Pf2eRollModifier {
  label?: string;
  modifier?: number;
  type?: string;
  enabled: boolean;
  ignored: boolean;
}

/** `flags.pf2e.modifiers`, in stored order, skipping entries that are not objects;
 * `undefined` when the flag is not an array (a plain `/roll` or an older message shape). */
export function rollModifiers(flags: Pf2eFlags): Pf2eRollModifier[] | undefined {
  const raw = flags.modifiers;
  if (!Array.isArray(raw)) return undefined;
  const modifiers: Pf2eRollModifier[] = [];
  for (const entry of raw) {
    const m = recordOrUndefined(entry);
    if (!m) continue;
    modifiers.push({
      label: stringOrUndefined(m.label),
      modifier: numberOrUndefined(m.modifier),
      type: stringOrUndefined(m.type),
      enabled: m.enabled === true,
      ignored: m.ignored === true,
    });
  }
  return modifiers;
}
