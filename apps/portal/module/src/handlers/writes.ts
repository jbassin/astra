/**
 * The write path every write tool goes through: the write gate, the audit line, the portal
 * creation stamp, folder lookup, and create/update wrappers that turn Foundry's
 * `DataModelValidationError` into a typed `validation-failed`.
 */
import { MODULE_ID, SETTING_ALLOW_WRITES } from "../constants";
import { BridgeHandlerError } from "./shared";

/** Hard, non-configurable defense-in-depth ceiling on any single write handler's
 * create count. The REAL, operator-tunable cap is `cfg.portal.maxCreatesPerRequest`
 * (default 10) — portal-server's `mcp.ts` enforces that one BEFORE a write query is
 * even forwarded over the bridge, so in the common case this module-side constant
 * never fires. It exists as a second, independent backstop in case a
 * differently-configured or buggy server ever forwards an oversized request anyway —
 * deliberately generous (well above any sane single-request batch) so it never gates
 * ahead of the real cap in practice. */
const MODULE_MAX_CREATES_CEILING = 50;

/** A structured, greppable console line for every write attempt (denied or not) — the
 * module-side half of the D8 audit trail (the server-side half lives in `mcp.ts`'s
 * `registerBridgeTool` `audit` flag). Deliberately plain `console.*`, not the
 * `BridgeClient`'s injected `log` callback: `dispatchQuery`/handlers have no reference
 * to that callback (it's `main.ts`-local), and D14's bridge-forwarded log-event wire
 * shape is a separate, not-yet-built feature — this is a local, always-on record. */
export function auditLog(tool: string, params: unknown, outcome: string): void {
  // oxlint-disable-next-line no-console -- Foundry module: the browser console is the GM's log
  console.log(
    `[${MODULE_ID} audit] tool=${tool} outcome=${outcome} params=${JSON.stringify(params)}`,
  );
}

/** The D8 write gate — every write handler calls this first, before touching any
 * Foundry document API. Three independent, typed-reason checks:
 *  (a) `game.user?.isGM` — re-checked here even though `dispatchQuery` already checks
 *      it for every query: this is the write-specific line of defense, so a future
 *      change to `dispatchQuery`'s own gate (e.g. relaxing it for some read-only
 *      method) can never accidentally loosen write auth too;
 *  (b) the `allow-write-operations` module setting (D8, default true);
 *  (c) `count` against the module's hard ceiling — see {@link MODULE_MAX_CREATES_CEILING}
 *      for why the REAL configured cap lives server-side instead.
 * Throws {@link BridgeHandlerError} on the first failing check.
 */
export function writeGate(count: number): void {
  if (!game.user?.isGM) {
    throw new BridgeHandlerError("not-gm", "the connected Foundry session isn't a GM");
  }
  if (game.settings.get(MODULE_ID, SETTING_ALLOW_WRITES) === false) {
    throw new BridgeHandlerError(
      "writes-disabled",
      'write operations are disabled — enable the "Allow write operations" module setting',
    );
  }
  if (count > MODULE_MAX_CREATES_CEILING) {
    throw new BridgeHandlerError(
      "cap-exceeded",
      `requested ${count} creates, exceeding this module's hard ceiling of ${MODULE_MAX_CREATES_CEILING}`,
    );
  }
}

/** Resolves an existing world folder by name + document type (`import-from-
 * compendium`/`create-journal`'s `folder` param) — looked up, never created; an
 * explicit "not-found" beats a silent no-op. `undefined` in, `undefined` out. */
export function resolveFolderId(
  folderName: string | undefined,
  documentType: string,
): string | undefined {
  if (folderName === undefined) return undefined;
  const match = Array.from(game.folders.values()).find(
    (f) => f.name === folderName && f.type === documentType,
  );
  if (!match) {
    throw new BridgeHandlerError(
      "not-found",
      `folder not found: "${folderName}" (type ${documentType})`,
    );
  }
  return match.id;
}

/** D-6 — every document any portal tool creates gets this stamped into its `flags`,
 * additively merged alongside whatever flags the payload already carries. `delete-
 * document` (0026 S3) reads `flags["astra-portal"].created` back to refuse deleting
 * anything portal didn't make itself — so this must land on every create path (this
 * S2 slice's four new handlers AND the three 0023 write handlers, retrofitted).
 * Never applied to an update — only to a document at the moment it's created. */
export function portalStamp(tool: string): {
  "astra-portal": { created: true; tool: string; ts: string };
} {
  return { "astra-portal": { created: true, tool, ts: new Date().toISOString() } };
}

/** Merges a portal stamp (optionally plus more flag data) onto an existing `flags`
 * object without disturbing whatever the caller/base document already put there —
 * the additive-only half of D-6 (a hand-authored document's OWN flags, e.g. a cloned
 * compendium item's existing `flags.pf2e`, must survive untouched). */
export function withStamp(
  existingFlags: unknown,
  tool: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const base = (existingFlags && typeof existingFlags === "object" ? existingFlags : {}) as Record<
    string,
    unknown
  >;
  return foundry.utils.mergeObject(base, { ...portalStamp(tool), ...extra }, { inplace: false });
}

/** Detects Foundry's `DataModelValidationError` (D-7) without importing the class —
 * it isn't part of this module's deliberately-minimal ambient surface (see
 * `types/foundry.d.ts`'s header policy), so this checks the runtime error's own
 * name/constructor-name string instead of `instanceof`. Real Foundry throws this
 * exact class for a strictly-validated DataModel document (hazard/effect/condition/
 * melee/feat/action) rejecting a bad payload on create. */
function isDataModelValidationError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "DataModelValidationError" || err.constructor.name === "DataModelValidationError"
  );
}

