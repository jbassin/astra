# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Generate the S4 icepool oracle fixtures (spec 0032, gate C).

Runs the REAL icepool (pure Python, imported from the pinned local clone at
/home/jbassin/icepool — commit 33e7e650, v2.2.2) over >= 25 constructions
and emits:

- fixtures/oracle.json    — the human-readable record: name, the Rust
  construction expression the test mirrors, and the exact expected
  {outcome: weight} map + denominator (simplified on the icepool side).
- fixtures/oracle_gen.rs  — the same cases as a dependency-free generated
  Rust array consumed by tests/dist_oracle.rs via include! (serde is not a
  crate dependency, so the test consumes generated Rust rather than
  parsing JSON).

Regenerate with:  uv run --no-project python tools/gen_oracle.py
(from libs/rust/weal-engine/; plain `python3 tools/gen_oracle.py` also
works — stdlib only).

Conventions:
- Outcomes are emitted as i64 literals; bools map to 0/1 (the Rust side
  builds comparison cases with an int-returning op for the same reason).
- Expected maps are icepool `.simplify()`d; the Rust test simplifies its
  side before comparing, so denominator normalization differences between
  the two constructions cancel.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ICEPOOL_SRC = Path("/home/jbassin/icepool/src")
sys.path.insert(0, str(ICEPOOL_SRC))

import icepool  # noqa: E402
from icepool import Die, d  # noqa: E402


def kh(count: int, n: int) -> tuple[int, ...]:
    return (0,) * (count - n) + (1,) * n


def kl(count: int, n: int) -> tuple[int, ...]:
    return (1,) * n + (0,) * (count - n)


def rust_keep(keep: tuple[int, ...]) -> str:
    inner = ", ".join(str(x) for x in keep)
    return f"KeepTuple::from_vec(vec![{inner}])"


def pool_sum(die: Die, count: int, keep: tuple[int, ...]) -> Die:
    return die.pool(count)[keep].sum()


def successes_kept(die: Die, count: int, keep: tuple[int, ...], target: int) -> Die:
    return die.pool(count)[keep].keep_outcomes(lambda x: x >= target).size()


DM13 = Die({1: 1, 2: 3})

