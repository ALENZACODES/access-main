import { describe, expect, it } from "vitest";
import { TRANSFER_COPY, transferCopy } from "./transferChecklistCopy";

const keys = Object.keys(TRANSFER_COPY.en);
describe("transfer checklist bilingual copy", () => {
  it("has exactly matching translated keys", () => {
    expect(Object.keys(TRANSFER_COPY.fr)).toEqual(keys);
  });
  it("has nonempty values", () => {
    for (const language of ["en", "fr"] as const) {
      for (const value of Object.values(transferCopy(language))) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });
  it("retains UNKNOWN and INCONNU", () => {
    expect(TRANSFER_COPY.en.unknown).toBe("UNKNOWN");
    expect(TRANSFER_COPY.fr.unknown).toBe("INCONNU");
  });
  it("uses French apostrophes and punctuation spacing", () => {
    for (const value of Object.values(TRANSFER_COPY.fr)) {
      expect(value).not.toContain("'");
      expect(/(?<!\u00a0):/u.test(value)).toBe(false);
      expect(/(?<!\u202f)[;!?]/u.test(value)).toBe(false);
    }
  });
  it("avoids unsupported copy assertions", () => {
    const forbidden = /(?<![\p{L}\p{N}])(?:verif\p{L}*|vérif\p{L}*|guarantee|guaranteed|real-time|partnership)(?![\p{L}\p{N}])/iu;
    for (const language of ["en", "fr"] as const) {
      for (const value of Object.values(transferCopy(language))) {
        expect(forbidden.test(value)).toBe(false);
      }
    }
  });
});
