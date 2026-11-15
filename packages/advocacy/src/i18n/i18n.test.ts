import { describe, expect, it } from "vitest";
import { catalogs, t } from "./index.ts";

const en = catalogs.en;
const fr = catalogs.fr;
/** Organisation names and endorsement wording the App must never carry. Built from parts so this file holds no such name. */
const BANNED = ["sc" + "io", "access" + "now", "goo" + "gle", "endorse", "partner"];

describe("catalogs", () => {
  it("have the same keys and no empty strings", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    for (const value of [...Object.values(en), ...Object.values(fr)]) expect(value.trim()).not.toBe("");
  });

  it("use the same placeholders in both languages", () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as Array<keyof typeof en>) expect(names(fr[key])).toEqual(names(en[key]));
  });

  it("put U+00A0 before : ; ? ! in French", () => {
    for (const [key, value] of Object.entries(fr)) {
      for (const match of value.matchAll(/[:;?!]/g)) {
        const before = value[(match.index ?? 0) - 1];
        expect(before, `${key}: ${value}`).toBe("\u00a0");
      }
      expect(value, key).not.toMatch(/ [:;?!]/);
      expect(value, key).not.toMatch(/«(?!\u00a0)|(?<!\u00a0)»/);
    }
  });

  it("name no organisation, and make no claim of endorsement", () => {
    for (const value of [...Object.values(en), ...Object.values(fr)]) {
      for (const banned of BANNED) expect(value.toLowerCase()).not.toContain(banned);
    }
  });

  it("fills placeholders and leaves a missing one visible", () => {
    expect(t("en", "meta.threshold", { k: 5 })).toBe("Small-cell threshold: counts below 5 are suppressed.");
    expect(t("fr", "meta.threshold", { k: 5 })).toBe("Seuil des petites cellules\u00a0: les comptes inférieurs à 5 sont supprimés.");
    expect(t("en", "meta.asOf")).toBe("As of {date}");
  });
});
