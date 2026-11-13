import { describe, expect, it } from "vitest";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

function leaves(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}

const SAME_ON_PURPOSE = new Set([
  "appName",
  "language.english",
  "language.french",
  "language.provisional",
]);

describe("shell strings", () => {
  const english = leaves(en);
  const french = new Map(leaves(fr));

  it("has a French string for every English string, with the same placeholders", () => {
    for (const [key, value] of english) {
      const translated = french.get(key);
      expect(translated, key).toBeTypeOf("string");
      const placeholders = (input: string) => [...input.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
      expect(placeholders(translated ?? "")).toEqual(placeholders(value));
    }
    expect(french.size).toBe(english.length);
  });

  it("translates sentences instead of copying English, and keeps the product name", () => {
    expect(fr.appName).toBe("the App");
    expect(en.noEndorsement.toLowerCase()).toContain("has endorsed");
    expect(en.noEndorsement.toLowerCase()).toContain("no organisation");
    for (const [key, value] of english) {
      if (SAME_ON_PURPOSE.has(key) || value.length < 40) continue;
      expect(french.get(key), key).not.toBe(value);
    }
  });

  it("puts a narrow no-break space before a French colon", () => {
    for (const [key, value] of french) {
      expect(value, key).not.toMatch(/ :/);
      if (value.includes(":")) expect(value, key).toContain("\u202f:");
    }
  });

  it("does not claim a partnership, a clinical interval, or a verified place", () => {
    const blob = JSON.stringify({ en, fr }).toLowerCase();
    expect(blob).not.toContain("wheelchair-bound");
    expect(blob).not.toContain("official partner");
    expect(blob).not.toContain("you are eligible");
    expect(blob).not.toContain("vous êtes admissible à");
    expect(blob).not.toContain("clinically proven");
    expect(blob).not.toContain("guaranteed accessible");
    expect(blob).not.toContain("every 15");
    expect(blob).not.toContain("15 to 30");
  });
});
