import { describe, expect, it } from "vitest";
import { en, fr } from "../src/i18n";

const forbidden = [
  /\bAI\b/i,
  /\bA\.I\./i,
  /artificial intelligence/i,
  /machine learning/i,
  /\bmodel\b/i,
  /\bGPT\b/i,
  /\bClaude\b/i,
  /\bgenerated\b/i,
];

describe("public copy", () => {
  it("uses the required headings", () => {
    expect(en.heading).toBe("Unverified drafts");
    expect(fr.heading).toBe("Brouillons non vérifiés");
  });

  it("has the same keys in both languages", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it("contains none of the prohibited terms", () => {
    for (const dictionary of [en, fr]) {
      const copy = Object.values(dictionary).join("\n");
      for (const expression of forbidden) {
        expect(copy).not.toMatch(expression);
      }
    }
  });
});
