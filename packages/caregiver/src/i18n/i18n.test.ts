import { describe, expect, it } from "vitest";
import en from "./en.json";
import fr from "./fr.json";
import { formatDateTime, t, tDynamic } from "./index.ts";

describe("catalogs", () => {
  it("have the same keys and no blank text", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    for (const catalog of [en, fr]) for (const value of Object.values(catalog)) expect(value.trim()).not.toBe("");
  });

  it("keep the same placeholders in both languages", () => {
    const names = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) expect(names(fr[key])).toEqual(names(en[key]));
  });

  it("put a no-break space before : ; ? ! in French and inside « »", () => {
    for (const [key, value] of Object.entries(fr)) {
      const text = value.replace(/\{\w+\}/g, "x");
      for (const match of text.matchAll(/[:;?!]/g)) {
        const before = text[(match.index ?? 0) - 1];
        expect(before === "\u00A0" || before === "\u202F", `${key}: ${value}`).toBe(true);
      }
      expect(/\u00AB(?!\u00A0)|(?<!\u00A0)\u00BB/.test(text), key).toBe(false);
    }
  });

  it("name no organisation and make no health claim", () => {
    const all = JSON.stringify([en, fr]).toLowerCase();
    for (const word of ["diagnos", "medical", "médical", "eligib", "admissib"]) expect(all).not.toContain(word);
  });
});

describe("t", () => {
  it("fills placeholders and leaves unknown ones visible", () => {
    expect(t("en", "value.mm", { n: 680 })).toBe("680 mm");
    expect(t("fr", "status.granted", { name: "Sam" })).toBe("Accès accordé à Sam.");
    expect(t("en", "status.granted")).toContain("{name}");
  });

  it("shows the key when a dynamic key is missing", () => {
    expect(tDynamic("fr", "field.nope")).toBe("field.nope");
  });

  it("formats times in Ontario time", () => {
    expect(formatDateTime("en", "2026-11-15T12:00:00.000Z")).toContain("2026");
    expect(formatDateTime("en", "not a date")).toBe("not a date");
  });
});
