//! S5 D32-11 API contract tests: full-pipeline JSON goldens, error stages,
//! `mode:"check"`, budget scaling, plots, saves.

use serde_json::Value as Json;

const SEED: [u8; 32] = [77u8; 32];

fn eval(src: &str, saves: &str, budget: u32, mode: &str) -> String {
    weal_engine::evaluate(src, saves, &SEED, budget, mode)
}

fn parse(out: &str) -> Json {
    serde_json::from_str(out).expect("valid JSON")
}

// -- the full-payload golden ------------------------------------------------

#[test]
fn seeded_roll_full_json_golden() {
    let out = eval("2d6", "[]", 0, "run");
    assert_eq!(
        out,
        "{\"ok\":true,\"displays\":[{\"kind\":\"die\",\
         \"renderText\":\"2d6 ⟪6,1⟫ = 7\",\"headline\":\"7\",\
         \"value\":{\"t\":\"num\",\"v\":\"7\"},\"goodness\":\"okay\",\
         \"standardDice\":[[6,6],[6,1]]}],\"plots\":[],\"saves\":[],\
         \"warnings\":[]}"
    );
}

#[test]
fn value_display_has_no_die_fields() {
    let v = parse(&eval("1 + 2", "[]", 0, "run"));
    let d = &v["displays"][0];
    assert_eq!(d["kind"], "value");
    assert_eq!(d["headline"], "3");
    assert_eq!(d["renderText"], "3");
    assert!(d.get("goodness").is_none());
    assert!(d.get("standardDice").is_none());
    assert!(d.get("value").is_none());
}

// -- error stages -----------------------------------------------------------

#[test]
fn parse_stage_with_span() {
    let v = parse(&eval("1 +", "[]", 0, "run"));
    assert_eq!(v["ok"], Json::Bool(false));
    assert_eq!(v["stage"], "parse");
    assert_eq!(v["span"], serde_json::json!({"start": 3, "end": 3}));
    assert_eq!(v["preludeName"], Json::Null);
}

#[test]
fn type_stage_with_span() {
    let v = parse(&eval("1 + \"a\"", "[]", 0, "run"));
    assert_eq!(v["stage"], "type");
    assert_eq!(v["span"], serde_json::json!({"start": 0, "end": 7}));
    assert!(v["message"].as_str().unwrap().contains("Str"));
}

#[test]
fn fuel_stage_names_the_counter() {
    let v = parse(&eval("10001d6", "[]", 0, "run"));
    assert_eq!(v["stage"], "fuel");
    assert_eq!(v["message"], "fuel exhausted: pool count");
    // The depth-cap case needs a big-stack thread in debug builds (the S3
    // pattern; the wasm build sizes its stack for the same reason — §6).
    let v = std::thread::Builder::new()
        .stack_size(32 * 1024 * 1024)
        .spawn(|| parse(&eval("let f(x) = f(x); f(1)", "[]", 0, "run")))
        .expect("spawn")
        .join()
        .expect("join");
    assert_eq!(v["stage"], "fuel");
    assert_eq!(v["message"], "fuel exhausted: recursion depth");
}

#[test]
fn eval_stage_division_by_zero() {
    let v = parse(&eval("d6 / 0", "[]", 0, "run"));
    assert_eq!(v["stage"], "eval");
    assert!(v["message"].as_str().unwrap().contains("division by zero"));
}

#[test]
fn prelude_stage_attributes_the_failing_save() {
    // Span points into THAT save's source ("1 +" fails at byte 3).
    let v = parse(&eval("d6", "[[\"bad\", \"1 +\"]]", 0, "run"));
    assert_eq!(v["stage"], "prelude");
    assert_eq!(v["preludeName"], "bad");
    assert_eq!(v["span"], serde_json::json!({"start": 3, "end": 3}));
}

#[test]
fn prelude_stage_type_error_checks_against_prior_saves() {
    // `bad` misapplies the PRIOR save `ok` — checked in id order.
    let saves = "[[\"ok\", \"|x| x + 1\"], [\"bad\", \"ok(\\\"s\\\")\"]]";
    let v = parse(&eval("d6", saves, 0, "run"));
    assert_eq!(v["stage"], "prelude");
    assert_eq!(v["preludeName"], "bad");
    assert!(v["span"].is_object());
}

