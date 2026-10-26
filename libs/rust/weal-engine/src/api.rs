//! The wasm API: ONE export,
//! `evaluate(source, saves_json, seed, budget, mode) -> String` (JSON).
//!
//! The pure function is target-independent and natively unit-tested; the
//! wasm-bindgen wrapper (`wasm32` only) is a one-liner over it. NO
//! `getrandom` anywhere — entropy is the 32 host seed bytes.
//!
//! # Contract pins
//!
//! - `saves_json` = `[[name, source], …]` in id order. A malformed saves
//!   payload is a HOST bug; it reports `stage:"prelude"` without a name.
//! - `mode:"check"` parses + type-checks the saves (each against the
//!   prelude and the prior saves) and then the source, WITHOUT executing
//!   anything — the boot-validation path; no dice roll, no displays.
//! - `mode:"run"` = the full pipeline. Error stages: `parse` (source fails
//!   to parse/lower), `type`, `eval`, `fuel` (any exhausted counter — fuel,
//!   caps, dist budget, or the parser's nesting cap), `prelude` (a SAVES entry failed — carries
//!   `preludeName` + a span into THAT save's source), and `internal` (an
//!   `Internal` engine error: an invariant a well-typed program should never
//!   break; the message keeps its `internal error:` prefix).
//! - `budget` scales interpreter steps ONLY: non-zero = the
//!   absolute interpreter-step budget for the run (0 = the 2,000,000
//!   default). Depth/construction caps and the distribution budget are
//!   untouched. (Design call, recorded: the u32 is the step count itself —
//!   full control in both directions, no multiplier convention.)
//! - `span` and `preludeName` are ALWAYS present on error payloads (null
//!   when inapplicable); `warnings` is reserved and always `[]`.
//! - An unknown `mode` reports `stage:"eval"` (host bug, visible).
//! - A short/long seed is zero-padded/truncated to 32 bytes (documented;
//!   production always passes 32).
//!
//! Render-time evaluator transitions (sampling + goodness distributions for
//! `evaluate()` dice) run on a FRESH default fuel — the run's own budget was
//! already consumed by the interpreter pass (documented; the dist budget
//! bounds the DP itself).

use serde::Serialize;

use crate::fuel::Fuel;
use crate::interp::Interp;
use crate::lower::Span;
use crate::pipeline::{
    CompileError, CompileStage, SaveError, SaveLoad, compile, fuel_for_budget, load_saves, lower,
};
use crate::plot::plot_png_base64;
use crate::render::{
    Goodness, HEADLINE_MAX, RENDER_TEXT_MAX, Sampler, die_repr, dist_with, ellipsize, format_value,
    format_value_plain, render_die_display,
};
use crate::value::{ErrorKind, EvalError, Value};

// ---------------------------------------------------------------------------
// Response shapes
//
// These types are the JSON contract. Under `cfg(test)` each also derives
// `ts_rs::TS`, and `ts_bindings` turns them into the committed
// `libs/ts/weal-engine/gen/weal_api.d.ts`, which the TS wrapper imports; the
// `ts_bindings_are_current` test fails when that file lags these types.
// `ts(rename)` keeps the TS names the wrapper has always exported.
// ---------------------------------------------------------------------------

/// A byte span into the source (or, for `prelude` errors, into the failing save).
#[derive(Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "WealSpan"))]
struct SpanJson {
    start: usize,
    end: usize,
}

impl From<Span> for SpanJson {
    fn from((start, end): Span) -> SpanJson {
        SpanJson { start, end }
    }
}

/// The type tag of a die display's sampled value.
#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "WealValueKind"))]
enum ValueKind {
    Num,
    Dec,
    Float,
    Str,
    Atom,
    Unit,
    Text,
}

/// The sampled top-level value of a die display.
#[derive(Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "WealValue"))]
struct ValueJson {
    t: ValueKind,
    v: String,
}

