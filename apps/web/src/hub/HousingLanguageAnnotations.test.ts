import { describe, expect, it } from "vitest";
import { englishHousingPassage } from "./HousingLanguageAnnotations";

const privacy = "Optional. Fixed choices only: no name, contact details, address or free text. The date is kept as a calendar quarter. Saved on this device; nothing is sent.";

describe("housing language annotations", () => {
  for (const recorded of [0, 13, 18, 36]) {
    for (const total of [16, 27, 36]) {
      it(`recognizes the complete English evidence sentence ${recorded}/${total}`, () => {
        expect(englishHousingPassage(`${recorded} of ${total} fields in this record are recorded; the rest are Unknown.`))
          .toBe("record-completeness");
      });
    }
  }

  it("recognizes the English privacy sentence", () => {
    expect(englishHousingPassage(privacy)).toBe("local-report-privacy");
  });

  it("normalizes line breaks without changing text", () => {
    expect(englishHousingPassage("13 of 36 fields in this record are recorded;\n the rest are Unknown."))
      .toBe("record-completeness");
  });

  for (const text of [
    "13 champs sur 36 sont consignés dans cette fiche ; les autres sont inconnus.",
    "Unknown",
    "13 of 36 fields in this record are recorded",
    "Optional. Fixed choices only",
    "English",
    "13 of 36 fields in this record are recorded; the rest are Unknown. Additional assertion.",
    "Not recorded",
    "",
  ]) {
    it(`does not silently classify other copy: ${text.slice(0, 28)}`, () => {
      expect(englishHousingPassage(text)).toBeNull();
    });
  }
});
