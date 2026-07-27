/**
 * `must(v, message)` stands in for the `x!` non-null assertion, which oxlint's
 * `no-non-null-assertion` rule bans repo-wide (no per-path override for menhir —
 * `.oxlintrc.json` is out of this slice's touch scope). Used at the handful of
 * spots where an index/Map lookup or a regex capture group is provably safe by
 * construction but `noUncheckedIndexedAccess` can't see it — throwing loud on a
 * genuine violation is strictly safer than a silent `undefined` falling through.
 */
export function must<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) throw new Error(`menhir: ${message}`);
  return value;
}