# name, icepool Die, Rust construction expression (helpers d/wd/b in the
# test file; `b` is the &mut Budget parameter of the case's build fn).
CASES: list[tuple[str, Die, str]] = [
    # --- NdM sums ---
    ("1d20", pool_sum(d(20), 1, (1,)), "sum_pool(&d(20), 1, &KeepTuple::all(1), b)"),
    ("2d6", pool_sum(d(6), 2, (1, 1)), "sum_pool(&d(6), 2, &KeepTuple::all(2), b)"),
    ("12d6", pool_sum(d(6), 12, (1,) * 12), "sum_pool(&d(6), 12, &KeepTuple::all(12), b)"),
    # --- kh/kl ---
    (
        "4d6kh3",
        pool_sum(d(6), 4, kh(4, 3)),
        "sum_pool(&d(6), 4, &KeepTuple::keep_highest(4, 3), b)",
    ),
    (
        "2d20kh1",
        pool_sum(d(20), 2, kh(2, 1)),
        "sum_pool(&d(20), 2, &KeepTuple::keep_highest(2, 1), b)",
    ),
    (
        "2d20kl1",
        pool_sum(d(20), 2, kl(2, 1)),
        "sum_pool(&d(20), 2, &KeepTuple::keep_lowest(2, 1), b)",
    ),
    (
        "5d10kl2",
        pool_sum(d(10), 5, kl(5, 2)),
        "sum_pool(&d(10), 5, &KeepTuple::keep_lowest(5, 2), b)",
    ),
    (
        "6d6kl1",
        pool_sum(d(6), 6, kl(6, 1)),
        "sum_pool(&d(6), 6, &KeepTuple::keep_lowest(6, 1), b)",
    ),
    (
        "10d10kh5",
        pool_sum(d(10), 10, kh(10, 5)),
        "sum_pool(&d(10), 10, &KeepTuple::keep_highest(10, 5), b)",
    ),
    # --- middle / negative keep-tuples ---
    (
        "middle3-5d6",
        pool_sum(d(6), 5, (0, 1, 1, 1, 0)),
        f"sum_pool(&d(6), 5, &{rust_keep((0, 1, 1, 1, 0))}, b)",
    ),
    (
        "median-5d6",
        pool_sum(d(6), 5, (0, 0, 1, 0, 0)),
        f"sum_pool(&d(6), 5, &{rust_keep((0, 0, 1, 0, 0))}, b)",
    ),
    (
        "hi-minus-lo-5d6",
        pool_sum(d(6), 5, (-1, 0, 0, 0, 1)),
        f"sum_pool(&d(6), 5, &{rust_keep((-1, 0, 0, 0, 1))}, b)",
    ),
    # --- weighted (dm) pools ---
    (
        "3dm-weighted",
        pool_sum(DM13, 3, (1, 1, 1)),
        "sum_pool(&wd(&[(1, 1), (2, 3)]), 3, &KeepTuple::all(3), b)",
    ),
    (
        "4dm-weighted-kh2",
        pool_sum(DM13, 4, kh(4, 2)),
        "sum_pool(&wd(&[(1, 1), (2, 3)]), 4, &KeepTuple::keep_highest(4, 2), b)",
    ),
    # --- mixtures (weighted-lcm, mixed denominators) ---
    (
        "mix-d6-d4",
        Die([d(6), d(4)]),
        "mix(&[(d(6), Weight::from_u128(1)), (d(4), Weight::from_u128(1))], b)",
    ),
    (
        "mix-d6x2-d4x1",
        Die({d(6): 2, d(4): 1}),
        "mix(&[(d(6), Weight::from_u128(2)), (d(4), Weight::from_u128(1))], b)",
    ),
    # --- explode ---
    ("explode-d6-depth2", d(6).explode(depth=2), "explode(&d(6), 2, b)"),
    (
        "explode-weighted-depth1",
        DM13.explode(depth=1),
        "explode(&wd(&[(1, 1), (2, 3)]), 1, b)",
    ),
    (
        "3d6e2",
        pool_sum(d(6).explode(depth=2), 3, (1, 1, 1)),
        "{ let e = explode(&d(6), 2, b)?; sum_pool(&e, 3, &KeepTuple::all(3), b) }",
    ),
    (
        "4d6e2kh3",
        pool_sum(d(6).explode(depth=2), 4, kh(4, 3)),
        "{ let e = explode(&d(6), 2, b)?; sum_pool(&e, 4, &KeepTuple::keep_highest(4, 3), b) }",
    ),
    # --- reroll ---
    (
        "reroll-d6-12-gwf",
        d(6).reroll([1, 2], depth=1),
        "reroll_faces(&d(6), &[1, 2], b)",
    ),
    ("reroll-d6-1", d(6).reroll([1], depth=1), "reroll_face(&d(6), &1, b)"),
    ("reroll-d20-1", d(20).reroll([1], depth=1), "reroll_face(&d(20), &1, b)"),
    # --- successes ---
    (
        "successes-7d10-t8",
        7 @ (d(10) >= 8),
        "successes(&d(10), 7, &KeepTuple::all(7), &8, b)",
    ),
    (
        "successes-5d10kh3-t8",
        successes_kept(d(10), 5, kh(5, 3), 8),
        "successes(&d(10), 5, &KeepTuple::keep_highest(5, 3), &8, b)",
    ),
    # --- lifted comparisons (2-outcome Bool-ish dists as 0/1) ---
    (
        "cmp-d20-gt-10",
        (d(20) > 10),
        "combine(&d(20), &constant(10), b, |x, y| i64::from(x > y))",
    ),
    (
        "cmp-d6-ge-d6",
        (d(6) >= d(6)),
        "combine(&d(6), &d(6), b, |x, y| i64::from(x >= y))",
    ),
    (
        "cmp-d6-eq-d6",
        (d(6) == d(6)),
        "combine(&d(6), &d(6), b, |x, y| i64::from(x == y))",
    ),
    # --- binary ops ---
    ("add-d20-d6", d(20) + d(6), "combine(&d(20), &d(6), b, |x, y| x + y)"),
    ("sub-d6-d6", d(6) - d(6), "combine(&d(6), &d(6), b, |x, y| x - y)"),
    ("mul-d6-d6", d(6) * d(6), "combine(&d(6), &d(6), b, |x, y| x * y)"),
    (
        "2d6-plus-3",
        pool_sum(d(6), 2, (1, 1)) + 3,
        "{ let s = sum_pool(&d(6), 2, &KeepTuple::all(2), b)?; "
        "combine(&s, &constant(3), b, |x, y| x + y) }",
    ),
]