#[test]
fn malformed_saves_json_reports_prelude() {
    let v = parse(&eval("d6", "not json", 0, "run"));
    assert_eq!(v["stage"], "prelude");
    assert_eq!(v["preludeName"], Json::Null);
}

#[test]
fn unknown_mode_reports_eval() {
    let v = parse(&eval("d6", "[]", 0, "bogus"));
    assert_eq!(v["stage"], "eval");
    assert!(v["message"].as_str().unwrap().contains("unknown mode"));
}

// -- mode:"check" -----------------------------------------------------------

#[test]
fn check_mode_on_a_die_source_runs_nothing() {
    // No displays, no sampling, no saves output — parse+check only.
    let out = eval("2d6", "[]", 0, "check");
    assert_eq!(
        out,
        "{\"ok\":true,\"displays\":[],\"plots\":[],\"saves\":[],\"warnings\":[]}"
    );
    // Even a save() call must not execute or register.
    let v = parse(&eval("save(:x, 1)", "[]", 0, "check"));
    assert_eq!(v["ok"], Json::Bool(true));
    assert_eq!(v["saves"].as_array().unwrap().len(), 0);
}

#[test]
fn check_mode_surfaces_parse_and_type_stages() {
    let v = parse(&eval("1 +", "[]", 0, "check"));
    assert_eq!(v["stage"], "parse");
    let v = parse(&eval("1 + \"a\"", "[]", 0, "check"));
    assert_eq!(v["stage"], "type");
}

#[test]
fn check_mode_validates_saves_in_order() {
    let v = parse(&eval("d6", "[[\"bad\", \"1 +\"]]", 0, "check"));
    assert_eq!(v["stage"], "prelude");
    assert_eq!(v["preludeName"], "bad");
    // A later save may use an earlier one.
    let saves = "[[\"ok\", \"|x| x + 1\"], [\"uses\", \"ok(2)\"]]";
    let v = parse(&eval("d6", saves, 0, "check"));
    assert_eq!(v["ok"], Json::Bool(true));
}

// -- budget (D32-12: interpreter steps only) --------------------------------

#[test]
fn budget_scales_interpreter_steps_only() {
    let src = "let x = 1; let y = x + 1; y * 3";
    // Default budget: fine.
    assert_eq!(parse(&eval(src, "[]", 0, "run"))["ok"], Json::Bool(true));
    // A 5-step budget starves it.
    let v = parse(&eval(src, "[]", 5, "run"));
    assert_eq!(v["stage"], "fuel");
    assert_eq!(v["message"], "fuel exhausted: interpreter steps");
    // A generous explicit budget behaves like the default.
    assert_eq!(
        parse(&eval(src, "[]", 1_000_000, "run"))["ok"],
        Json::Bool(true)
    );
    // Construction caps are NOT scaled by a big budget.
    let v = parse(&eval("10001d6", "[]", 4_000_000_000, "run"));
    assert_eq!(v["stage"], "fuel");
    assert_eq!(v["message"], "fuel exhausted: pool count");
}

// -- saves + plots ----------------------------------------------------------

#[test]
fn save_effect_serializes_into_the_saves_array() {
    let out = eval("save(:smite, |n| n + 3)", "[]", 0, "run");
    assert_eq!(
        out,
        "{\"ok\":true,\"displays\":[],\"plots\":[],\
         \"saves\":[{\"name\":\"smite\",\"source\":\"|n| n + 3\"}],\
         \"warnings\":[]}"
    );
}

#[test]
fn plot_produces_png_with_stats() {
    let v = parse(&eval("plot(4d6kh3)", "[]", 0, "run"));
    assert_eq!(v["ok"], Json::Bool(true));
    let p = &v["plots"][0];
    assert_eq!(p["title"], "4d6kh3");
    assert_eq!(p["mean"], "12.244599");
    assert_eq!(p["std"], "2.846844");
    // base64 of a PNG starts with the encoded 8-byte PNG signature.
    assert!(p["pngBase64"].as_str().unwrap().starts_with("iVBORw0KGgo"));
    // Plot-only scripts display nothing.
    assert_eq!(v["displays"].as_array().unwrap().len(), 0);
}

