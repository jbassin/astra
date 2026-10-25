/**
 * Scene tools: list scenes, describe the active one, and place tokens and lights on a scene.
 */
import {
  type CreatedTokenRow,
  CreateLightParams,
  type CreateLightResult,
  CreateTokenParams,
  type CreateTokenResult,
  type CurrentSceneInfo,
  GetCurrentSceneParams,
  type GetCurrentSceneResult,
  ListScenesParams,
  type ListScenesResult,
  type BridgeToolHandlers,
  BridgeError,
} from "@astra/portal-shared";

import { cloneFromCompendium } from "./compendium";
import { portalStamp, withStamp } from "./payloads";
import { auditLog, createEmbeddedChecked, writeGate } from "./writes";

/** `list-scenes` — every scene in the world, GM's own `active` flag. */
function handleListScenes(rawParams: unknown): ListScenesResult {
  ListScenesParams.parse(rawParams);
  const scenes = Array.from(game.scenes.values()).map((scene) => ({
    id: scene.id,
    name: scene.name,
    active: scene.active,
  }));
  return { scenes };
}

/** `get-current-scene` — `scene: null` when the world is idle (no active
 * scene) is a normal, non-error result: an idle world isn't a failure to report. */
function handleGetCurrentScene(rawParams: unknown): GetCurrentSceneResult {
  GetCurrentSceneParams.parse(rawParams);
  const scene = game.scenes.active;
  if (!scene) return { scene: null };
  const info: CurrentSceneInfo = {
    id: scene.id,
    name: scene.name,
    grid: { size: scene.grid.size, type: scene.grid.type },
    width: scene.width,
    height: scene.height,
    tokenCount: scene.tokens.size,
  };
  return { scene: info };
}

/** `create-light` — places a new `AmbientLight` embedded
 * document on a scene (an explicit `sceneId`, or the active scene when omitted),
 * mapping the wire's `config` subset onto Foundry's `LightData` shape 1:1. Returns
 * only the created light's embedded uuid, hand-built as `Scene.<id>.AmbientLight.
 * <id>` (there is no scene-read tool to fetch it back through). */
async function handleCreateLight(rawParams: unknown): Promise<CreateLightResult> {
  const params = CreateLightParams.parse(rawParams);
  try {
    writeGate(1);
    const scene =
      params.sceneId !== undefined ? game.scenes.get(params.sceneId) : game.scenes.active;
    if (!scene) {
      throw new BridgeError(
        "not-found",
        params.sceneId !== undefined
          ? `scene not found: ${params.sceneId}`
          : "no active scene — open a scene in Foundry, or pass sceneId",
      );
    }

    const config: Record<string, unknown> = {};
    const c = params.config;
    if (c?.bright !== undefined) config.bright = c.bright;
    if (c?.dim !== undefined) config.dim = c.dim;
    if (c?.color !== undefined) config.color = c.color;
    if (c?.alpha !== undefined) config.alpha = c.alpha;
    if (c?.angle !== undefined) config.angle = c.angle;
    if (c?.negative !== undefined) config.negative = c.negative;
    if (c?.animation !== undefined) {
      const animation: Record<string, unknown> = {};
      if (c.animation.type !== undefined) animation.type = c.animation.type;
      if (c.animation.speed !== undefined) animation.speed = c.animation.speed;
      if (c.animation.intensity !== undefined) animation.intensity = c.animation.intensity;
      config.animation = animation;
    }
    if (c?.darkness !== undefined) {
      const darkness: Record<string, unknown> = {};
      if (c.darkness.min !== undefined) darkness.min = c.darkness.min;
      if (c.darkness.max !== undefined) darkness.max = c.darkness.max;
      config.darkness = darkness;
    }

    const lightData: Record<string, unknown> = {
      x: params.x,
      y: params.y,
      hidden: params.hidden ?? false,
      config,
      flags: portalStamp("create-light"),
    };
    const [created] = await createEmbeddedChecked(scene, "AmbientLight", [lightData]);
    if (!created) {
      throw new BridgeError("foundry-error", "AmbientLight creation returned no document");
    }
    const lightUuid = `Scene.${scene.id}.AmbientLight.${created.id}`;
    const result: CreateLightResult = { sceneId: scene.id, lightUuid, warnings: [] };
    auditLog("create-light", params, `ok (${lightUuid})`);
    return result;
  } catch (err) {
    auditLog("create-light", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** `create-token` ("import-then-tokenize") — resolves the actor
 * either from an existing world `actorId` or by importing `uuid` first (reusing
 * {@link importFromCompendium}, so the same clone-only/folder/write-gate rules apply
 * either way), then drops `quantity` tokens onto the active scene, each offset by one
 * grid square so they don't stack exactly on top of each other. */
async function handleCreateToken(rawParams: unknown): Promise<CreateTokenResult> {
  const params = CreateTokenParams.parse(rawParams);
  try {
    writeGate(params.quantity);
    const scene = game.scenes.active;
    if (!scene) {
      throw new BridgeError("not-found", "no active scene — open a scene in Foundry first");
    }

    let actor: FoundryActor;
    if (params.actorId !== undefined) {
      const found = game.actors.get(params.actorId);
      if (!found) {
        throw new BridgeError("not-found", `actor not found: ${params.actorId}`);
      }
      actor = found;
    } else {
      // The params refine guarantees exactly one of uuid/actorId is set. Use the
      // FRESHLY created document directly (cloneFromCompendium, not the compact-row
      // importFromCompendium) — no need to round-trip through game.actors.get, and it
      // sidesteps relying on exactly when/how the world collection updates.
      const [imported] = await cloneFromCompendium(
        params.uuid as string,
        1,
        undefined,
        "create-token",
      );
      if (!imported) {
        throw new BridgeError("foundry-error", "import produced no document to tokenize");
      }
      // A pf2e Actor compendium clone always creates a real Actor document, which
      // Foundry always instantiates with getTokenDocument — this narrows the general
      // FoundryDocumentLike createDocuments returns back to the actor-specific surface.
      actor = imported as FoundryActor;
    }

    const gridSize = scene.grid.size || 100;
    const tokenData: Record<string, unknown>[] = [];
    for (let i = 0; i < params.quantity; i++) {
      const tokenDoc = await actor.getTokenDocument({
        x: params.x + i * gridSize,
        y: params.y + i * gridSize,
      });
      const obj = tokenDoc.toObject();
      // The token document itself is a portal creation too, so it carries the stamp.
      obj.flags = withStamp(obj.flags, "create-token");
      tokenData.push(obj);
    }
    const createdTokens = await scene.createEmbeddedDocuments("Token", tokenData);
    const tokens: CreatedTokenRow[] = createdTokens.map((t, i) => {
      const obj = t.toObject();
      return {
        id: t.id,
        x: typeof obj.x === "number" ? obj.x : params.x + i * gridSize,
        y: typeof obj.y === "number" ? obj.y : params.y + i * gridSize,
      };
    });

    const result: CreateTokenResult = {
      actor: { uuid: actor.uuid, id: actor.id, name: actor.name },
      tokens,
      sceneId: scene.id,
    };
    auditLog("create-token", params, `ok (${tokens.length} token(s) on scene ${scene.id})`);
    return result;
  } catch (err) {
    auditLog("create-token", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** This module's handlers, keyed by tool name; `./index.ts` assembles them into
 * `TOOL_HANDLERS`. */
export const sceneHandlers = {
  "list-scenes": handleListScenes,
  "get-current-scene": handleGetCurrentScene,
  "create-token": handleCreateToken,
  "create-light": handleCreateLight,
} satisfies Partial<BridgeToolHandlers>;
