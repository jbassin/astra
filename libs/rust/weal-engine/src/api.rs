//! S5 — the D32-11 wasm API: ONE export,
//! `evaluate(source, saves_json, seed, budget, mode) -> String` (JSON).
//!
//! The pure function is target-independent and natively unit-tested; the
//! wasm-bindgen wrapper (`wasm32` only) is a one-liner over it. NO
//! `getrandom` anywhere — entropy is the 32 host seed bytes.
//!
//! # Contract pins (D32-11)
//!
//! - `saves_json` = `[[name, source], …]` in id order. A malformed saves
//!   payload is a HOST bug; it reports `stage:"prelude"` without a name.
//! - `mode:"check"` parses + type-checks the saves (each against the
//!   prelude and the prior saves) and then the source, WITHOUT executing
//!   anything — the boot-validation path; no dice roll, no displays.
//! - `mode:"run"` = the full pipeline. Error stages: `parse` (source fails
//!   to parse/lower), `type`, `eval`, `fuel` (any exhausted counter — fuel,
//!   caps, or dist budget), `prelude` (a SAVES entry failed — carries
//!   `preludeName` + a span into THAT save's source). An `Internal` engine
//!   error reports as `eval` with an `internal error:` prefix.
//! - `budget` scales interpreter steps ONLY (D32-12): non-zero = the
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
use crate::interp::{Interp, RunError, run, save_scheme};
use crate::lower::{Span, lower_root_spanned};
use crate::plot::plot_png_base64;
use crate::render::{
    HEADLINE_MAX, RENDER_TEXT_MAX, Sampler, die_repr, dist_with, ellipsize, format_value,
    format_value_plain, render_die_display,
};
use crate::value::{ErrorKind, EvalError, Value};

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct SpanJson {
    start: usize,
    end: usize,
}

impl From<Span> for SpanJson {
    fn from((start, end): Span) -> SpanJson {
        SpanJson { start, end }
    }
}

#[derive(Serialize)]
struct ValueJson {
    t: &'static str,
    v: String,
}

fn value_json(v: &Value) -> ValueJson {
    let (t, text) = match v {
        Value::Num(n) => ("num", n.to_string()),
        Value::Dec(_) => ("dec", format_value_plain(v)),
        Value::Float(_) => ("float", format_value_plain(v)),
        Value::Str(s) => ("str", s.clone()),
        Value::Atom(a) => ("atom", a.clone()),
        Value::Unit => ("unit", "()".to_owned()),
        other => ("text", format_value_plain(other)),
    };
    ValueJson { t, v: text }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DisplayJson {
    kind: &'static str,
    render_text: String,
    headline: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<ValueJson>,
    #[serde(skip_serializing_if = "Option::is_none")]
    goodness: Option<Option<&'static str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    standard_dice: Option<Vec<(u64, u64)>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlotJson {
    png_base64: String,
    title: String,
    mean: Option<String>,
    std: Option<String>,
}

#[derive(Serialize)]
struct SaveJson {
    name: String,
    source: String,
}

#[derive(Serialize)]
struct OkJson {
    ok: bool,
    displays: Vec<DisplayJson>,
    plots: Vec<PlotJson>,
    saves: Vec<SaveJson>,
    warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrJson {
    ok: bool,
    stage: &'static str,
    message: String,
    span: Option<SpanJson>,
    prelude_name: Option<String>,
}

fn err_json(
    stage: &'static str,
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
        ErrorKind::Fuel => err_json("fuel", e.message.clone(), e.span, prelude_name),
        ErrorKind::Eval => err_json("eval", e.message.clone(), e.span, prelude_name),
        ErrorKind::Internal => err_json(
            "eval",
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
        Err(e) => return err_json("prelude", format!("malformed saves JSON: {e}"), None, None),
    };
    match mode {
        "check" => check_mode(source, &saves),
        "run" => run_mode(source, &saves, seed, budget),
        other => err_json("eval", format!("unknown mode: {other:?}"), None, None),
    }
}

/// Parse + type-check without executing (the boot path). Saves validate in
/// order, each against the prelude + prior saves.
fn check_mode(source: &str, saves: &[(String, String)]) -> String {
    let mut schemes = Vec::new();
    for (name, src) in saves {
        match check_one(src, &schemes) {
            Ok(scheme) => schemes.push((name.clone(), scheme)),
            Err((message, span)) => {
                return err_json("prelude", message, span, Some(name.clone()));
            }
        }
    }
    let parsed = crate::parser::parse(source);
    if let Some(e) = parsed.errors.first() {
        return err_json(
            "parse",
            format!("parse error: {}", e.message),
            Some(e.span),
            None,
        );
    }
    let lowered = lower_root_spanned(&parsed.syntax());
    let (ast, spans) = match lowered {
        Ok(x) => x,
        Err(e) => return err_json("parse", e.message, Some((0, source.len())), None),
    };
    if let Err(e) = crate::infer::check(&ast, &spans, &schemes) {
        return err_json("type", e.message, Some(e.span), None);
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

/// Parse+check ONE save source against the accumulated schemes; no
/// evaluation.
fn check_one(
    src: &str,
    schemes: &[(String, crate::types::Scheme)],
) -> Result<crate::types::Scheme, (String, Option<Span>)> {
    let parsed = crate::parser::parse(src);
    if let Some(e) = parsed.errors.first() {
        return Err((format!("parse error: {}", e.message), Some(e.span)));
    }
    let (ast, spans) =
        lower_root_spanned(&parsed.syntax()).map_err(|e| (e.message, Some((0usize, src.len()))))?;
    let (_core, ty) =
        crate::infer::check(&ast, &spans, schemes).map_err(|e| (e.message, Some(e.span)))?;
    Ok(save_scheme(&ty))
}

fn run_mode(source: &str, saves: &[(String, String)], seed: &[u8], budget: u32) -> String {
    // Pre-split the parse stage: `run` folds parse errors into its Check
    // variant, but D32-11 distinguishes them.
    let parsed = crate::parser::parse(source);
    if let Some(e) = parsed.errors.first() {
        return err_json(
            "parse",
            format!("parse error: {}", e.message),
            Some(e.span),
            None,
        );
    }
    if let Err(e) = lower_root_spanned(&parsed.syntax()) {
        return err_json("parse", e.message, Some((0, source.len())), None);
    }

    let mut fuel = if budget == 0 {
        Fuel::default()
    } else {
        Fuel::new(u64::from(budget))
    };
    let out = match run(source, saves, &mut fuel) {
        Ok(out) => out,
        Err(RunError::Check(e)) => return err_json("type", e.message, Some(e.span), None),
        Err(RunError::Save {
            name,
            message,
            span,
        }) => return err_json("prelude", message, span, Some(name)),
        Err(RunError::Eval(e)) => return eval_err_json(&e, None),
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
                displays.push(DisplayJson {
                    kind: "die",
                    render_text: rendered.render_text,
                    headline: rendered.headline,
                    value: Some(value_json(&rendered.value)),
                    goodness: Some(rendered.goodness.map(|g| g.as_str())),
                    standard_dice: Some(rendered.standard_dice),
                });
            }
            None => {
                let text = format_value(&d.value);
                displays.push(DisplayJson {
                    kind: "value",
                    render_text: ellipsize(&text, RENDER_TEXT_MAX),
                    headline: ellipsize(&text, HEADLINE_MAX),
                    value: None,
                    goodness: None,
                    standard_dice: None,
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

    /// The D32-11 export (`--target nodejs`).
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
