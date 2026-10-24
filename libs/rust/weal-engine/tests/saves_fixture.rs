//! The stored saves format is pinned by a recorded fixture.
//!
//! Saves are stored as `[name, source]` rows: R21 serializes a saved value to
//! weal SOURCE text, and the bot passes the rows back as `saves_json` on every
//! call. `fixtures/saves_v1.json` was recorded from the engine before weal-5c
//! (commit `b60777f5`) with the wasm API. It holds one save of every value kind
//! the serializer handles (literals, containers, die trees, an open pool,
//! closures with renamed and nested captures, a recursive function, builtin
//! values), the exact output of each `save(...)` that produced them, and the
//! exact output of programs run against those saves in both modes.
//!
//! The test replays all of it through [`weal_engine::evaluate`] and demands
//! byte-identical JSON, so it fails when the serializer prints a different
//! source, when a stored save loads or behaves differently, or when an error
//! inside a saved closure reports a different span. Never regenerate the
//! fixture to make this pass: a diff here means stored saves changed meaning.

use serde_json::Value as Json;

const FIXTURE: &str = include_str!("../fixtures/saves_v1.json");
const SEED: [u8; 32] = [0; 32];

fn fixture() -> Json {
    serde_json::from_str(FIXTURE).expect("fixture is JSON")
}

fn text<'a>(v: &'a Json, key: &str) -> &'a str {
    v[key]
        .as_str()
        .unwrap_or_else(|| panic!("fixture field `{key}`"))
}

#[test]
fn saving_prints_the_recorded_sources() {
    let f = fixture();
    let cases = f["producers"].as_array().expect("producers");
    assert!(cases.len() >= 20);
    for case in cases {
        let src = text(case, "source");
        let got = weal_engine::evaluate(src, "[]", &SEED, 0, "run");
        assert_eq!(got, text(case, "output"), "save output changed for `{src}`");
    }
}

/// Run `f` on a 32 MiB stack: `tri(300)` recurses to the fuel depth cap, which
/// overflows a default test thread in a debug build.
fn on_big_stack(f: impl FnOnce() + Send + 'static) {
    std::thread::Builder::new()
        .stack_size(32 * 1024 * 1024)
        .spawn(f)
        .expect("spawn test thread")
        .join()
        .expect("fixture replay panicked");
}

#[test]
fn stored_saves_load_and_behave_as_recorded() {
    on_big_stack(replay_cases);
}

fn replay_cases() {
    let f = fixture();
    let saves = serde_json::to_string(&f["saves"]).expect("saves serialize");
    let cases = f["cases"].as_array().expect("cases");
    assert!(cases.len() >= 70);
    for case in cases {
        let (src, mode) = (text(case, "source"), text(case, "mode"));
        let got = weal_engine::evaluate(src, &saves, &SEED, 0, mode);
        assert_eq!(got, text(case, "output"), "`{src}` ({mode}) changed");
    }
}
