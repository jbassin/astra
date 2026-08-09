//! S5 — the D32-16 PMF plot: an 800×450 bar chart of a die's exact
//! distribution, rendered into an in-memory RGB buffer, PNG-encoded (`png`
//! crate) and base64'd.
//!
//! # The wasm text DEVIATION (recorded)
//!
//! D32-9 pinned "plotters w/ `ab_glyph` + bitmap backend" for text under
//! wasm32. In the released crate (0.3.7, and master at build time) the
//! `ab_glyph` font backend is **cfg'd OUT on `wasm32-unknown-unknown`**:
//! plotters hard-selects its `web` backend there, whose `estimate_layout`
//! calls `web_sys::window().unwrap()` — an instant trap under Node. So:
//! plotters draws the GEOMETRY only (background, bars, axis frame, grid —
//! no code path that touches its font machinery), and every piece of text
//! (title, axis labels) is rasterized directly with the `ab_glyph` crate
//! over ONE embedded font — the same font stack D32-9 intended, identical
//! pixels on native and wasm, and the label-pixel golden exercises exactly
//! the code the wasm module runs.
//!
//! The font: `fonts/DejaVuSans.ttf` (Bitstream Vera license +
//! public-domain DejaVu additions — permissive; license text vendored next
//! to the font).
//!
//! Base64 is HAND-ROLLED (design call, recorded): the standard alphabet
//! with padding is ~25 lines, and it keeps a whole crate off the wasm dep
//! tree.

use ab_glyph::{Font, FontRef, PxScale, ScaleFont};
use plotters::prelude::*;

use crate::dist_seam::SeamDist;
use crate::render::{ellipsize, format_value_plain};
use crate::value::EvalError;

/// Plot dimensions (D32-16).
pub const PLOT_WIDTH: u32 = 800;
pub const PLOT_HEIGHT: u32 = 450;

// Layout (pixel space; the drawing area is pixel-coordinated).
const MARGIN_LEFT: i32 = 64;
const MARGIN_RIGHT: i32 = 16;
const MARGIN_TOP: i32 = 48;
const MARGIN_BOTTOM: i32 = 38;
const TITLE_SIZE: f32 = 26.0;
const LABEL_SIZE: f32 = 14.0;
/// At most this many x labels (faces beyond it are strided).
const MAX_X_LABELS: usize = 20;

const FONT_BYTES: &[u8] = include_bytes!("../fonts/DejaVuSans.ttf");

fn plot_err(e: impl std::fmt::Display) -> EvalError {
    EvalError::eval(format!("plot rendering failed: {e}"), None)
}

fn font() -> Result<FontRef<'static>, EvalError> {
    FontRef::try_from_slice(FONT_BYTES).map_err(|_| plot_err("embedded font failed to parse"))
}

/// Sum of horizontal advances at `size` (no kerning — labels are short).
fn text_width(font: &FontRef<'_>, size: f32, text: &str) -> f32 {
    let scaled = font.as_scaled(PxScale::from(size));
    text.chars()
        .map(|c| scaled.h_advance(scaled.glyph_id(c)))
        .sum()
}

/// Rasterize `text` onto the RGB buffer with its LEFT edge at `x` and its
/// BASELINE at `y` (alpha-blended coverage, black ink).
fn draw_text(buf: &mut [u8], font: &FontRef<'_>, size: f32, x: f32, y: f32, text: &str) {
    let scaled = font.as_scaled(PxScale::from(size));
    let mut pen = x;
    for c in text.chars() {
        let id = scaled.glyph_id(c);
        let glyph = id.with_scale_and_position(PxScale::from(size), ab_glyph::point(pen, y));
        pen += scaled.h_advance(id);
        let Some(outline) = font.outline_glyph(glyph) else {
            continue;
        };
        let bounds = outline.px_bounds();
        outline.draw(|gx, gy, cov| {
            let px = bounds.min.x as i32 + gx as i32;
            let py = bounds.min.y as i32 + gy as i32;
            if px < 0 || py < 0 || px >= PLOT_WIDTH as i32 || py >= PLOT_HEIGHT as i32 {
                return;
            }
            let idx = ((py as u32 * PLOT_WIDTH + px as u32) * 3) as usize;
            let cov = cov.clamp(0.0, 1.0);
            for channel in &mut buf[idx..idx + 3] {
                *channel = (f32::from(*channel) * (1.0 - cov)) as u8;
            }
        });
    }
}

/// Weight → f64 via decimal text (exact for the magnitudes that matter,
/// safely approximate beyond).
fn weight_f64(w: &num_bigint::BigUint) -> f64 {
    w.to_string().parse::<f64>().unwrap_or(f64::MAX)
}

