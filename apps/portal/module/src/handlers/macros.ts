/**
 * Macro tools: create a macro (never runs it) and run an existing one (`execute-macro`,
 * behind its own module setting as well as the write gate).
 */
import {
  CreateMacroParams,
  type CreateMacroResult,
  ExecuteMacroParams,
  type ExecuteMacroResult,
  type BridgeToolHandlers,
  BridgeError,
} from "@astra/portal-shared";

import { MODULE_ID, SETTING_ALLOW_MACRO_EXECUTION } from "../constants";
import { auditLog, createChecked, portalStamp, writeGate } from "./writes";

/** `create-macro` (spec 0026 S2/D-6/D-9) — creates a script or chat macro; verified
 * (spec Verified footprint) that Foundry NEVER executes a macro on create, only via
 * the separate `execute-macro` tool (0026 S3). D-9's audit-the-full-command-text
 * requirement is satisfied for free: {@link auditLog} already serializes the whole
 * `params` object, which carries `command` verbatim. */
async function handleCreateMacro(rawParams: unknown): Promise<CreateMacroResult> {
  const params = CreateMacroParams.parse(rawParams);
  try {
    writeGate(1);
    const docClass = getDocumentClass("Macro");
    const created = await createChecked(docClass, {
      name: params.name,
      type: params.macroType,
      command: params.command,
      img: params.img,
      flags: portalStamp("create-macro"),
    });
    const result: CreateMacroResult = {
      uuid: created.uuid,
      id: created.id,
      name: created.name,
      warnings: [],
    };
    auditLog("create-macro", params, `ok (${created.id})`);
    return result;
  } catch (err) {
    auditLog("create-macro", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** Foundry's `Macro#execute()` return value is arbitrary script-macro JS output (or
 * `undefined` for a chat macro / a script that returns nothing) — best-effort
 * JSON-stringified and capped so one wildly chatty macro can't blow up the tool
 * result size; `String(value)` is the fallback for anything `JSON.stringify` itself
 * can't handle (e.g. a value containing a BigInt). */
const EXECUTE_MACRO_RETURN_CAP = 8 * 1024; // 8 KiB

function stringifyReturned(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  let text: string;
  try {
    const json = JSON.stringify(value);
    text = json === undefined ? String(value) : json;
  } catch {
    text = String(value);
  }
  return text.length > EXECUTE_MACRO_RETURN_CAP
    ? `${text.slice(0, EXECUTE_MACRO_RETURN_CAP)}… (truncated)`
    : text;
}

/** `execute-macro` (spec 0026 S3/D-9) — runs an existing world macro immediately, as
 * the GM. Gated by BOTH the normal write gate and the module's own `allow-macro-
 * execution` setting, independently switchable off without touching `allow-write-
 * operations` — reuses the `writes-disabled` code (D-11's final error-code list has
 * no separate "execution-disabled" entry) with a message naming THIS specific
 * setting, so an LLM client can still tell the two refusals apart by text even though
 * `.code` is shared. A macro's own command text was already audited in full at
 * create (create-macro, D-9); this audit line only ever needs id+name+outcome. */
async function handleExecuteMacro(rawParams: unknown): Promise<ExecuteMacroResult> {
  const params = ExecuteMacroParams.parse(rawParams);
  try {
    writeGate(1);
    if (game.settings.get(MODULE_ID, SETTING_ALLOW_MACRO_EXECUTION) === false) {
      throw new BridgeError(
        "writes-disabled",
        'macro execution is disabled — enable the "Allow macro execution" module setting ' +
          "(other writes are unaffected by this setting)",
      );
    }
    const macro = game.macros.get(params.macroId);
    if (!macro) {
      throw new BridgeError("not-found", `macro not found: ${params.macroId}`);
    }
    let returned: unknown;
    try {
      returned = await macro.execute();
    } catch (err) {
      throw new BridgeError("execution-failed", err instanceof Error ? err.message : String(err));
    }
    const result: ExecuteMacroResult = {
      macroId: params.macroId,
      returned: stringifyReturned(returned),
    };
    auditLog("execute-macro", params, `ok (macro ${macro.id} "${macro.name}")`);
    return result;
  } catch (err) {
    auditLog("execute-macro", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** This module's handlers, keyed by tool name; `./index.ts` assembles them into
 * `TOOL_HANDLERS`. */
export const macroHandlers = {
  "create-macro": handleCreateMacro,
  "execute-macro": handleExecuteMacro,
} satisfies Partial<BridgeToolHandlers>;
