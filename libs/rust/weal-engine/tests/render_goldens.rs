//! S5 §3 render goldens — byte-exact under the pinned seed `[77u8; 32]`
//! (spec 0032 §3; gate C).
//!
//! The spec table's SHAPE is the contract; its example faces were
//! illustrative. Under this crate's sampling order and seed the drawn faces
//! differ — the mapping (spec row → this seed's faces):
//!
//! | Spec row                          | This seed                         |
//! |-----------------------------------|-----------------------------------|
//! | `d20 ⟪14⟫ + 7 = 21`               | `d20 ⟪4⟫ + 7 = 11`                |
//! | `2d20 ⟪17,~~3~~⟫kh1 + 7 = 24`     | `2d20 ⟪~~4~~,15⟫kh1 + 7 = 22`     |
//! | `4d6 ⟪5,4,~~1~~,4⟫kh3 = 13`       | `4d6 ⟪6,~~1~~,3,6⟫kh3 = 15`       |
//! | `2d8 ⟪3,7⟫[fire] + 1d6 ⟪2⟫[…]`    | `2d8 ⟪8,3⟫[fire] + d6 ⟪3⟫[…]`     |
//! | `3d8 ⟪2,7,4⟫ + 5 = 18` (smite)    | `3d8 ⟪8,3,3⟫ + 5 = 19`            |
//! | `dl(…) ⟪:good⟫ = :good`           | `dl(…) ⟪:great⟫ = :great`         |
//! | `2d6e2 ⟪5,6→3⟫ = 14`              | `2d6e2 ⟪6→1,3⟫ = 10`              |
//! | `d20 ⟪14⟫ + 6 = 20`               | `d20 ⟪4⟫ + 6 = 10`                |
//!
//! One canonical-form DEVIATION (recorded): a count-1 die renders `d6`, not
//! the source's `1d6` spelling — the render tree is derived from the VALUE
//! tree (`Leaf{count: 1, …}`), which no longer carries the source text.

use serde_json::Value as Json;

const SEED: [u8; 32] = [77u8; 32];

fn run(src: &str) -> Json {
    run_with_saves(src, "[]")
}

fn run_with_saves(src: &str, saves: &str) -> Json {
    let out = weal_engine::evaluate(src, saves, &SEED, 0, "run");
    serde_json::from_str(&out).expect("engine returns valid JSON")
}

fn display0(src: &str) -> Json {
    let v = run(src);
    assert_eq!(v["ok"], Json::Bool(true), "not ok for {src}: {v}");
    v["displays"][0].clone()
}

fn assert_row(src: &str, render_text: &str, headline: &str, dice: &[(u64, u64)]) {
    let d = display0(src);
    assert_eq!(d["kind"], "die", "{src}");
    assert_eq!(d["renderText"], render_text, "{src}");
    assert_eq!(d["headline"], headline, "{src}");
    let got: Vec<(u64, u64)> = d["standardDice"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| (p[0].as_u64().unwrap(), p[1].as_u64().unwrap()))
        .collect();
    assert_eq!(got, dice, "{src}");
}

// -- the §3 table (each row byte-exact) -------------------------------------

#[test]
fn table_d20_plus_7() {
    assert_row("d20 + 7", "d20 ⟪4⟫ + 7 = 11", "11", &[(20, 4)]);
}

#[test]
fn table_2d20kh1_plus_7_coercion_case() {
    assert_row(
        "2d20kh1 + 7",
        "2d20 ⟪~~4~~,15⟫kh1 + 7 = 22",
        "22",
        &[(20, 4), (20, 15)],
    );
}

#[test]
fn table_4d6kh3_strikethrough() {
    assert_row(
        "4d6kh3",
        "4d6 ⟪6,~~1~~,3,6⟫kh3 = 15",
        "15",
        &[(6, 6), (6, 1), (6, 3), (6, 6)],
    );
}

#[test]
fn table_labels() {
    assert_row(
        "2d8[fire] + 1d6[slashing]",
        "2d8 ⟪8,3⟫[fire] + d6 ⟪3⟫[slashing] = 14",
        "14",
        &[(8, 8), (8, 3), (6, 3)],
    );
}

