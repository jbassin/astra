//! Generative tests over well-typed weal programs: a seeded
//! generator builds random programs that are well-typed by construction and
//! computes, alongside each one, what it must evaluate to. Every program is
//! then checked end to end through the real pipeline:
//!
//! 1. **Round trip.** `lower(parse(print(a))) == a` for the program's AST.
//! 2. **Accepted, at the predicted type.** The checker accepts it and infers
//!    `Num` or `Die[Num]`, as generated.
//! 3. **Well-typed programs don't go wrong.** `evaluate` doesn't panic, returns
//!    `ok:true`, and never reports an `internal error:`.
//! 4. **The result matches the generator's oracle.** A `Num` program shows
//!    exactly the value the generator computed. A die program shows a die
//!    whose rolled total lies within the generator's interval bounds.
//! 5. **Saves round trip.** A nullary die macro saved through `save(…)` is
//!    serialized, re-loaded as a save and called, with the same bounds.
//!
//! The grammar leans on functions: nullary functions (`|| e`, `let f() = e`,
//! called as `f()`), one-parameter functions, immediately applied lambdas,
//! closures over earlier bindings, and folds. That is the class of program the
//! nullary-function bug lived in, which fixed lists of cases never reached.
//!
//! No proptest: like `dist_props.rs`, the generator is seeded (ChaCha20, a
//! crate dependency already), so a failure reproduces exactly. The failing
//! program is printed in full. `WEAL_GEN_CASES` and `WEAL_GEN_SEED` widen or
//! move the search locally; the defaults keep this suite under two seconds.

use rand_chacha::ChaCha20Rng;
use rand_core::{Rng, SeedableRng};
use serde_json::Value as Json;
use std::panic::{AssertUnwindSafe, catch_unwind};
use weal_engine::{check_source, parse_to_ast, print};

const DEFAULT_CASES: u64 = 400;
const MAX_DEPTH: u32 = 4;

/// What a bound name holds, as far as the oracle needs to know.
#[derive(Clone)]
enum Bind {
    /// A `Num` with its value.
    Num(i128),
    /// A `Die[Num]` with its face bounds.
    Die(i128, i128),
    /// A nullary function returning this `Num`.
    NullNum(i128),
    /// A nullary function returning a die within these bounds.
    NullDie(i128, i128),
    /// A one-parameter function `n * a + b`.
    Lin(i128, i128),
}

struct Gen {
    rng: ChaCha20Rng,
    next_id: u32,
    env: Vec<(String, Bind)>,
}

impl Gen {
    fn new(seed: u64) -> Gen {
        let mut key = [0u8; 32];
        key[..8].copy_from_slice(&seed.to_le_bytes());
        Gen {
            rng: ChaCha20Rng::from_seed(key),
            next_id: 0,
            env: Vec::new(),
        }
    }

    fn below(&mut self, n: u64) -> u64 {
        self.rng.next_u64() % n
    }

    fn pick<T: Copy>(&mut self, items: &[T]) -> T {
        items[self.below(items.len() as u64) as usize]
    }

    fn fresh(&mut self, prefix: &str) -> String {
        self.next_id += 1;
        format!("{prefix}{}", self.next_id)
    }

    /// A random bound name whose binding `want` accepts.
    fn bound<T>(&mut self, want: impl Fn(&Bind) -> Option<T>) -> Option<(String, T)> {
        let hits: Vec<(String, T)> = self
            .env
            .iter()
            .filter_map(|(n, b)| want(b).map(|t| (n.clone(), t)))
            .collect();
        if hits.is_empty() {
            return None;
        }
        let i = self.below(hits.len() as u64) as usize;
        hits.into_iter().nth(i)
    }

    /// Generate `body` with `name` bound to `bind`, then unbind it.
    fn with<T>(&mut self, name: &str, bind: Bind, body: impl FnOnce(&mut Gen) -> T) -> T {
        self.env.push((name.to_owned(), bind));
        let out = body(self);
        self.env.pop();
        out
    }

