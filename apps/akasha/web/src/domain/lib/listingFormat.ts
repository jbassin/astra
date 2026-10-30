// Text helpers for the home page and the listings (Sessions, folders, tags). Pure and
// client-safe. Dates format in UTC so the server and the client render the same string
// (README trap).

/**
 * A day as a UTC date: a session date as the chronicle and the transcript slugs write it
 * ("2026-2-17", unpadded) or an ISO timestamp. Null when it doesn't parse.
 */
export function parseDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(day);
  const date = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : new Date(day);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "2026-02-17": the padded UTC day, for comparing a session date with a page's date. */
export function isoDay(day: string): string | null {
  return parseDay(day)?.toISOString().slice(0, 10) ?? null;
}

/** "17 February 2026". Falls back to the input when it doesn't parse. */
export function dayInWords(day: string): string {
  const date = parseDay(day);
  if (!date) return day;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The first sentence of a synopsis: up to the first full stop, question or exclamation mark
 * that is followed by a space and a capital letter or a quote. A full stop after an initial
 * or a title ("P.O. Box", "Mr. Lisk", "Lt. Fenn") doesn't end the sentence.
 */
export function firstSentence(text: string): string {
  const m = /^.+?(?<!\b(?:[A-Z]|Mrs?|Ms|Dr|St|Lt|Capt|Inc|Co))[.!?](?=\s+["“‘(]?[A-Z])/su.exec(
    text.trim(),
  );
  return m ? m[0] : text.trim();
}

/** "1 page", "12 pages"; "transcripts" for the Sessions section. */
export function pagesLabel(n: number, transcripts = false): string {
  const [one, many] = transcripts ? ["transcript", "transcripts"] : ["page", "pages"];
  return `${n} ${n === 1 ? one : many}`;
}

/** "1 season", "6 seasons". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