#[test]
fn table_transparent_user_call() {
    // The let-fn call leaves NO call-site node; sum(pool(3, d8)) collapses
    // to the 3d8 leaf.
    assert_row(
        "let smite(n) = sum(pool(n, d8)) + 5; smite(3)",
        "3d8 ⟪8,3,3⟫ + 5 = 19",
        "19",
        &[(8, 8), (8, 3), (8, 3)],
    );
}

#[test]
fn table_dl_constructor_leaf() {
    assert_row(
        "dl([:fine, :good, :great])",
        "dl(:fine,:good,:great) ⟪:great⟫ = :great",
        ":great",
        &[],
    );
}

#[test]
fn table_explode_chain() {
    // The chain draw (6→1) records BOTH faces in standardDice (D32-11).
    assert_row(
        "2d6e2",
        "2d6e2 ⟪6→1,3⟫ = 10",
        "10",
        &[(6, 6), (6, 1), (6, 3)],
    );
}

#[test]
fn table_die_free_math_collapses() {
    assert_row("d20 + 3*2", "d20 ⟪4⟫ + 6 = 10", "10", &[(20, 4)]);
}

#[test]
fn evaluate_renders_pool_faces_and_state() {
    // §3: `evaluate()` renders `evaluate(NdM) ⟪sampled pool faces⟫ = state`.
    assert_row(
        "evaluate(pool(4, d6), 0, |s, f, c| s + f * c)",
        "evaluate(4d6) ⟪6,1,3,6⟫ = 16",
        "16",
        &[(6, 6), (6, 1), (6, 3), (6, 6)],
    );
}

// -- reroll chains (design call: rendered like explode chains) --------------

#[test]
fn reroll_face_chain_renders_orig_to_rerolled() {
    assert_row("2d6r1", "2d6r1 ⟪6,1→3⟫ = 9", "9", &[(6, 6), (6, 1), (6, 3)]);
}

#[test]
fn reroll_list_no_match_renders_single_face() {
    assert_row(
        "reroll(d6, [1, 2])",
        "reroll(d6, [1, 2]) ⟪6⟫ = 6",
        "6",
        &[(6, 6)],
    );
}

// -- more render structure --------------------------------------------------

#[test]
fn successes_renders_pool_and_target() {
    assert_row(
        "successes(pool(5, d10), 7)",
        "successes(5d10 ⟪4,5,9,10,10⟫, 7) = 3",
        "3",
        &[(10, 4), (10, 5), (10, 9), (10, 10), (10, 10)],
    );
}

#[test]
fn keep_chain_renders_all_suffixes() {
    assert_row(
        "5d10kh3kl1",
        "5d10 ⟪~~4~~,~~5~~,9,~~10~~,~~10~~⟫kh3kl1 = 9",
        "9",
        &[(10, 4), (10, 5), (10, 9), (10, 10), (10, 10)],
    );
}

#[test]
fn lifted_cmp_compares_sampled_operands() {
    let d = display0("d20 > 10");
    assert_eq!(d["renderText"], "d20 ⟪4⟫ > 10 = :false");
    assert_eq!(d["value"], serde_json::json!({"t": "atom", "v": "false"}));
    assert_eq!(d["goodness"], "fumble"); // face order [:false, :true]
}

#[test]
fn min_max_render_as_calls() {
    assert_row(
        "min(d6, d6)",
        "min(d6 ⟪6⟫, d6 ⟪1⟫) = 1",
        "1",
        &[(6, 6), (6, 1)],
    );
}

#[test]
fn dm_weighted_draw_no_standard_dice() {
    assert_row("dm([1: 2, 5: 1])", "dm(1:2,5:1) ⟪5⟫ = 5", "5", &[]);
}

#[test]
fn additive_chains_flatten_to_one_render_level() {
    // Left-associative same-precedence chains are ONE chain node — no
    // depth-4 collapse on a flat `+ 1 + 2 + …` run.
    assert_row(
        "((((d4 + 1) + 2) + 3) + 4) + 5",
        "d4 ⟪4⟫ + 1 + 2 + 3 + 4 + 5 = 19",
        "19",
        &[(4, 4)],
    );
}