    /// A `Num` expression and its value.
    fn num(&mut self, depth: u32) -> (String, i128) {
        let choice = if depth == 0 {
            self.below(3)
        } else {
            self.below(19)
        };
        let d = depth.saturating_sub(1);
        match choice {
            1 => {
                if let Some((n, v)) = self.bound(|b| match b {
                    Bind::Num(v) => Some(*v),
                    _ => None,
                }) {
                    return (n, v);
                }
                self.num_lit()
            }
            2 => {
                if let Some((n, v)) = self.bound(|b| match b {
                    Bind::NullNum(v) => Some(*v),
                    _ => None,
                }) {
                    return (format!("{n}()"), v);
                }
                self.num_lit()
            }
            3 => {
                if let Some((g, (a, b))) = self.bound(|b| match b {
                    Bind::Lin(a, c) => Some((*a, *c)),
                    _ => None,
                }) {
                    let (s, v) = self.num(d);
                    return (format!("{g}({s})"), v * a + b);
                }
                self.num_lit()
            }
            4 => {
                let (l, lv) = self.num(d);
                let (r, rv) = self.num(d);
                if self.below(2) == 0 {
                    (format!("({l} + {r})"), lv + rv)
                } else {
                    (format!("({l} - {r})"), lv - rv)
                }
            }
            5 => {
                let (l, lv) = self.num(d);
                let k = self.below(4) as i128;
                (format!("({l} * {k})"), lv * k)
            }
            6 => {
                let (l, lv) = self.num(d);
                let k = 1 + self.below(4) as i128;
                // Num division truncates toward zero, as i128 does.
                (format!("({l} / {k})"), lv / k)
            }
            7 => {
                let (s, v) = self.num(d);
                (format!("-({s})"), -v)
            }
            8 => {
                let (vs, v) = self.num(d);
                let x = self.fresh("x");
                let (b, bv) = self.with(&x, Bind::Num(v), |g| g.num(d));
                (format!("(let {x} = {vs}; {b})"), bv)
            }
            9 => {
                let (vs, v) = self.num(d);
                let f = self.fresh("f");
                let (b, bv) = self.with(&f, Bind::NullNum(v), |g| g.num(d));
                (format!("(let {f}() = {vs}; {b})"), bv)
            }
            10 => {
                let (vs, v) = self.num(d);
                let f = self.fresh("f");
                let (b, bv) = self.with(&f, Bind::NullNum(v), |g| g.num(d));
                (format!("(let {f} = || {vs}; {b})"), bv)
            }
            11 => {
                let (s, v) = self.num(d);
                (format!("(|| {s})()"), v)
            }
            12 => {
                let g = self.fresh("g");
                let n = self.fresh("n");
                let a = self.below(4) as i128;
                let c = self.below(10) as i128;
                let (b, bv) = self.with(&g, Bind::Lin(a, c), |inner| inner.num(d));
                (format!("(let {g}({n}) = {n} * {a} + {c}; {b})"), bv)
            }
            13 => {
                let (s, sv) = self.num(d);
                let (z, zv) = self.num(d);
                let (o, ov) = self.num(d);
                (
                    format!("(match {s} | 0 -> {z} | _ -> {o})"),
                    if sv == 0 { zv } else { ov },
                )
            }
            14 => {
                let (l, lv) = self.num(d);
                let (r, rv) = self.num(d);
                let (t, tv) = self.num(d);
                let (f, fv) = self.num(d);
                (
                    format!("(match {l} < {r} | :true -> {t} | :false -> {f})"),
                    if lv < rv { tv } else { fv },
                )
            }
            15 => {
                let (l, lv) = self.num(d);
                let (r, rv) = self.num(d);
                match self.below(3) {
                    0 => (format!("max({l}, {r})"), lv.max(rv)),
                    1 => (format!("min({l}, {r})"), lv.min(rv)),
                    _ => (format!("abs({l})"), lv.abs()),
                }
            }
            16 => {
                let (s, _) = self.num(d);
                let k = self.below(5) as i128;
                (format!("len(repeat({s}, {k}))"), k)
            }
            17 => {
                let items: Vec<(String, i128)> =
                    (0..1 + self.below(3)).map(|_| self.num(d)).collect();
                let src: Vec<&str> = items.iter().map(|(s, _)| s.as_str()).collect();
                let sum: i128 = items.iter().map(|(_, v)| v).sum();
                (
                    format!("fold([{}], 0, |acc, it| acc + it)", src.join(", ")),
                    sum,
                )
            }
            18 => {
                // A nullary function applied through `map`, then summed.
                let (s, v) = self.num(d);
                let k = 1 + self.below(3);
                let units = vec!["()"; k as usize].join(", ");
                (
                    format!("fold(map([{units}], || {s}), 0, |acc, it| acc + it)"),
                    v * k as i128,
                )
            }
            _ => self.num_lit(),
        }
    }

    fn num_lit(&mut self) -> (String, i128) {
        let k = self.below(10) as i128;
        (k.to_string(), k)
    }