fn value_json(v: &Value) -> ValueJson {
    let (t, text) = match v {
        Value::Num(n) => (ValueKind::Num, n.to_string()),
        Value::Dec(_) => (ValueKind::Dec, format_value_plain(v)),
        Value::Float(_) => (ValueKind::Float, format_value_plain(v)),
        Value::Str(s) => (ValueKind::Str, s.clone()),
        Value::Atom(a) => (ValueKind::Atom, a.clone()),
        Value::Unit => (ValueKind::Unit, "()".to_owned()),
        other => (ValueKind::Text, format_value_plain(other)),
    };
    ValueJson { t, v: text }
}

/// One display: a rolled die (`kind:"die"`) or a plain value (`kind:"value"`).
#[derive(Serialize)]
#[serde(
    tag = "kind",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "WealDisplay"))]
enum DisplayJson {
    Die {
        render_text: String,
        headline: String,
        value: ValueJson,
        /// Null for a one-face support.
        goodness: Option<Goodness>,
        /// Every sampled NdM face (kept, dropped, and chain draws) as `[sides, face]`.
        standard_dice: Vec<(u64, u64)>,
    },
    Value {
        render_text: String,
        headline: String,
    },
}

/// One `plot(…)` chart.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "WealPlot"))]
struct PlotJson {
    png_base64: String,
    title: String,
    /// Null for non-numeric (atom/str) faces.
    mean: Option<String>,
    std: Option<String>,
}

/// One `save(…)` the run made, as the source text to store.
#[derive(Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "WealSave"))]
struct SaveJson {
    name: String,
    source: String,
}

/// A successful run (or a passing `mode:"check"`, with every list empty).
#[derive(Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "WealOk"))]
struct OkJson {
    #[cfg_attr(test, ts(type = "true"))]
    ok: bool,
    displays: Vec<DisplayJson>,
    plots: Vec<PlotJson>,
    saves: Vec<SaveJson>,
    /// Reserved; always empty.
    warnings: Vec<String>,
}

/// The error stages a failed evaluation reports (module docs).
#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "WealStage"))]
enum Stage {
    Parse,
    Type,
    Eval,
    Fuel,
    Prelude,
    Internal,
}

/// A failed run.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "WealErr"))]
struct ErrJson {
    #[cfg_attr(test, ts(type = "false"))]
    ok: bool,
    stage: Stage,
    message: String,
    span: Option<SpanJson>,
    /// The failing save's name, for `stage:"prelude"`.
    prelude_name: Option<String>,
}

/// What `evaluate` returns, as JSON.
#[cfg(test)]
#[derive(ts_rs::TS)]
#[ts(rename = "WealResult", untagged)]
#[allow(dead_code)] // only its TS declaration is used
enum ResultJson {
    Ok(OkJson),
    Err(ErrJson),
}

fn err_json(
    stage: Stage,
    message: impl Into<String>,
    span: Option<Span>,
    prelude_name: Option<String>,
) -> String {
    let payload = ErrJson {
        ok: false,
        stage,
        message: message.into(),
        span: span.map(SpanJson::from),
        prelude_name,
    };
    serde_json::to_string(&payload).expect("error payload serializes")
}

