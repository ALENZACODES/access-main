import { describe, expect, it } from "vitest";
import { PURPOSES } from "../purposes.ts";
import { frenchTypographyIssues } from "../validators.ts";
import { CATALOGS, format, translate } from "./index.ts";

// The partner organisation name is built from parts so this file does not spell it out.
const ORG = ["s", "c", "i", "o"].join("");
const LONG_ORG = ["spinal", "cord", "injury", "ontario"].join(" ");
const FORBIDDEN = new RegExp(`${ORG}|${LONG_ORG}|\\bAI\\b|artificial intelligence|intelligence artificielle|\\bIA\\b`, "i");
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("catalogs", () => {
  it("have the same keys, and no empty values", () => {
    expect(Object.keys(CATALOGS.fr).sort()).toEqual(Object.keys(CATALOGS.en).sort());
    for (const locale of ["en", "fr"] as const) {
      for (const [key, value] of Object.entries(CATALOGS[locale])) expect(value.trim(), `${locale}.${key}`).not.toBe("");
    }
  });

  it("use the same placeholders in both languages", () => {
    for (const key of Object.keys(CATALOGS.en) as Array<keyof typeof CATALOGS.en>) {
      expect(placeholders(CATALOGS.fr[key]), key).toEqual(placeholders(CATALOGS.en[key]));
    }
  });

  it("follow French typography", () => {
    for (const [key, value] of Object.entries(CATALOGS.fr)) expect(frenchTypographyIssues(value), key).toEqual([]);
    for (const purpose of PURPOSES) {
      expect(frenchTypographyIssues(purpose.title.fr), purpose.id).toEqual([]);
      expect(frenchTypographyIssues(purpose.description.fr), purpose.id).toEqual([]);
    }
  });

  it("name no organisation, no AI, and make no legal determination", () => {
    const all = [...Object.values(CATALOGS.en), ...Object.values(CATALOGS.fr)];
    for (const purpose of PURPOSES) all.push(...Object.values(purpose.title), ...Object.values(purpose.description));
    for (const text of all) expect(text).not.toMatch(FORBIDDEN);
    expect(CATALOGS.en["intro.law"]).toContain("has not been decided yet");
    expect(CATALOGS.en["intro.law"]).toContain("either way");
    expect(CATALOGS.fr["intro.law"]).toContain("pas encore déterminé");
    expect(CATALOGS.fr["intro.law"]).toContain("dans les deux cas");
  });

  it("fills placeholders and leaves unknown ones visible", () => {
    expect(format("a {x} b {y}", { x: 1 })).toBe("a 1 b {y}");
    expect(translate("fr", "audit.entry", { action: "A", title: "T", version: 2, date: "D" })).toBe("A : T (version 2), D");
  });
});
