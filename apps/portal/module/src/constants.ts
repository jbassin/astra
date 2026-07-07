/**
 * portal-module identity constants — the Foundry package id/compatibility floor
 * (spec 0023 D2/D11). `module/module.json` (S3) and the eventual runtime-rendered
 * install manifest (`GET /module/module.json`, S6) both need to agree on these, so
 * they're pulled from one literal rather than duplicated across JSON + TS.
 */

/** The Foundry package id — `modules/<MODULE_ID>/` once installed. */
export const MODULE_ID = "portal";

export const MODULE_TITLE = "Portal (astra MCP bridge)";

/** Foundry major-version floor this module is verified against (D2). */
export const COMPATIBILITY_MINIMUM = "13";