/// Render the PMF bar chart into a raw RGB buffer (`800*450*3`). Faces are
/// drawn in FACE ORDER; atom (and any non-numeric) faces render their
/// display text as x labels.
pub fn render_plot_rgb(dist: &SeamDist, title: &str) -> Result<Vec<u8>, EvalError> {
    let font = font()?;
    let faces = dist.face_order();
    let labels: Vec<String> = faces
        .iter()
        .map(|f| ellipsize(&format_value_plain(f), 12))
        .collect();
    let denom = weight_f64(&dist.denominator());
    let probs: Vec<f64> = faces
        .iter()
        .map(|f| weight_f64(&dist.weight_of(f)) / denom)
        .collect();
    let max_p = probs
        .iter()
        .copied()
        .fold(0.0f64, f64::max)
        .max(f64::MIN_POSITIVE);
    let y_max = max_p * 1.08;
    let n = faces.len();

    let (left, right) = (MARGIN_LEFT, PLOT_WIDTH as i32 - MARGIN_RIGHT);
    let (top, bottom) = (MARGIN_TOP, PLOT_HEIGHT as i32 - MARGIN_BOTTOM);
    let y_of = |p: f64| bottom - ((p / y_max) * f64::from(bottom - top)) as i32;
    let slot = f64::from(right - left) / n as f64;

    let mut buf = vec![0u8; (PLOT_WIDTH * PLOT_HEIGHT * 3) as usize];
    {
        // Plotters draws GEOMETRY only (module docs) in pixel coordinates.
        let root =
            BitMapBackend::with_buffer(&mut buf, (PLOT_WIDTH, PLOT_HEIGHT)).into_drawing_area();
        root.fill(&WHITE).map_err(plot_err)?;
        // Horizontal gridlines at the y ticks.
        let grid = RGBColor(0xd8, 0xd8, 0xd8);
        for tick in 1..=4 {
            let y = y_of(y_max * f64::from(tick) / 4.0);
            root.draw(&PathElement::new(vec![(left, y), (right, y)], grid))
                .map_err(plot_err)?;
        }
        // Bars.
        let bar = RGBColor(64, 96, 168);
        for (i, p) in probs.iter().enumerate() {
            let x0 = left + (slot * (i as f64 + 0.1)) as i32;
            let x1 = left + (slot * (i as f64 + 0.9)) as i32;
            let y = y_of(*p);
            root.draw(&Rectangle::new(
                [(x0, y), (x1.max(x0 + 1), bottom)],
                bar.filled(),
            ))
            .map_err(plot_err)?;
        }
        // Axis frame.
        root.draw(&PathElement::new(
            vec![(left, top), (left, bottom), (right, bottom)],
            BLACK,
        ))
        .map_err(plot_err)?;
        root.present().map_err(plot_err)?;
    }

    // Text pass (direct ab_glyph rasterization — module docs).
    let title_text = ellipsize(title, 60);
    let tw = text_width(&font, TITLE_SIZE, &title_text);
    draw_text(
        &mut buf,
        &font,
        TITLE_SIZE,
        (PLOT_WIDTH as f32 - tw) / 2.0,
        30.0,
        &title_text,
    );
    // Y tick labels (percent), right-aligned against the axis.
    for tick in 0..=4 {
        let p = y_max * f64::from(tick) / 4.0;
        let label = format!("{:.1}%", p * 100.0);
        let w = text_width(&font, LABEL_SIZE, &label);
        let y = y_of(p) as f32 + LABEL_SIZE * 0.35;
        draw_text(
            &mut buf,
            &font,
            LABEL_SIZE,
            left as f32 - 8.0 - w,
            y,
            &label,
        );
    }
    // X labels, centered under their slots, strided down to MAX_X_LABELS.
    let stride = n.div_ceil(MAX_X_LABELS);
    for (i, label) in labels.iter().enumerate() {
        if !i.is_multiple_of(stride) {
            continue;
        }
        let center = left as f32 + (slot * (i as f64 + 0.5)) as f32;
        let w = text_width(&font, LABEL_SIZE, label);
        draw_text(
            &mut buf,
            &font,
            LABEL_SIZE,
            center - w / 2.0,
            bottom as f32 + LABEL_SIZE + 4.0,
            label,
        );
    }
    Ok(buf)
}

/// RGB buffer → PNG bytes.
pub fn encode_png(rgb: &[u8]) -> Result<Vec<u8>, EvalError> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, PLOT_WIDTH, PLOT_HEIGHT);
        enc.set_color(png::ColorType::Rgb);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc.write_header().map_err(plot_err)?;
        writer.write_image_data(rgb).map_err(plot_err)?;
    }
    Ok(out)
}