fn eval_err_json(e: &EvalError, prelude_name: Option<String>) -> String {
    match e.kind {
        ErrorKind::Fuel => err_json(Stage::Fuel, e.message.clone(), e.span, prelude_name),
        ErrorKind::Eval => err_json(Stage::Eval, e.message.clone(), e.span, prelude_name),
        ErrorKind::Internal => err_json(
            Stage::Internal,
            format!("internal error: {}", e.message),
            e.span,
            prelude_name,
        ),
    }
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

/// The single engine seam (module docs). Always returns a JSON string.
pub fn evaluate(source: &str, saves_json: &str, seed: &[u8], budget: u32, mode: &str) -> String {
    let saves: Vec<(String, String)> = match serde_json::from_str(saves_json) {
        Ok(s) => s,
        Err(e) => {
            return err_json(
                Stage::Prelude,
                format!("malformed saves JSON: {e}"),
                None,
                None,
            );
        }
    };
    match mode {
        "check" => check_mode(source, &saves),
        "run" => run_mode(source, &saves, seed, budget),
        other => err_json(Stage::Eval, format!("unknown mode: {other:?}"), None, None),
    }
}

fn compile_err_json(e: CompileError) -> String {
    let stage = match e.stage {
        CompileStage::Parse => Stage::Parse,
        // A structural cap, reported like the interpreter's caps.
        CompileStage::Limit => Stage::Fuel,
        CompileStage::Type => Stage::Type,
    };
    err_json(stage, e.message, Some(e.span), None)
}

fn save_err_json(e: SaveError) -> String {
    err_json(Stage::Prelude, e.message, e.span, Some(e.name))
}

/// Parse + type-check without executing (the boot path). Saves validate in
/// order, each against the prelude + prior saves, before the source.
fn check_mode(source: &str, saves: &[(String, String)]) -> String {
    let loaded = match load_saves(saves, SaveLoad::CheckOnly) {
        Ok(loaded) => loaded,
        Err(e) => return save_err_json(e),
    };
    if let Err(e) = compile(source, &loaded.schemes) {
        return compile_err_json(e);
    }
    let payload = OkJson {
        ok: true,
        displays: Vec::new(),
        plots: Vec::new(),
        saves: Vec::new(),
        warnings: Vec::new(),
    };
    serde_json::to_string(&payload).expect("ok payload serializes")
}

/// The full pipeline, then the render pass. The source parses and lowers
/// BEFORE the saves load, so a source parse error wins over a failing save;
/// it type-checks after them, against their schemes.
fn run_mode(source: &str, saves: &[(String, String)], seed: &[u8], budget: u32) -> String {
    let lowered = match lower(source) {
        Ok(lowered) => lowered,
        Err(e) => return compile_err_json(e),
    };
    let loaded = match load_saves(saves, SaveLoad::Evaluate) {
        Ok(loaded) => loaded,
        Err(e) => return save_err_json(e),
    };
    let checked = match lowered.check(&loaded.schemes) {
        Ok(checked) => checked,
        Err(e) => return compile_err_json(e),
    };
    let mut fuel = fuel_for_budget(budget);
    let out = match checked.eval(&loaded.env, &mut fuel) {
        Ok(out) => out,
        Err(e) => return eval_err_json(&e, None),
    };

    // Render pass: one sampler stream across all displays; a fresh fuel for
    // render-time evaluator transitions (module docs).
    let mut render_fuel = Fuel::default();
    let mut it = Interp::new(&mut render_fuel);
    let mut sampler = Sampler::new(seed);
    let mut displays = Vec::new();
    for d in &out.cmd.displays {
        match &d.die {
            Some(tree) => {
                let rendered = match render_die_display(tree, &mut sampler, &mut it) {
                    Ok(r) => r,
                    Err(e) => return eval_err_json(&e, None),
                };
                displays.push(DisplayJson::Die {
                    render_text: rendered.render_text,
                    headline: rendered.headline,
                    value: value_json(&rendered.value),
                    goodness: rendered.goodness,
                    standard_dice: rendered.standard_dice,
                });
            }
            None => {
                let text = format_value(&d.value);
                displays.push(DisplayJson::Value {
                    render_text: ellipsize(&text, RENDER_TEXT_MAX),
                    headline: ellipsize(&text, HEADLINE_MAX),
                });
            }
        }
    }

    let mut plots = Vec::new();
    for tree in &out.cmd.plots {
        let dist = match dist_with(tree, &mut it) {
            Ok(d) => d,
            Err(e) => return eval_err_json(&e, None),
        };
        let title = die_repr(tree);
        let png_base64 = match plot_png_base64(&dist, &title) {
            Ok(p) => p,
            Err(e) => return eval_err_json(&e, None),
        };
        plots.push(PlotJson {
            png_base64,
            title,
            mean: dist.mean_decimal(),
            std: dist.std_decimal(),
        });
    }

    let saves_out = out
        .cmd
        .saves
        .iter()
        .map(|s| SaveJson {
            name: s.name.clone(),
            source: s.source.clone(),
        })
        .collect();

    let payload = OkJson {
        ok: true,
        displays,
        plots,
        saves: saves_out,
        warnings: Vec::new(),
    };
    serde_json::to_string(&payload).expect("ok payload serializes")
}

// ---------------------------------------------------------------------------
// The wasm layer (thin — the pure fn above carries all the tests)
// ---------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
mod wasm {
    use wasm_bindgen::prelude::*;

    /// The single wasm export (`--target nodejs`).
    #[wasm_bindgen]
    pub fn evaluate(
        source: &str,
        saves_json: &str,
        seed: &[u8],
        budget: u32,
        mode: &str,
    ) -> String {
        super::evaluate(source, saves_json, seed, budget, mode)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(json: &str) -> serde_json::Value {
        serde_json::from_str(json).expect("error payload is JSON")
    }

    #[test]
    fn an_internal_error_reports_its_own_stage() {
        let v = parsed(&eval_err_json(&EvalError::internal("boom"), None));
        assert_eq!(v["stage"], "internal");
        assert_eq!(v["message"], "internal error: boom");
        assert!(v["preludeName"].is_null());
    }

    #[test]
    fn an_ordinary_eval_error_stays_eval() {
        let v = parsed(&eval_err_json(
            &EvalError::eval("division by zero", None),
            None,
        ));
        assert_eq!(v["stage"], "eval");
    }

    #[test]
    fn a_paren_bomb_is_a_fuel_error_not_a_trap() {
        let src = format!("{}1{}", "(".repeat(2000), ")".repeat(2000));
        for mode in ["run", "check"] {
            let v = parsed(&evaluate(&src, "[]", &[0u8; 32], 0, mode));
            assert_eq!(v["ok"], false);
            assert_eq!(v["stage"], "fuel", "{mode}");
            assert!(
                v["message"]
                    .as_str()
                    .is_some_and(|m| m.starts_with("fuel exhausted: nesting depth")),
                "{v}"
            );
        }
    }

    /// The committed TS declarations of the JSON contract.
    const TS_BINDINGS: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../ts/weal-engine/gen/weal_api.d.ts"
    );

    /// The TS declarations generated from the response shapes above.
    fn ts_bindings() -> String {
        use ts_rs::{Config, TS};
        // u64/usize fields become `number`: every value the engine emits fits a JS double.
        let cfg = Config::new().with_large_int("number");
        let decls = [
            SpanJson::decl(&cfg),
            Goodness::decl(&cfg),
            ValueKind::decl(&cfg),
            ValueJson::decl(&cfg),
            DisplayJson::decl(&cfg),
            PlotJson::decl(&cfg),
            SaveJson::decl(&cfg),
            OkJson::decl(&cfg),
            Stage::decl(&cfg),
            ErrJson::decl(&cfg),
            ResultJson::decl(&cfg),
        ];
        let mut out = String::from(
            "// Generated from libs/rust/weal-engine/src/api.rs by ts-rs; do not edit.\n\
             // Regenerate with `just weal-engine-build`.\n",
        );
        for decl in decls {
            out.push('\n');
            out.push_str("export ");
            out.push_str(&decl);
            out.push('\n');
        }
        out
    }

    /// Fails when `gen/weal_api.d.ts` lags the Rust types. `just weal-engine-build` runs it
    /// with `WEAL_WRITE_TS_BINDINGS=1`, which rewrites the file instead.
    #[test]
    fn ts_bindings_are_current() {
        let want = ts_bindings();
        if std::env::var_os("WEAL_WRITE_TS_BINDINGS").is_some() {
            std::fs::write(TS_BINDINGS, &want).expect("write gen/weal_api.d.ts");
            return;
        }
        let have = std::fs::read_to_string(TS_BINDINGS).unwrap_or_default();
        assert!(
            have == want,
            "libs/ts/weal-engine/gen/weal_api.d.ts is stale: run `just weal-engine-build`"
        );
    }
}
