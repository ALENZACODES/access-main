import { describe, expect, it } from "vitest";
import { housingEnglishSentence, normalizeHousingSentence } from "./HousingLanguageAnnotations";

const completeness = (known: number, total: number) =>
  `${known} of ${total} fields in this record are recorded; the rest are Unknown.`;
const privacy = "Optional. Fixed choices only: no name, contact details, address or free text. The date is kept as a calendar quarter. Saved on this device; nothing is sent.";

describe("housing embedded language policy", () => {
  for (const [known, total] of [[0, 16], [13, 36], [18, 27], [36, 36]] as const) {
    it(`recognizes the English count ${known}/${total}`, () => {
      expect(housingEnglishSentence(completeness(known, total))).toBe("completeness");
    });
  }

  it("recognizes the complete privacy disclosure", () => {
    expect(housingEnglishSentence(privacy)).toBe("privacy");
  });

  it("normalizes whitespace without translating content", () => {
    expect(normalizeHousingSentence("  A\n  short   sentence  ")).toBe("A short sentence");
    expect(housingEnglishSentence(` \n${completeness(13, 36)}  `)).toBe("completeness");
  });

  for (const input of [
    "13 champs sur 36 sont consignés dans cette fiche ; les autres sont inconnus.",
    "Facultatif. Choix fixes seulement : aucun nom.",
    "13 of 36 fields in this record are recorded",
    "Optional information",
    "13 of 36 fields in this record are recorded; the rest are Unknown. Extra claim.",
    "Some accessible rooms are available",
    "",
  ]) {
    it(`does not annotate an unrecognized sentence ${JSON.stringify(input)}`, () => {
      expect(housingEnglishSentence(input)).toBeNull();
    });
  }
});
