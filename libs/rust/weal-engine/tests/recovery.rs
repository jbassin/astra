//! Parse-error recovery: errors carry byte spans, the parser never panics,
//! and the CST stays lossless even for broken input.

use weal_engine::parse;

/// The slice's pinned recovery case: garbage after a valid expression →
/// an error with the garbage's span, not a panic.
#[test]
fn garbage_after_valid_expression() {
    let src = "1 + 2 ) )";
    let parsed = parse(src);
    assert!(!parsed.errors.is_empty());
    let err = &parsed.errors[0];
    assert!(
        err.message.contains("expected end of input"),
        "unexpected message: {}",
        err.message
    );
    assert_eq!(
        err.span,
        (6, 7),
        "span should point at the first stray token"
    );
    // Lossless even under error: nothing was dropped.
    assert_eq!(parsed.syntax().text().to_string(), src);
}

/// Placeholder outside call-argument position is a PARSE error (D32-2).
#[test]
fn placeholder_outside_call_argument() {
    let src = "_ + 1";
    let parsed = parse(src);
    assert!(!parsed.errors.is_empty());
    let err = &parsed.errors[0];
    assert!(
        err.message.contains("placeholder"),
        "unexpected message: {}",
        err.message
    );
    assert_eq!(err.span, (0, 1));
    // …while the same placeholder inside an argument is fine.
    assert!(parse("f(_ + 1)").errors.is_empty());
    // Nested argument positions still count (smallest ENCLOSING argument).
    assert!(parse("f((_))").errors.is_empty());
}

#[test]
fn invalid_string_escape_has_exact_span() {
    let src = r#""bad \q escape""#;
    let parsed = parse(src);
    assert!(!parsed.errors.is_empty());
    let err = &parsed.errors[0];
    assert!(
        err.message.contains("escape"),
        "unexpected message: {}",
        err.message
    );
    assert_eq!(err.span, (5, 7), "span should cover the `\\q`");
}

#[test]
fn label_word_charset_is_enforced() {
    // Uppercase violates D32-6's [a-z][a-z0-9_]* (kebab stays atom-only).
    let parsed = parse("2d8[Fire]");
    assert!(!parsed.errors.is_empty());
    assert!(parsed.errors[0].message.contains("label word"));
    // Ident-charset words are fine, including digits and underscores.
    assert!(parse("2d8[fire_2]").errors.is_empty());
}

/// A pile of malformed inputs: every one must produce at least one span-
/// carrying error, never panic, and keep the CST lossless.
#[test]
fn malformed_inputs_recover_with_spans() {
    let inputs = [
        "",
        "let x = ;",
        "let x = 1",
        "let = 1; x",
        "match x",
        "match x | 1 ->",
        "f(",
        "f(,)",
        "[1, 2",
        "[:",
        "{}",
        "{1, 2",
        "(1 + 2",
        "1 + ",
        "1 + let x = 2; x",
        "(* unterminated",
        "d6[",
        "d6[1]",
        "|a, b",
        "let x Num Num = 1; x",
        "? ? ?",
        "1 ? 2",
    ];
    for src in inputs {
        let parsed = parse(src);
        assert!(
            !parsed.errors.is_empty(),
            "{src:?} should produce a parse error"
        );
        for err in &parsed.errors {
            assert!(err.span.0 <= err.span.1, "ordered span for {src:?}");
            assert!(err.span.1 <= src.len(), "span within bounds for {src:?}");
        }
        assert_eq!(
            parsed.syntax().text().to_string(),
            src,
            "lossless CST for {src:?}"
        );
    }
}
