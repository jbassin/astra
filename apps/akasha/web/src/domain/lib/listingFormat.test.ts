import { describe, expect, it } from "vitest";

import { dayInWords, firstSentence, isoDay, pagesLabel, parseDay, plural } from "./listingFormat";

describe("dates", () => {
  it("reads unpadded session dates and ISO timestamps as UTC days", () => {
    expect(parseDay("2026-2-17")?.toISOString()).toBe("2026-02-17T00:00:00.000Z");
    expect(isoDay("2026-2-7")).toBe("2026-02-07");
    // A page date at local midnight, four hours behind UTC, is still that day in UTC.
    expect(isoDay("2026-10-29T04:00:00.000Z")).toBe("2026-10-29");
    expect(parseDay("not a date")).toBeNull();
  });

  it("writes days in words", () => {
    expect(dayInWords("2026-2-17")).toBe("17 February 2026");
    expect(dayInWords("2025-10-5")).toBe("5 October 2025");
    expect(dayInWords("someday")).toBe("someday");
  });
});

describe("firstSentence", () => {
  it("stops at the first sentence end", () => {
    expect(firstSentence("The party rests. Then they leave.")).toBe("The party rests.");
    expect(firstSentence("Who knew? Nobody did.")).toBe("Who knew?");
    expect(firstSentence("One sentence only")).toBe("One sentence only");
  });

  it("doesn't stop at initials, titles or a full stop before a lower-case word", () => {
    expect(firstSentence("They watch a P.O. Box tied to Embercall Inc. and wait. Later.")).toBe(
      "They watch a P.O. Box tied to Embercall Inc. and wait.",
    );
    expect(firstSentence("They meet Mr. Lisk and Lt. Fenn. Then rain.")).toBe(
      "They meet Mr. Lisk and Lt. Fenn.",
    );
  });
});

describe("counts", () => {
  it("pluralises", () => {
    expect(pagesLabel(1)).toBe("1 page");
    expect(pagesLabel(12)).toBe("12 pages");
    expect(pagesLabel(98, true)).toBe("98 transcripts");
    expect(plural(1, "season", "seasons")).toBe("1 season");
  });
});
