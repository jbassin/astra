//! Lexer goldens (D32-1): exact token streams, trivia included.

use weal_engine::lexer::lex_debug;

#[track_caller]
fn check(src: &str, expected: &str) {
    assert_eq!(
        lex_debug(src),
        expected,
        "token stream mismatch for {src:?}"
    );
}

#[test]
fn die_bare() {
    check("d6", r#"DIE "d6""#);
}

#[test]
fn die_with_count_and_suffix() {
    check("4d6kh3", r#"DIE "4d6kh3""#);
}

#[test]
fn die_suffix_without_count() {
    // The fat token's priority over IDENT is what keeps `d6kh3` a die.
    check("d6kh3", r#"DIE "d6kh3""#);
}

#[test]
fn die_suffix_chain() {
    check("2d6e2r1", r#"DIE "2d6e2r1""#);
}

#[test]
fn num_with_underscores() {
    check("1_000", r#"NUM "1_000""#);
}

#[test]
fn dec_with_underscores() {
    check("0.100_120", r#"DEC "0.100_120""#);
}

#[test]
fn float_literal() {
    check("1.0f", r#"FLOAT "1.0f""#);
}

#[test]
fn kebab_atom() {
    check(":kebab-case", r#"ATOM ":kebab-case""#);
}

#[test]
fn nested_comment_is_one_trivia_token() {
    check(
        "(* a (* nested *) b *) 1",
        "COMMENT \"(* a (* nested *) b *)\"\nWHITESPACE \" \"\nNUM \"1\"",
    );
}

#[test]
fn die_does_not_eat_a_real_ident() {
    // No digit after `d` — plain identifier, not a die.
    check("dice", r#"IDENT "dice""#);
    check("d", r#"IDENT "d""#);
}

#[test]
fn keywords_and_prefixed_idents() {
    check("let", r#"LET_KW "let""#);
    check("lets", r#"IDENT "lets""#);
    check("match", r#"MATCH_KW "match""#);
    check("matches", r#"IDENT "matches""#);
}

#[test]
fn string_with_escapes() {
    check(r#""a\"b\\c\nd""#, r#"STR "\"a\\\"b\\\\c\\nd\"""#);
}

#[test]
fn empty_dict_lexes_as_three_tokens() {
    // `[:]` is a parser fork, not a lexer special case.
    check("[:]", "L_BRACKET \"[\"\nCOLON \":\"\nR_BRACKET \"]\"");
}

#[test]
fn unterminated_comment_is_an_error_token() {
    // The `(*` becomes an error token (span = the opener) and lexing resumes
    // after it — the parser reports the error with that span.
    check(
        "(* never closed",
        "ERROR_TOKEN \"(*\"\nWHITESPACE \" \"\nIDENT \"never\"\nWHITESPACE \" \"\nIDENT \"closed\"",
    );
}