/// The full D32-16 pipeline: PMF chart → PNG → base64.
pub fn plot_png_base64(dist: &SeamDist, title: &str) -> Result<String, EvalError> {
    let rgb = render_plot_rgb(dist, title)?;
    let png = encode_png(&rgb)?;
    Ok(base64_encode(&png))
}

/// Standard-alphabet base64 with `=` padding (hand-rolled, module docs).
pub fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = u32::from(chunk[0]);
        let b1 = u32::from(chunk.get(1).copied().unwrap_or(0));
        let b2 = u32::from(chunk.get(2).copied().unwrap_or(0));
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(ALPHABET[(triple >> 18) as usize & 0x3f] as char);
        out.push(ALPHABET[(triple >> 12) as usize & 0x3f] as char);
        if chunk.len() > 1 {
            out.push(ALPHABET[(triple >> 6) as usize & 0x3f] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(ALPHABET[triple as usize & 0x3f] as char);
        } else {
            out.push('=');
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dist_seam::dist_of;
    use crate::value::DieTree;

    #[test]
    fn base64_matches_the_rfc4648_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    fn d20_dist() -> crate::dist_seam::SeamDist {
        dist_of(&DieTree::Leaf {
            count: 1,
            sides: 20,
        })
        .unwrap()
    }

    #[test]
    fn title_label_pixels_are_drawn() {
        // The blank-text regression gate: the caption band (top rows) must
        // contain non-background pixels, and a text-free render must differ.
        let with_title = render_plot_rgb(&d20_dist(), "d20").unwrap();
        let band = &with_title[..(PLOT_WIDTH * 45 * 3) as usize];
        assert!(
            band.iter().any(|&px| px != 0xff),
            "no ink in the caption band — text rendering is broken"
        );
        let without_title = render_plot_rgb(&d20_dist(), "").unwrap();
        assert_ne!(with_title, without_title);
    }

    #[test]
    fn axis_label_pixels_are_drawn() {
        // Y labels live LEFT of the axis; x labels in the bottom band.
        let rgb = render_plot_rgb(&d20_dist(), "d20").unwrap();
        let mut left_ink = false;
        for row in MARGIN_TOP..(PLOT_HEIGHT as i32 - MARGIN_BOTTOM) {
            let start = (row as u32 * PLOT_WIDTH * 3) as usize;
            if rgb[start..start + (MARGIN_LEFT as u32 * 3 - 6) as usize]
                .iter()
                .any(|&px| px != 0xff)
            {
                left_ink = true;
                break;
            }
        }
        assert!(left_ink, "no y-axis label ink");
        let bottom = &rgb[(PLOT_WIDTH * (PLOT_HEIGHT - 30) * 3) as usize..];
        assert!(bottom.iter().any(|&px| px != 0xff), "no x-axis label ink");
    }

    #[test]
    fn atom_faces_render_their_text_as_labels() {
        let dist = dist_of(&DieTree::Dl {
            faces: vec![
                crate::value::Value::Atom("hit".into()),
                crate::value::Value::Atom("miss".into()),
            ],
        })
        .unwrap();
        let rgb = render_plot_rgb(&dist, "dl(:hit,:miss)").unwrap();
        let bottom = &rgb[(PLOT_WIDTH * (PLOT_HEIGHT - 30) * 3) as usize..];
        assert!(bottom.iter().any(|&px| px != 0xff));
    }

    #[test]
    fn png_encoding_is_deterministic_with_signature() {
        let a = plot_png_base64(&d20_dist(), "d20").unwrap();
        let b = plot_png_base64(&d20_dist(), "d20").unwrap();
        assert_eq!(a, b);
        // Base64 of the 8-byte PNG signature.
        assert!(a.starts_with("iVBORw0KGgo"));
    }

    #[test]
    fn bars_are_drawn_in_the_plot_body() {
        let rgb = render_plot_rgb(&d20_dist(), "d20").unwrap();
        // Middle band: between caption and x labels — bar fill must appear.
        let mid_start = (PLOT_WIDTH * (PLOT_HEIGHT / 2) * 3) as usize;
        let mid = &rgb[mid_start..mid_start + (PLOT_WIDTH * 3) as usize];
        assert!(mid.iter().any(|&px| px != 0xff));
    }

    #[test]
    fn huge_supports_still_render() {
        // 3d20 = 58 faces > MAX_X_LABELS — strided labels, thin bars.
        let dist = dist_of(&DieTree::Leaf {
            count: 3,
            sides: 20,
        })
        .unwrap();
        let rgb = render_plot_rgb(&dist, "3d20").unwrap();
        assert_eq!(rgb.len(), (PLOT_WIDTH * PLOT_HEIGHT * 3) as usize);
    }
}
