/**
 * Item tools: author an item (`create-item`) and the player-facing item lookup
 * (`query-item`), which only shows what a player could see in Foundry. Its visibility
 * gates are in `./itemAccess`, the detail projection in `./itemDetail` and the name search
 * in `./itemSearch`.
 */
import {
  CreateItemParams,
  type CreateItemResult,
  QueryItemParams,
  type QueryItemResult,
  type BridgeToolHandlers,
  BridgeError,
} from "@astra/portal-shared";

import { resolveItemForFetch } from "./itemAccess";
import { buildItemDetail } from "./itemDetail";
import { searchItemsByName } from "./itemSearch";
import { buildCreatePayload, payloadSystem } from "./payloads";
import {
  auditLog,
  collectRuleWarnings,
  createChecked,
  createEmbeddedChecked,
  writeGate,
} from "./writes";

/** `create-item` (spec 0026 S2/D-1/D-6/D-7) — hand-authors a new item from scratch or
 * clones+patches a compendium base, either as a standalone world item or embedded
 * directly on an actor (`actorId`). `rulesSelections` pre-seeds
 * `flags.pf2e.rulesSelections` (the ChoiceSet-modal-avoidance pass-through, spec
 * Verified footprint). Only the actor-embedded path gets a RE read-back — a world
 * item has no owner, so pf2e never instantiates its rule elements at all. */
async function handleCreateItem(rawParams: unknown): Promise<CreateItemResult> {
  const params = CreateItemParams.parse(rawParams);
  try {
    writeGate(1);

    const payload = await buildCreatePayload("create-item", params, {
      extraFlags:
        params.rulesSelections !== undefined
          ? { pf2e: { rulesSelections: params.rulesSelections } }
          : undefined,
    });
    const sentSystem = payloadSystem(payload);

    let created: FoundryDocumentLike;
    let warnings: string[] = [];
    if (params.actorId !== undefined) {
      const actor = game.actors.get(params.actorId);
      if (!actor) {
        throw new BridgeError("not-found", `actor not found: ${params.actorId}`);
      }
      const [item] = await createEmbeddedChecked(actor, "Item", [payload]);
      if (!item) {
        throw new BridgeError("foundry-error", "item creation returned no document");
      }
      created = item;
      warnings = collectRuleWarnings(item.name, sentSystem, item);
    } else {
      // World items have no owning actor, so pf2e's data-prep (which instantiates
      // rule elements) never runs on them — there is nothing to read back (D-7).
      const docClass = getDocumentClass("Item");
      created = await createChecked(docClass, payload);
    }

    const result: CreateItemResult = {
      uuid: created.uuid,
      id: created.id,
      name: created.name,
      warnings,
    };
    auditLog("create-item", params, `ok (${created.id})`);
    return result;
  } catch (err) {
    auditLog("create-item", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** `query-item` (0028 S3/D28-5/D28-13) — an id/uuid fetch renders ONE item's full
 * detail; a name search returns a provenance-labeled hit LIST (never a single
 * item, even when exactly one hit matches — D28-5's adversarial-pass answer on
 * cross-scope name collisions, e.g. a world "Dagger" AND an embedded "Dagger"). */
async function handleQueryItem(rawParams: unknown): Promise<QueryItemResult> {
  const params = QueryItemParams.parse(rawParams);
  if (params.uuid !== undefined) {
    const resolved = await resolveItemForFetch(params.uuid);
    return { kind: "item", item: buildItemDetail(resolved) };
  }
  const hits = await searchItemsByName(params.name as string, params.limit);
  return { kind: "hits", hits };
}

/** This module's handlers, keyed by tool name; `./index.ts` assembles them into
 * `TOOL_HANDLERS`. */
export const itemHandlers = {
  "create-item": handleCreateItem,
  "query-item": handleQueryItem,
} satisfies Partial<BridgeToolHandlers>;