    /// A `Die[Num]` expression and the bounds of its faces.
    fn die(&mut self, depth: u32) -> (String, i128, i128) {
        let choice = if depth == 0 {
            self.below(3)
        } else {
            self.below(17)
        };
        let d = depth.saturating_sub(1);
        match choice {
            1 => {
                if let Some((n, (lo, hi))) = self.bound(|b| match b {
                    Bind::Die(lo, hi) => Some((*lo, *hi)),
                    _ => None,
                }) {
                    return (n, lo, hi);
                }
                self.die_lit()
            }
            2 => {
                if let Some((n, (lo, hi))) = self.bound(|b| match b {
                    Bind::NullDie(lo, hi) => Some((*lo, *hi)),
                    _ => None,
                }) {
                    return (format!("{n}()"), lo, hi);
                }
                self.die_lit()
            }
            3 => {
                let (l, llo, lhi) = self.die(d);
                let (r, rv) = self.num(d);
                if self.below(2) == 0 {
                    (format!("({l} + {r})"), llo + rv, lhi + rv)
                } else {
                    (format!("({r} - {l})"), rv - lhi, rv - llo)
                }
            }
            4 => {
                let (l, llo, lhi) = self.die(d);
                let (r, rlo, rhi) = self.die(d);
                if self.below(2) == 0 {
                    (format!("({l} + {r})"), llo + rlo, lhi + rhi)
                } else {
                    (format!("({l} - {r})"), llo - rhi, lhi - rlo)
                }
            }
            5 => {
                let (l, lo, hi) = self.die(d);
                let k = 1 + self.below(3) as i128;
                (format!("({l} * {k})"), lo * k, hi * k)
            }
            6 => {
                let (s, lo, hi) = self.die(d);
                (format!("-({s})"), -hi, -lo)
            }
            7 => {
                // A pool keep, closed by the arithmetic around it.
                let c = 1 + self.below(3);
                let s = self.pick(&[4i128, 6, 20]);
                let (r, rv) = self.num(d);
                (format!("({c}d{s}kh1 + {r})"), 1 + rv, s + rv)
            }
            8 => {
                let s = self.pick(&[4i128, 6]);
                if self.below(2) == 0 {
                    (format!("explode(d{s}, 1)"), 1, 2 * s)
                } else {
                    (format!("d{s}e1"), 1, 2 * s)
                }
            }
            9 => {
                let s = self.pick(&[4i128, 6, 8]);
                (format!("reroll(d{s}, [1])"), 1, s)
            }
            10 => {
                let (l, llo, lhi) = self.die(d);
                let (r, rlo, rhi) = self.die(d);
                if self.below(2) == 0 {
                    (format!("max({l}, {r})"), llo.max(rlo), lhi.max(rhi))
                } else {
                    (format!("min({l}, {r})"), llo.min(rlo), lhi.min(rhi))
                }
            }
            11 => {
                let (vs, vlo, vhi) = self.die(d);
                let x = self.fresh("x");
                let (b, lo, hi) = self.with(&x, Bind::Die(vlo, vhi), |g| g.die(d));
                (format!("(let {x} = {vs}; {b})"), lo, hi)
            }
            12 => {
                let (vs, vlo, vhi) = self.die(d);
                let h = self.fresh("h");
                let (b, lo, hi) = self.with(&h, Bind::NullDie(vlo, vhi), |g| g.die(d));
                if self.below(2) == 0 {
                    (format!("(let {h}() = {vs}; {b})"), lo, hi)
                } else {
                    (format!("(let {h} = || {vs}; {b})"), lo, hi)
                }
            }
            13 => {
                let (s, lo, hi) = self.die(d);
                (format!("(|| {s})()"), lo, hi)
            }
            14 => {
                let (s, lo, hi) = self.die(d);
                let word = self.pick(&["fire", "cold", "slashing"]);
                (format!("({s})[{word}]"), lo, hi)
            }
            15 => {
                let (s, sv) = self.num(d);
                let (z, zlo, zhi) = self.die(d);
                let (o, olo, ohi) = self.die(d);
                if sv == 0 {
                    (format!("(match {s} | 0 -> {z} | _ -> {o})"), zlo, zhi)
                } else {
                    (format!("(match {s} | 0 -> {z} | _ -> {o})"), olo, ohi)
                }
            }
            16 => ("dl([1, 3, 5])".to_owned(), 1, 5),
            _ => self.die_lit(),
        }
    }

    fn die_lit(&mut self) -> (String, i128, i128) {
        let s = self.pick(&[2i128, 4, 6, 8, 10, 12, 20]);
        (format!("d{s}"), 1, s)
    }
}

/// What a generated program must show.
#[derive(Debug)]
enum Expect {
    Num(i128),
    Die(i128, i128),
}

struct Case {
    source: String,
    saves: Vec<(String, String)>,
    expect: Expect,
}

const SEED: [u8; 32] = [7u8; 32];

fn evaluate(source: &str, saves: &[(String, String)], mode: &str) -> Json {
    let saves_json = serde_json::to_string(saves).expect("saves serialize");
    let out = catch_unwind(AssertUnwindSafe(|| {
        weal_engine::evaluate(source, &saves_json, &SEED, 0, mode)
    }))
    .unwrap_or_else(|_| panic!("engine panicked on `{source}` (saves {saves:?})"));
    serde_json::from_str(&out).expect("valid JSON")
}

