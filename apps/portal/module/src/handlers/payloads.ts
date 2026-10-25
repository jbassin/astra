/**
 * Builders for the payloads the write tools hand to Foundry's `create()`: the portal
 * creation stamp every created document carries, and the clone-or-author create payload
 * `create-actor` and `create-item` share. A payload's pf2e `system` stays opaque;
 * only the fields portal itself sets are typed.
 */
import { BridgeError } from "@astra/portal-shared";

/** True for any non-null object: the shape a payload field must have before portal merges
 * into it or reads from it. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/** `flags["astra-portal"]`: the stamp `delete-document` reads back. */
interface PortalStamp {
  "astra-portal": { created: true; tool: string; ts: string };
}

/** Every document any portal tool creates gets this stamped into its `flags`,
 * additively merged alongside whatever flags the payload already carries. `delete-
 * document` reads `flags["astra-portal"].created` back to refuse deleting
 * anything portal didn't make itself — so this must land on every create path.
 * Never applied to an update — only to a document at the moment it's created. */
export function portalStamp(tool: string): PortalStamp {
  return { "astra-portal": { created: true, tool, ts: new Date().toISOString() } };
}

/** Merges a portal stamp (optionally plus more flag data) onto an existing `flags`
 * object without disturbing whatever the caller/base document already put there —
 * the stamp is additive-only (a hand-authored document's OWN flags, e.g. a cloned
 * compendium item's existing `flags.pf2e`, must survive untouched). A missing or
 * non-object `flags` counts as empty. */
export function withStamp(
  existingFlags: unknown,
  tool: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const base = isRecord(existingFlags) ? existingFlags : {};
  return foundry.utils.mergeObject(base, { ...portalStamp(tool), ...extra }, { inplace: false });
}

/** The `system` a payload sends, when it is an object: what the rule-element read-back
 * (`collectRuleWarnings`) compares the created item against. */
export function payloadSystem(
  payload: Readonly<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  return isRecord(payload.system) ? payload.system : undefined;
}

/** What a caller of `create-actor` or `create-item` asks for. */
interface CreateRequest {
  /** A compendium document to clone and patch; absent means author from scratch. */
  baseUuid?: string;
  name: string;
  /** The pf2e subtype; used only when authoring from scratch (a clone keeps its own). */
  type: string;
  system?: Record<string, unknown>;
  img?: string;
}

/** A document create payload: the fields portal sets, plus (for a clone) the rest of the
 * base document's stored source, verbatim. */
interface CreatePayload extends Record<string, unknown> {
  name?: unknown;
  type?: unknown;
  system?: unknown;
  img?: unknown;
  folder?: string;
  flags: Record<string, unknown>;
}

/** Clone+patch or author from scratch, shared by `create-actor`/`create-item`. With a `baseUuid`:
 * resolve the compendium document (never a world uuid — mirrors `cloneFromCompendium`'s
 * own guard), take its `toObject()` verbatim, strip the id, then deep-merge the caller's
 * `name`/`system`/`img` on top via `foundry.utils.mergeObject` (never mutates the source
 * compendium document — `toObject()` already handed back a fresh plain object). Without
 * one: author `{name, type, system?, img?}` from scratch. Either way,
 * then set `folder` when given and stamp `flags` for `tool`, merging `extraFlags` in. */
export async function buildCreatePayload(
  tool: string,
  request: CreateRequest,
  options: { folder?: string; extraFlags?: Record<string, unknown> } = {},
): Promise<CreatePayload> {
  const fields = (await clonedBase(request)) ?? {
    name: request.name,
    type: request.type,
    ...(request.system !== undefined ? { system: request.system } : {}),
    ...(request.img !== undefined ? { img: request.img } : {}),
  };
  return {
    ...fields,
    ...(options.folder !== undefined ? { folder: options.folder } : {}),
    flags: withStamp(fields.flags, tool, options.extraFlags),
  };
}

/** The compendium base merged with the request's patch, or `undefined` without a
 * `baseUuid`. */
async function clonedBase(request: CreateRequest): Promise<Record<string, unknown> | undefined> {
  const { baseUuid } = request;
  if (baseUuid === undefined) return undefined;
  if (!baseUuid.startsWith("Compendium.")) {
    throw new BridgeError(
      "foundry-error",
      `baseUuid must be a compendium uuid (starting "Compendium."), got: ${baseUuid}`,
    );
  }
  const doc = await fromUuid(baseUuid);
  if (!doc) {
    throw new BridgeError("not-found", `not found: ${baseUuid}`);
  }
  const base = doc.toObject();
  delete base._id;
  const patch: Record<string, unknown> = { name: request.name };
  if (request.system !== undefined) patch.system = request.system;
  if (request.img !== undefined) patch.img = request.img;
  return foundry.utils.mergeObject(base, patch, { inplace: false });
}
