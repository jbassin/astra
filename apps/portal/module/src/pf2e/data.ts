/**
 * The two sides of a pf2e document, as branded types, plus the small readers every accessor
 * shares. A document's **source** is its stored data (`doc.toObject()`); its **live** side is
 * the prepared instance's own `system` tree, which pf2e rebuilds on every data-prep cycle. The
 * brands make the side part of each accessor's signature, so reading a live-only field off
 * the source (or the reverse) is a type error instead of a bug found at a live gate.
 */

declare const SIDE: unique symbol;

export type Side = "source" | "live";

/** A stored document source: the object `doc.toObject()` returns (with `system`, `items`,
 * `ownership`, ...). An embedded item inside an actor's source is one too. */
export type Pf2eSource = Readonly<Record<string, unknown>> & { readonly [SIDE]: "document" };

/** A `system` tree from one side: `"source"` is the stored `system`, `"live"` the prepared
 * one. Accessors for stored fields that data prep leaves alone accept either side. */
export type Pf2eSystem<S extends Side = Side> = Readonly<Record<string, unknown>> & {
  readonly [SIDE]: S;
};

/** The stored source of a document (calls `toObject()` once). */
export function sourceOf(doc: { toObject(): Record<string, unknown> }): Pf2eSource {
  return doc.toObject() as Pf2eSource;
}

/** The stored `system` tree of a source; empty when the source has none. */
export function sourceSystem(src: Pf2eSource): Pf2eSystem<"source"> {
  return record(src.system) as Pf2eSystem<"source">;
}

/** The prepared `system` tree of a live document, or `undefined` when the document (or a
 * test double) carries none. */
export function liveSystem(
  doc: { readonly system?: Record<string, unknown> } | undefined,
): Pf2eSystem<"live"> | undefined {
  return doc?.system as Pf2eSystem<"live"> | undefined;
}

/** The embedded item sources of an actor source, in stored order. */
export function sourceItems(src: Pf2eSource): Pf2eSource[] {
  return Array.isArray(src.items) ? (src.items as Pf2eSource[]) : [];
}

/** A document's `flags.pf2e` tree from one side. Flags are stored data that data prep leaves
 * alone, so both sides agree; the brand still records which one a handler read. */
export type Pf2eFlags<S extends Side = Side> = Readonly<Record<string, unknown>> & {
  readonly [SIDE]: S;
};

/** The `flags.pf2e` tree of a live document (a `game.messages` chat message, say); empty
 * when the document carries no pf2e flags (a plain `/roll`). */
export function liveFlags(doc: { readonly flags?: Record<string, unknown> }): Pf2eFlags<"live"> {
  return record(record(doc.flags).pf2e) as Pf2eFlags<"live">;
}

// --- shared readers (internal to the layer) ---------------------------------------------

/** `value` when it is an object (arrays included, as a plain property read would), else an
 * empty record, so a chain of reads never throws on a missing or wrong-shaped step. */
export function record(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** `value` when it is an object, else `undefined`. */
export function recordOrUndefined(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Reads a dot path (`"details.level.value"`) off a tree; `undefined` at the first step that
 * is not an object. */
export function at(tree: unknown, path: string): unknown {
  let cur: unknown = tree;
  for (const segment of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[segment];
  }
  return cur;
}

export function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** The string members of `value` when it is an array, else `undefined`. */
export function stringsOrUndefined(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;
}