/// Check every property for one case. Returns the failure, naming the
/// program, so the caller reports it whole.
fn check_case(case: &Case) -> Result<(), String> {
    let src = &case.source;
    // 1. Round trip.
    let ast = parse_to_ast(src).map_err(|e| format!("does not parse: {e:?}"))?;
    let printed = print(&ast);
    let again = parse_to_ast(&printed).map_err(|e| format!("printed {printed:?} fails: {e:?}"))?;
    if again != ast {
        return Err(format!("round trip changed the AST through {printed:?}"));
    }
    // 2. Accepted at the predicted type (saves are checked by `evaluate`).
    if case.saves.is_empty() {
        let (_, ty) = check_source(src, &[]).map_err(|e| format!("rejected: {}", e.message))?;
        let want = match case.expect {
            Expect::Num(_) => "Num",
            Expect::Die(..) => "Die[Num]",
        };
        if ty.to_string() != want {
            return Err(format!("inferred `{ty}`, generated `{want}`"));
        }
    }
    let checked = evaluate(src, &case.saves, "check");
    if checked["ok"] != Json::Bool(true) {
        return Err(format!("check mode failed: {checked}"));
    }
    // 3. No panic (inside `evaluate`), no error, never an internal one.
    let v = evaluate(src, &case.saves, "run");
    if v["ok"] != Json::Bool(true) {
        return Err(format!("run failed: {v}"));
    }
    let displays = v["displays"].as_array().ok_or("no displays array")?;
    if displays.len() != 1 {
        return Err(format!("expected one display: {v}"));
    }
    // 4. The oracle.
    let shown = &displays[0];
    match case.expect {
        Expect::Num(want) => {
            if shown["kind"] != "value" || shown["headline"] != want.to_string() {
                return Err(format!("expected the value {want}, got {shown}"));
            }
        }
        Expect::Die(lo, hi) => {
            if shown["kind"] != "die" {
                return Err(format!("expected a die, got {shown}"));
            }
            let total: i128 = shown["value"]["v"]
                .as_str()
                .and_then(|s| s.parse().ok())
                .ok_or_else(|| format!("die total isn't a Num: {shown}"))?;
            if total < lo || total > hi {
                return Err(format!("rolled {total}, outside [{lo}, {hi}]"));
            }
        }
    }
    Ok(())
}

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

fn run_cases(label: &str, make: impl Fn(&mut Gen) -> Case) {
    let cases = env_u64("WEAL_GEN_CASES", DEFAULT_CASES);
    let base = env_u64("WEAL_GEN_SEED", 0);
    for i in 0..cases {
        let seed = base.wrapping_add(i);
        let mut g = Gen::new(seed);
        let case = make(&mut g);
        if let Err(why) = check_case(&case) {
            panic!(
                "{label} case {i} (WEAL_GEN_SEED={seed}, WEAL_GEN_CASES=1): {why}\n\
                 program: {}\nsaves: {:?}",
                case.source, case.saves
            );
        }
    }
}

#[test]
fn generated_num_programs_evaluate_to_the_oracle_value() {
    run_cases("num", |g| {
        let (source, v) = g.num(MAX_DEPTH);
        Case {
            source,
            saves: Vec::new(),
            expect: Expect::Num(v),
        }
    });
}

#[test]
fn generated_die_programs_roll_within_their_bounds() {
    run_cases("die", |g| {
        let (source, lo, hi) = g.die(MAX_DEPTH);
        Case {
            source,
            saves: Vec::new(),
            expect: Expect::Die(lo, hi),
        }
    });
}

#[test]
fn generated_nullary_saves_round_trip_and_reroll() {
    run_cases("save", |g| {
        // Save a closed nullary die macro through the engine's own serializer.
        let (body, lo, hi) = g.die(MAX_DEPTH - 1);
        let saved = evaluate(&format!("save(:m, || {body})"), &[], "run");
        let source = saved["saves"][0]["source"]
            .as_str()
            .unwrap_or_else(|| panic!("save(:m, || {body}) didn't save: {saved}"))
            .to_owned();
        // Then use it from a generated program, called once or twice.
        g.env.push(("m".to_owned(), Bind::NullDie(lo, hi)));
        let (use_src, ulo, uhi) = g.die(2);
        g.env.pop();
        let (call, clo, chi) = if g.below(2) == 0 {
            ("m()".to_owned(), lo, hi)
        } else {
            ("(m() + m())".to_owned(), 2 * lo, 2 * hi)
        };
        Case {
            source: format!("({use_src}) + {call}"),
            saves: vec![("m".to_owned(), source)],
            expect: Expect::Die(ulo + clo, uhi + chi),
        }
    });
}