/** Wraps a `FoundryDocumentClass#create()` call, mapping a `DataModelValidationError`
 * to a typed `validation-failed` (D-7, message preserved verbatim — the caller is an
 * LLM, the error text is its repair loop) and a `create()` that resolved to nothing
 * to a typed `foundry-error`. */
export async function createChecked(
  docClass: FoundryDocumentClass,
  data: Record<string, unknown>,
): Promise<FoundryDocumentLike> {
  let created: FoundryDocumentLike | undefined;
  try {
    created = await docClass.create(data);
  } catch (err) {
    if (isDataModelValidationError(err)) {
      throw new BridgeHandlerError(
        "validation-failed",
        err instanceof Error ? err.message : String(err),
      );
    }
    throw err;
  }
  if (!created) {
    throw new BridgeHandlerError("foundry-error", "document creation returned no document");
  }
  return created;
}

/** The minimal embedded-document-creating surface both `FoundryActor` and
 * `FoundryScene` share — narrow enough that either satisfies it structurally. */
interface EmbeddedDocumentHost {
  createEmbeddedDocuments(
    embeddedName: string,
    data: Record<string, unknown>[],
  ): Promise<FoundryDocumentLike[]>;
}

/** Same `DataModelValidationError` mapping as {@link createChecked}, for the embedded-
 * document creation path (`actor.createEmbeddedDocuments("Item", ...)`,
 * `scene.createEmbeddedDocuments("AmbientLight", ...)`). */
export async function createEmbeddedChecked(
  host: EmbeddedDocumentHost,
  embeddedName: string,
  data: Record<string, unknown>[],
): Promise<FoundryDocumentLike[]> {
  try {
    return await host.createEmbeddedDocuments(embeddedName, data);
  } catch (err) {
    if (isDataModelValidationError(err)) {
      throw new BridgeHandlerError(
        "validation-failed",
        err instanceof Error ? err.message : String(err),
      );
    }
    throw err;
  }
}

/** Mirrors {@link createChecked} for the mutation path (0026 S3 D-10) — maps a
 * `DataModelValidationError` from `doc.update()` to the same typed `validation-failed`
 * (Foundry's message preserved verbatim; the caller is an LLM, the message IS its
 * repair loop). `update-document` is the only caller. */
export async function updateChecked(
  doc: FoundryMutableDocument,
  updates: Record<string, unknown>,
): Promise<void> {
  try {
    await doc.update(updates);
  } catch (err) {
    if (isDataModelValidationError(err)) {
      throw new BridgeHandlerError(
        "validation-failed",
        err instanceof Error ? err.message : String(err),
      );
    }
    throw err;
  }
}

/** D-7 RE read-back: after an item is created OWNED (embedded on an actor — only then
 * does pf2e instantiate rule elements at data-prep), inspect what actually came back.
 * Two findings, both surfaced as plain strings naming the item:
 *  - an instantiated rule element with `ignored === true` (a bad/unknown RE — pf2e
 *    `console.warn`s and inerts it rather than failing the create);
 *  - a `system.rules` source entry that produced no instantiated rule at all.
 * Defensive by design: if the created document doesn't even expose a `rules` array
 * (a stub, or some future Foundry surface change), this reports NO warnings rather
 * than guessing — an absent `rules` property is "unknown", not "everything failed". */
export function collectRuleWarnings(
  itemName: string,
  sentSystem: Record<string, unknown> | undefined,
  created: FoundryItemLike,
): string[] {
  if (created.rules === undefined) return [];
  const warnings: string[] = [];
  created.rules.forEach((re, i) => {
    if (re && re.ignored === true) {
      const key = re.key !== undefined ? ` (key: ${re.key})` : "";
      warnings.push(`item "${itemName}": rule element ${i}${key} was ignored at data-prep`);
    }
  });
  const sourceRules = sentSystem?.rules;
  const sourceCount = Array.isArray(sourceRules) ? sourceRules.length : 0;
  if (sourceCount > created.rules.length) {
    warnings.push(
      `item "${itemName}": ${sourceCount - created.rules.length} of ${sourceCount} rule ` +
        "element(s) in system.rules produced no instantiated rule",
    );
  }
  return warnings;
}

/** D-1 hybrid clone+patch core, shared by `create-actor`/`create-item`: resolve a
 * compendium `baseUuid` (never a world uuid — mirrors `cloneFromCompendium`'s own
 * guard), take its `toObject()` verbatim, strip the id, then deep-merge the caller's
 * `name`/`system`/`img` on top via `foundry.utils.mergeObject` (never mutates the
 * source compendium document — `toObject()` already handed back a fresh plain
 * object). Returns `undefined` when no `baseUuid` was given, so callers build a
 * from-scratch payload instead (D-1's other branch). */
export async function resolveBasePayload(
  baseUuid: string | undefined,
  patch: { name: string; system?: Record<string, unknown>; img?: string },
): Promise<Record<string, unknown> | undefined> {
  if (baseUuid === undefined) return undefined;
  if (!baseUuid.startsWith("Compendium.")) {
    throw new BridgeHandlerError(
      "foundry-error",
      `baseUuid must be a compendium uuid (starting "Compendium."), got: ${baseUuid}`,
    );
  }
  const doc = await fromUuid(baseUuid);
  if (!doc) {
    throw new BridgeHandlerError("not-found", `not found: ${baseUuid}`);
  }
  const base = doc.toObject();
  delete base._id;
  const patchData: Record<string, unknown> = { name: patch.name };
  if (patch.system !== undefined) patchData.system = patch.system;
  if (patch.img !== undefined) patchData.img = patch.img;
  return foundry.utils.mergeObject(base, patchData, { inplace: false });
}