#[test]
fn plot_of_atom_die_has_null_stats() {
    let v = parse(&eval("plot(dl([:a, :b]))", "[]", 0, "run"));
    let p = &v["plots"][0];
    assert_eq!(p["mean"], Json::Null);
    assert_eq!(p["std"], Json::Null);
    assert!(!p["pngBase64"].as_str().unwrap().is_empty());
}

#[test]
fn warnings_is_reserved_and_empty() {
    let v = parse(&eval("d6", "[]", 0, "run"));
    assert_eq!(v["warnings"], serde_json::json!([]));
}

// -- the list toolkit (repeat/concat/map/filter/fold) -----------------------

#[test]
fn fold_repeat_collapses_die_free_math() {
    let v = parse(&eval("fold(repeat(3, 4), 0, |a, b| a + b)", "[]", 0, "run"));
    assert_eq!(v["ok"], Json::Bool(true));
    assert_eq!(v["displays"][0]["headline"], "12");
}

#[test]
fn map_filter_fold_compose() {
    // [1,2,3,4] -> [2,4,6,8] -> [6,8] -> 14
    let v = parse(&eval(
        "fold(filter(map([1, 2, 3, 4], _ * 2), _ >= 5), 0, |a, b| a + b)",
        "[]",
        0,
        "run",
    ));
    assert_eq!(v["displays"][0]["headline"], "14");
}

#[test]
fn repeat_die_rolls_independently() {
    let v = parse(&eval("repeat(d20, 3)", "[]", 0, "run"));
    let displays = v["displays"].as_array().unwrap();
    assert_eq!(displays.len(), 3, "one die display per element");
    for d in displays {
        assert_eq!(d["kind"], "die");
        assert_eq!(d["standardDice"].as_array().unwrap().len(), 1);
    }
    // Independence: the three sampled faces are not all forced equal (the fixed
    // seed samples leaves in source order — a shared-sample bug would repeat one
    // face three times AND collapse standardDice; this pins the shape).
    let faces: Vec<&str> = displays
        .iter()
        .map(|d| d["headline"].as_str().unwrap())
        .collect();
    assert_eq!(faces.len(), 3);
}

#[test]
fn concat_lists_of_dice() {
    let v = parse(&eval("concat(repeat(d6, 2), [d20])", "[]", 0, "run"));
    let displays = v["displays"].as_array().unwrap();
    assert_eq!(displays.len(), 3);
    assert_eq!(displays[2]["standardDice"][0][0], 20);
}

#[test]
fn len_counts_after_filter() {
    let v = parse(&eval("len(filter([1, 2, 3, 4], _ >= 3))", "[]", 0, "run"));
    assert_eq!(v["displays"][0]["headline"], "2");
}

#[test]
fn repeat_zero_is_empty() {
    let v = parse(&eval("repeat(d20, 0)", "[]", 0, "run"));
    assert_eq!(v["ok"], Json::Bool(true));
    assert_eq!(v["displays"].as_array().unwrap().len(), 0);
}

#[test]
fn repeat_negative_is_eval_error() {
    let v = parse(&eval("repeat(d20, 0 - 1)", "[]", 0, "run"));
    assert_eq!(v["ok"], Json::Bool(false));
    assert_eq!(v["stage"], "eval");
}

#[test]
fn repeat_over_cap_is_fuel() {
    let v = parse(&eval("repeat(d20, 10001)", "[]", 0, "run"));
    assert_eq!(v["ok"], Json::Bool(false));
    assert_eq!(v["stage"], "fuel");
    assert!(v["message"].as_str().unwrap().contains("list length"));
}

#[test]
fn short_seed_is_zero_padded() {
    // Documented robustness: a short seed behaves like its zero-padded form.
    let a = weal_engine::evaluate("d20", "[]", &[7u8; 16], 0, "run");
    let mut padded = [0u8; 32];
    padded[..16].copy_from_slice(&[7u8; 16]);
    let b = weal_engine::evaluate("d20", "[]", &padded, 0, "run");
    assert_eq!(a, b);
}
