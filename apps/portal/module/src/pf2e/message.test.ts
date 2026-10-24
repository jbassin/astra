import { describe, expect, it } from "vitest";

import { liveFlags, rollContext, rollModifierName, rollModifiers, rollOriginUuid } from ".";

function flagsOf(pf2e: unknown) {
  return liveFlags({ flags: { pf2e } });
}

describe("chat-message flags.pf2e", () => {
  it("reads an empty tree from a message with no pf2e flags", () => {
    const flags = liveFlags({});
    expect(rollContext(flags)).toBeUndefined();
    expect(rollModifierName(flags)).toBeUndefined();
    expect(rollOriginUuid(flags)).toBeUndefined();
    expect(rollModifiers(flags)).toBeUndefined();
  });

  it("reads the roll context, counting only a literal true as secret or visible", () => {
    const flags = flagsOf({
      context: {
        type: "skill-check",
        outcome: "success",
        actor: "a1",
        secret: "yes",
        dc: { value: 18, visible: 1 },
      },
    });
    expect(rollContext(flags)).toEqual({
      type: "skill-check",
      outcome: "success",
      actor: "a1",
      secret: false,
      dc: { value: 18, visible: false },
    });
  });

  it("reads the check name and origin uuid, ignoring wrong-shaped values", () => {
    expect(rollModifierName(flagsOf({ modifierName: "Perception Check" }))).toBe(
      "Perception Check",
    );
    expect(rollModifierName(flagsOf({ modifierName: 3 }))).toBeUndefined();
    expect(rollOriginUuid(flagsOf({ origin: { uuid: "Item.x" } }))).toBe("Item.x");
    expect(rollOriginUuid(flagsOf({ origin: "Item.x" }))).toBeUndefined();
  });

  it("reads modifiers in order and skips entries that are not objects", () => {
    const flags = flagsOf({
      modifiers: [{ label: "Int", modifier: 4, type: "ability", enabled: true }, null, "x"],
    });
    expect(rollModifiers(flags)).toEqual([
      { label: "Int", modifier: 4, type: "ability", enabled: true, ignored: false },
    ]);
  });
});