def dump_die(die: Die) -> tuple[list[tuple[int, int]], int]:
    die = die.simplify()
    items: list[tuple[int, int]] = []
    for outcome, weight in die.items():
        if isinstance(outcome, bool):
            outcome = int(outcome)
        if not isinstance(outcome, int):
            raise TypeError(f"non-integer outcome {outcome!r}")
        items.append((outcome, weight))
    items.sort(key=lambda p: p[0])
    return items, die.denominator()


def icepool_commit() -> str:
    try:
        return subprocess.run(
            ["git", "-C", str(ICEPOOL_SRC.parent), "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except Exception:
        return "unknown"


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    fixtures = root / "fixtures"
    fixtures.mkdir(exist_ok=True)

    names = [name for name, _, _ in CASES]
    assert len(names) == len(set(names)), "duplicate case names"
    assert len(CASES) >= 25, f"need >= 25 oracle cases, have {len(CASES)}"

    json_cases = []
    rs_cases = []
    for name, die, rust_expr in CASES:
        items, den = dump_die(die)
        json_cases.append(
            {
                "name": name,
                "construction": rust_expr,
                "expected": {
                    "denominator": str(den),
                    "weights": [[str(o), str(w)] for o, w in items],
                },
            }
        )
        pairs = ", ".join(f'({o}i64, "{w}")' for o, w in items)
        rs_cases.append(
            "    OracleCase {\n"
            f'        name: "{name}",\n'
            f"        build: |b| {rust_expr},\n"
            f'        expected_den: "{den}",\n'
            f"        expected: &[{pairs}],\n"
            "    },"
        )

    meta = {
        "generated_by": "tools/gen_oracle.py",
        "icepool_version": icepool.__version__,
        "icepool_commit": icepool_commit(),
        "case_count": len(CASES),
        "cases": json_cases,
    }
    oracle_json = fixtures / "oracle.json"
    oracle_json.write_text(json.dumps(meta, indent=2) + "\n")
    # The repo pre-commit gate oxfmt-checks this JSON; converge to its style
    # here (best-effort) so a regen never leaves the tree gate-red.
    try:
        subprocess.run(
            ["pnpm", "exec", "oxfmt", str(oracle_json)],
            capture_output=True,
            check=True,
        )
    except Exception:
        print(f"warning: could not oxfmt {oracle_json}; run `pnpm exec oxfmt` on it manually")

    header = (
        "// GENERATED by tools/gen_oracle.py — DO NOT EDIT.\n"
        f"// icepool {icepool.__version__} @ {icepool_commit()}; "
        f"{len(CASES)} cases; regenerate: uv run --no-project python tools/gen_oracle.py\n"
        "// Consumed by tests/dist_oracle.rs via include! (helpers d/wd/constant\n"
        "// and the OracleCase struct are defined there).\n\n"
    )
    body = "pub static CASES: &[OracleCase] = &[\n" + "\n".join(rs_cases) + "\n];\n"
    (fixtures / "oracle_gen.rs").write_text(header + body)

    print(f"wrote {len(CASES)} cases to {fixtures}/oracle.json + oracle_gen.rs")


if __name__ == "__main__":
    main()
