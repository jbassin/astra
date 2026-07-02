// A minimal line diff for the Diff tab: proposed `.vellum` vs the current corpus body.
// For a `rewrite` the proposed body is the existing body verbatim + an appended passage
// (P3.9 preserve-and-append), so the diff is additive by construction; for a `create`
// it's all-added (corpus side empty). LCS-based so an in-editor human edit also diffs
// sensibly.

export type DiffRow = { type: "ctx" | "add" | "del"; text: string };

/** Longest-common-subsequence line diff of `before` → `after`. */
export function diffLines(before: string, after: string): DiffRow[] {
  const a = before.length ? before.split("\n") : [];
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from<number>({ length: m + 1 }).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: "ctx", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      rows.push({ type: "del", text: a[i]! });
      i++;
    } else {
      rows.push({ type: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) rows.push({ type: "del", text: a[i++]! });
  while (j < m) rows.push({ type: "add", text: b[j++]! });
  return rows;
}

/** Counts for a one-line summary (e.g. "+12 −0"). */
export function diffStat(rows: DiffRow[]): { added: number; removed: number } {
  return {
    added: rows.filter((r) => r.type === "add").length,
    removed: rows.filter((r) => r.type === "del").length,
  };
}
