/**
 * `query-rolls`' page order and cursor: newest first with an `_id` tiebreak, and
 * a `timestamp:id` cursor resolved against that same order.
 */

/** A row's sort key: a chat message, or the position a cursor names. */
interface RollPosition {
  timestamp: number;
  id: string;
}

export function decodeRollsCursor(raw: string): RollPosition | undefined {
  const idx = raw.indexOf(":");
  if (idx === -1) return undefined;
  const timestamp = Number(raw.slice(0, idx));
  const id = raw.slice(idx + 1);
  if (!Number.isFinite(timestamp) || id.length === 0) return undefined;
  return { timestamp, id };
}

export function encodeRollsCursor(c: RollPosition): string {
  return `${c.timestamp}:${c.id}`;
}

/** Newest-first-with-`_id`-tiebreak total order — `compareRowsDesc(a,b) <
 * 0` means `a` sorts BEFORE `b` (newer, or same-timestamp-and-greater-id). Cursor
 * semantics are defined directly against this same comparator ({@link
 * isAfterCursor}) so the two can never drift out of sync. */
export function compareRowsDesc(a: RollPosition, b: RollPosition): number {
  if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
  return b.id.localeCompare(a.id);
}

/** True when `row` sorts strictly AFTER `cursor` in {@link compareRowsDesc}'s
 * newest-first order — i.e. it belongs on the page immediately following the one
 * `cursor` was the last row of. Value-based (not an array-index lookup), so a
 * cursor still resumes correctly even if the exact message it names no longer
 * exists between calls. */
export function isAfterCursor(row: RollPosition, cursor: RollPosition): boolean {
  if (row.timestamp !== cursor.timestamp) return row.timestamp < cursor.timestamp;
  return row.id.localeCompare(cursor.id) < 0;
}
