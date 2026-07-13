/**
 * `sluggify` — ported VERBATIM from foundryvtt/pf2e `src/util/misc.ts` @ tag
 * `pf2e-8.3.0` (Apache-2.0; https://github.com/foundryvtt/pf2e), the file fetched
 * per D29-5 specifically to source this port (it is not in the packs sparse clone).
 * Only the pure-string logic is ported — the source function's non-string sanity
 * check logs via `console.warn` and the `"bactrian"` branch throws a pf2e-specific
 * `ErrorPF2e`; both are reproduced with plain equivalents (`throw new Error(...)`)
 * since neither the Foundry client runtime nor `ErrorPF2e` exists in this
 * ingest-script context.
 *
 * D29-1: `slug = sluggify(name)` (the plain/default form, `camel: null`) is codex's
 * entity identity. The `"dromedary"`/`"bactrian"` camel-case variants are ported
 * alongside it for completeness (they're one recursive case in upstream's own
 * function) but nothing in the P1 ingest pipeline calls them — identity uses only
 * the default form.
 *
 * ⭐ Empirical vector gate finding (see `sluggify.vectors.json` and the codex-0029
 * gotchas memory): the real snapshot carries NO `system.slug` field anywhere (0 of
 * 28,636 docs, verified exhaustively) — ground truth for the fixture is each pack
 * file's own basename, which upstream's own build tooling names via this exact
 * function. An exhaustive check against all 28,636 real docs found the port
 * agrees with every single filename: 0 disagreements, 0% disagreement rate.
 */

const wordCharacter = String.raw`[\p{Alphabetic}\p{Mark}\p{Decimal_Number}\p{Join_Control}]`;
const nonWordCharacter = String.raw`[^\p{Alphabetic}\p{Mark}\p{Decimal_Number}\p{Join_Control}]`;
const nonWordBoundary = String.raw`(?=^|$|${wordCharacter})`;
const lowerCaseLetter = String.raw`\p{Lowercase_Letter}`;
const upperCaseLetter = String.raw`\p{Uppercase_Letter}`;

const nonWordCharacterRE = new RegExp(nonWordCharacter, "gu");
const lowerCaseThenUpperCaseRE = new RegExp(
  `(${lowerCaseLetter})(${upperCaseLetter}${nonWordBoundary})`,
  "gu",
);
const nonWordCharacterHyphenOrSpaceRE =
  /[^-\p{White_Space}\p{Alphabetic}\p{Mark}\p{Decimal_Number}\p{Join_Control}]/gu;
const upperOrWordBoundariedLowerRE = new RegExp(
  `${upperCaseLetter}|${nonWordCharacter}${lowerCaseLetter}`,
  "gu",
);

export type SlugCamel = "dromedary" | "bactrian" | null;

/**
 * The system's sluggification algorithm for labels and other terms (verbatim port).
 * @param text The text to sluggify
 * @param options.camel The sluggification style to use (default `null`, codex identity)
 */
export function sluggify(text: string, { camel = null }: { camel?: SlugCamel } = {}): string {
  if (typeof text !== "string") {
    throw new TypeError("sluggify: expected a string");
  }

  // A hyphen by its lonesome would be wiped: return it as-is
  if (text === "-") return text;

  switch (camel) {
    case null:
      return text
        .replace(lowerCaseThenUpperCaseRE, "$1-$2")
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(nonWordCharacterRE, " ")
        .trim()
        .replace(/[-\s]+/g, "-");
    case "bactrian": {
      const dromedary = sluggify(text, { camel: "dromedary" });
      return dromedary.charAt(0).toUpperCase() + dromedary.slice(1);
    }
    case "dromedary":
      return text
        .replace(nonWordCharacterHyphenOrSpaceRE, "")
        .replace(/[-_]+/g, " ")
        .replace(upperOrWordBoundariedLowerRE, (part: string, index: number) =>
          index === 0 ? part.toLowerCase() : part.toUpperCase(),
        )
        .replace(/\s+/g, "");
    default:
      throw new Error("sluggify: unrecognized camel option");
  }
}
