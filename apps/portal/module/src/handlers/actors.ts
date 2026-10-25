/**
 * Actor write tools: author an NPC or hazard (`create-actor`) and change a condition on an
 * actor through pf2e's ConditionManager (`apply-condition`).
 */
import {
  ApplyConditionParams,
  type ApplyConditionResult,
  type ConditionAction,
  CreateActorParams,
  type CreateActorResult,
  type PersistentDamageParams,
  type BridgeToolHandlers,
  BridgeError,
} from "@astra/portal-shared";

import { buildCreatePayload, payloadSystem, withStamp } from "./payloads";
import {
  auditLog,
  collectRuleWarnings,
  createChecked,
  createEmbeddedChecked,
  resolveFolderId,
  writeGate,
} from "./writes";

/** `create-actor` — hand-authors a new NPC/hazard actor
 * from scratch, or clones+patches a compendium base (`baseUuid`), then creates any
 * embedded `items[]` alongside it in the same call. `writeGate` counts the actor
 * itself plus every requested item against the create cap; the actor's own creation never gets a RE
 * read-back (actors don't carry rule elements directly), but each embedded item does
 * once it's OWNED by the actor. */
async function handleCreateActor(rawParams: unknown): Promise<CreateActorResult> {
  const params = CreateActorParams.parse(rawParams);
  const itemCount = params.items?.length ?? 0;
  try {
    writeGate(1 + itemCount);
    const folderId = resolveFolderId(params.folder, "Actor");

    const payload = await buildCreatePayload("create-actor", params, { folder: folderId });

    const docClass = getDocumentClass("Actor");
    // Narrowing cast, not a lossy one: `getDocumentClass("Actor").create()` always
    // mints a real Actor document (which always carries `createEmbeddedDocuments`);
    // `createChecked`'s own return type stays the general `FoundryDocumentLike`
    // because it's shared by every document type this module creates.
    const actor = (await createChecked(docClass, payload)) as FoundryActor;

    let itemUuids: string[] | undefined;
    const warnings: string[] = [];
    if (params.items !== undefined && params.items.length > 0) {
      const itemsWithStamps = params.items.map((item) => ({
        ...item,
        flags: withStamp(item.flags, "create-actor"),
      }));
      const createdItems = await createEmbeddedChecked(actor, "Item", itemsWithStamps);
      itemUuids = createdItems.map((it) => it.uuid);
      createdItems.forEach((it, i) => {
        const source = params.items?.[i];
        const sentSystem = source !== undefined ? payloadSystem(source) : undefined;
        warnings.push(...collectRuleWarnings(it.name, sentSystem, it));
      });
    }

    const result: CreateActorResult = {
      uuid: actor.uuid,
      id: actor.id,
      name: actor.name,
      itemUuids,
      warnings,
    };
    auditLog(
      "create-actor",
      params,
      `ok (actor ${actor.id}${itemUuids ? `, ${itemUuids.length} item(s)` : ""})`,
    );
    return result;
  } catch (err) {
    auditLog("create-actor", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** Looks up one of {@link FoundryActor}'s three ConditionManager-backed mutators and
 * throws a typed `foundry-error` (naming the method) if it's missing at runtime,
 * rather than a raw `TypeError` — defense in depth even though the ambient type
 * declares all three as required (this module targets pf2e exclusively, `types/
 * foundry.d.ts`'s `FoundryActor` doc comment). */
function requireActorMethod<
  K extends "increaseCondition" | "decreaseCondition" | "toggleCondition",
>(actor: FoundryActor, method: K): FoundryActor[K] {
  const fn = actor[method];
  if (typeof fn !== "function") {
    throw new BridgeError(
      "foundry-error",
      `actor does not support ${method} — is this world running the pf2e system?`,
    );
  }
  return fn;
}

/** Condition read-back: after ANY apply-condition action, report the resulting state by
 * inspecting the actor's own `itemTypes.condition` array directly — the same surface
 * `ActorPF2e#increaseCondition` itself reads internally (verified `pf2e-7.12.2`
 * `src/module/actor/base.ts:1777`) — rather than trusting any one action method's own
 * return value (increase/decrease/toggle each return a different, inconsistent
 * shape: the condition itself, `void`, or a `boolean`). */
function readConditionState(
  actor: FoundryActor,
  slug: string,
): { active: boolean; value?: number } {
  const match = actor.itemTypes.condition.find((c) => c.slug === slug && c.active);
  return { active: match !== undefined, value: match?.value ?? undefined };
}

/** The persistent-damage special case, verified against pf2e-7.12.2's own
 * `PersistentDamageEditor#onClickAdd` (`src/module/item/condition/persistent-damage-
 * editor.ts:114-130`): a persistent-damage instance is created by taking
 * `game.pf2e.ConditionManager.getCondition("persistent-damage").toObject()` and
 * deep-merging `{system: {persistent: {formula, damageType, dc}}}` on top, then
 * `actor.createEmbeddedDocuments("Item", [...])` — NEVER `actor.increaseCondition`,
 * which for this one slug opens `PersistentDamageEditor` as a GM-browser dialog
 * instead of creating anything at all (`src/module/actor/base.ts:1766-1770`), a UI
 * trigger this bridge must never cause. The created item is portal-stamped like
 * every other document this module creates. */
async function createPersistentDamage(
  actor: FoundryActor,
  persistentDamage: PersistentDamageParams | undefined,
): Promise<void> {
  if (!persistentDamage) {
    throw new BridgeError(
      "validation-failed",
      "persistent-damage requires persistentDamage: {formula, damageType, dc?} — increasing " +
        "this condition without them would otherwise open an editor dialog in the GM's own " +
        "browser, which this bridge never triggers",
    );
  }
  if (typeof game.pf2e?.ConditionManager?.getCondition !== "function") {
    throw new BridgeError(
      "foundry-error",
      "game.pf2e.ConditionManager is not available — is this world running the pf2e system?",
    );
  }
  const base = game.pf2e.ConditionManager.getCondition("persistent-damage").toObject();
  const persistentSource = foundry.utils.mergeObject(
    base,
    {
      system: {
        persistent: {
          formula: persistentDamage.formula,
          damageType: persistentDamage.damageType,
          dc: persistentDamage.dc,
        },
      },
    },
    { inplace: false },
  );
  persistentSource.flags = withStamp(persistentSource.flags, "apply-condition");
  await createEmbeddedChecked(actor, "Item", [persistentSource]);
}

/** Routes a `persistent-damage` `apply-condition` call to the non-dialog path
 * ({@link createPersistentDamage}) or, when the call is actually a removal, to pf2e's
 * OWN `decreaseCondition` — which already special-cases persistent-damage as a plain
 * delete-by-key with no dialog risk at all (`src/module/actor/base.ts:1745-1750`), so
 * that half needs no bespoke handling here. A `toggle` decides which branch it is by
 * reading the CURRENT state first (the condition read-back, reused for the decision as well as
 * the result). */
async function applyPersistentDamage(
  actor: FoundryActor,
  action: ConditionAction,
  persistentDamage: PersistentDamageParams | undefined,
): Promise<void> {
  const currentlyActive = readConditionState(actor, "persistent-damage").active;
  const removing = action === "decrease" || (action === "toggle" && currentlyActive);
  if (removing) {
    await requireActorMethod(actor, "decreaseCondition").call(actor, "persistent-damage");
    return;
  }
  // "increase", or a toggle turning it ON — both need the non-dialog create.
  await createPersistentDamage(actor, persistentDamage);
}

/** Every non-`persistent-damage` slug: pf2e's own `ConditionManager`-backed actor
 * methods handle add/remove/toggle correctly with no dialog risk — this
 * module never hand-builds a condition item for these. `decreaseCondition` takes no
 * amount parameter of its own (`pf2e-7.12.2` `src/module/actor/base.ts:1737-1759`
 * steps by exactly 1 per call), so a `decrease` with `value > 1` is applied as that
 * many sequential calls; `increaseCondition`'s own `value` option IS an addend, so
 * `increase` needs only one call. */
async function applyStandardCondition(
  actor: FoundryActor,
  slug: string,
  action: ConditionAction,
  value: number | undefined,
): Promise<void> {
  if (action === "increase") {
    const fn = requireActorMethod(actor, "increaseCondition");
    await fn.call(actor, slug, value !== undefined ? { value } : undefined);
  } else if (action === "decrease") {
    const fn = requireActorMethod(actor, "decreaseCondition");
    for (let i = 0; i < (value ?? 1); i++) {
      await fn.call(actor, slug);
    }
  } else {
    await requireActorMethod(actor, "toggleCondition").call(actor, slug);
  }
}

/** `apply-condition` — wraps `game.pf2e.ConditionManager`'s own
 * actor-side surface for increase/decrease/toggle; never hand-builds a condition
 * item except in the persistent-damage non-dialog path (see
 * {@link applyPersistentDamage}). `writeGate(1)` because this IS a write (it creates
 * or mutates a condition item embedded on the actor) even though it never counts
 * against the create cap (server `mcp.ts` registers no `creates` for this tool). */
async function handleApplyCondition(rawParams: unknown): Promise<ApplyConditionResult> {
  const params = ApplyConditionParams.parse(rawParams);
  try {
    writeGate(1);
    const actor = game.actors.get(params.actorId);
    if (!actor) {
      throw new BridgeError("not-found", `actor not found: ${params.actorId}`);
    }

    if (params.slug === "persistent-damage") {
      await applyPersistentDamage(actor, params.action, params.persistentDamage);
    } else {
      await applyStandardCondition(actor, params.slug, params.action, params.value);
    }

    const state = readConditionState(actor, params.slug);
    const result: ApplyConditionResult = {
      actorUuid: actor.uuid,
      slug: params.slug,
      active: state.active,
      value: state.value,
    };
    auditLog(
      "apply-condition",
      params,
      `ok (${params.slug} ${params.action} on ${actor.id} -> active=${state.active})`,
    );
    return result;
  } catch (err) {
    auditLog("apply-condition", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** This module's handlers, keyed by tool name; `./index.ts` assembles them into
 * `TOOL_HANDLERS`. */
export const actorHandlers = {
  "create-actor": handleCreateActor,
  "apply-condition": handleApplyCondition,
} satisfies Partial<BridgeToolHandlers>;