#[test]
fn depth_bound_collapses_innermost_parenthesized_subtrees() {
    let d = display0("d4 + (d4 + (d4 + (d4 + (d4 + d4))))");
    assert_eq!(
        d["renderText"],
        "d4 ⟪4⟫ + (d4 ⟪3⟫ + (d4 ⟪3⟫ + ((d4 = 4) + (d4 + d4 = 7)))) = 21"
    );
    // Every leaf still contributes standardDice, collapsed or not.
    assert_eq!(d["standardDice"].as_array().unwrap().len(), 6);
}

#[test]
fn render_text_cap_floors_to_ellipsized_value() {
    let big = format!("dl([\"{}\", \"{}\"])", "x".repeat(600), "y".repeat(600));
    let d = display0(&big);
    let rt = d["renderText"].as_str().unwrap();
    assert!(rt.chars().count() <= 900, "{} chars", rt.chars().count());
    assert!(rt.starts_with("= \""));
    assert_eq!(d["headline"].as_str().unwrap().chars().count(), 80);
    assert!(d["headline"].as_str().unwrap().ends_with('…'));
}

#[test]
fn str_faces_are_markdown_escaped() {
    let d = display0("dl([\"a*b\", \"c_d\"])");
    assert_eq!(
        d["renderText"],
        "dl(\"a\\*b\",\"c\\_d\") ⟪\"c\\_d\"⟫ = \"c\\_d\""
    );
    // The structured value carries the RAW content.
    assert_eq!(d["value"], serde_json::json!({"t": "str", "v": "c_d"}));
}

#[test]
fn displays_share_one_rng_stream() {
    let v = run("[d6, d6, d6]");
    let faces: Vec<&str> = (0..3)
        .map(|i| v["displays"][i]["headline"].as_str().unwrap())
        .collect();
    assert_eq!(faces, ["6", "1", "3"]); // three DISTINCT draws, one stream
}

#[test]
fn saved_fn_is_suffix_eligible_and_transparent() {
    let v = run_with_saves("d6smite2", "[[\"smite\", \"|d, n| explode(d, n)\"]]");
    assert_eq!(v["displays"][0]["renderText"], "d6e2 ⟪6→1⟫ = 7");
}

#[test]
fn goodness_null_on_single_face_support() {
    let d = display0("dl([:only])");
    assert_eq!(d["goodness"], Json::Null);
}

#[test]
fn goodness_bands_follow_face_order_thirds() {
    // d20 + 7 under this seed rolls 4 → position 3 of 20 → bad.
    assert_eq!(display0("d20 + 7")["goodness"], "bad");
    // 4d6kh3 = 15 → position 12 of 16 (support 3..18) → good.
    assert_eq!(display0("4d6kh3")["goodness"], "good");
    // dl: :great is the LAST face in face order → crit.
    assert_eq!(display0("dl([:fine, :good, :great])")["goodness"], "crit");
    assert_eq!(display0("min(d6, d6)")["goodness"], "fumble"); // rolled 1
}

#[test]
fn evaluate_over_atom_pool_iterates_face_order() {
    let d = display0(
        "evaluate(pool(2, dl([:hit, :miss])), {0, 0}, \
         |s, f, c| match s | {h, m} -> match f | :hit -> {h + c, m} | _ -> {h, m + c})",
    );
    assert_eq!(
        d["renderText"],
        "evaluate(pool(2, dl(:hit,:miss))) ⟪:miss,:hit⟫ = {1, 1}"
    );
    assert_eq!(d["value"], serde_json::json!({"t": "text", "v": "{1, 1}"}));
}

#[test]
fn sampling_is_deterministic_per_seed() {
    let a = weal_engine::evaluate("4d6kh3", "[]", &SEED, 0, "run");
    let b = weal_engine::evaluate("4d6kh3", "[]", &SEED, 0, "run");
    assert_eq!(a, b);
    let c = weal_engine::evaluate("4d6kh3", "[]", &[99u8; 32], 0, "run");
    assert_ne!(a, c);
}

// -- the D32-8 count-0 amendment (goodness/dist divergence regression) ------

#[test]
fn evaluate_goodness_reflects_the_landed_face_dist() {
    // Before the amendment the dist side folded count-0 faces too,
    // collapsing `s + f` over 2d6 to the constant 21 — support_len 1 →
    // goodness null despite a real spread. The closure now fires only for
    // landed faces on BOTH sides.
    let d = display0("evaluate(pool(2, d6), 0, |s, f, c| s + f)");
    assert_ne!(d["goodness"], Json::Null);
}
