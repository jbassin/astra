//! Dev helper: dump token streams and lowered ASTs for the golden inputs.
//! Run: `cargo run --example dump`

fn main() {
    let lex_inputs = [
        "d6",
        "4d6kh3",
        "d6kh3",
        "2d6e2r1",
        "1_000",
        "0.100_120",
        "1.0f",
        ":kebab-case",
        "(* a (* nested *) b *) 1",
    ];
    for src in lex_inputs {
        println!("=== LEX {src:?}");
        println!("{}", weal_engine::lexer::lex_debug(src));
    }

    let parse_inputs = [
        "[:]",
        "[1, 2, 4]",
        "[\"good\": 1, \"bad\": 3]",
        "{1, 2}",
        "match x | 1 -> match y | 2 -> a | _ -> b | _ -> c",
        "let first = let second = 2; second + 1; first - 2",
        "2d20kh1 + 7",
        "2d8[fire] + 1d6[slashing]",
        "f(_ + g(_))",
        "a < b < c",
        "match x | -1 -> y | _ -> z",
        "d20 + 7",
        "4d6kh3",
        "let smite(n) = sum(pool(n, d8)) + 5; smite(3)",
        "dl([:fine, :good, :great])",
        "2d6e2",
        "d20 + 3*2",
    ];
    for src in parse_inputs {
        println!("=== PARSE {src:?}");
        match weal_engine::parse_to_ast(src) {
            Ok(ast) => {
                println!("{ast:?}");
                println!("--- print: {}", weal_engine::print(&ast));
            }
            Err(errs) => println!("ERRORS: {errs:?}"),
        }
    }
}
