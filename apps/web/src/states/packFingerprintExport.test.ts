import { describe, expect, it } from "vitest";
import { fingerprintPlaces } from "./packFingerprint";
import { printToCode } from "./packFingerprintCode";
import { comparePrints } from "./packFingerprintCompare";
import { comparisonToText, fingerprintToText } from "./packFingerprintExport";
import { lintCopy } from "./copyLint";
import { lintFrench } from "./typography";
import { place, varied } from "./placeFixtures";
import type { Locale } from "./stateCopy";

const LOCALES: readonly Locale[] = ["en", "fr"];
const named = [place("a1", { name: "Hidden Café", address: "77 Secret Lane", wheelchair_description: "Private ramp note" }), ...varied(51, 12)];
const print = fingerprintPlaces(named);
const code = printToCode(print);
const noName = (text: string) => {
  for (const w of ["Hidden", "Café", "Secret", "Private", "43.65", "-79.38"]) expect(text).not.toContain(w);
};

describe("fingerprintToText", () => {
  it("holds the code, the count and the date, with Windows line ends", () => {
    const text = fingerprintToText(code, 13, "en", "2026-11-21");
    expect(text).toContain("Made on 2026-11-21");
    expect(text).toContain("Places: 13");
    for (const line of code.split("\n")) expect(text).toContain(line);
    expect(text.split("\r\n").length).toBeGreaterThan(8);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(text.endsWith("\r\n")).toBe(true);
  });
  it("holds no place name, address, note or location", () => {
    for (const l of LOCALES) noName(fingerprintToText(code, 13, l, "2026-11-21"));
  });
  it("says what a match does not mean", () => {
    expect(fingerprintToText(code, 1, "en", "2026-11-21")).toContain("does not say they are correct or up to date");
    expect(fingerprintToText(code, 1, "fr", "2026-11-21")).toContain("ne dit pas qu’ils sont exacts ni à jour");
  });
  it("is in French when asked, with French spacing and the same code", () => {
    const text = fingerprintToText(code, 13, "fr", "2026-11-21");
    expect(text).toContain("Empreinte des lieux enregistrés sur cet appareil");
    expect(text).toContain("Produite le 2026-11-21");
    expect(text).toContain("Lieux\u00a0: 13");
    expect(text).toContain(code.split("\n")[0]!);
    for (const line of text.split("\r\n")) if (!line.startsWith("PACKFP") && !/^[0-9a-fk]=/.test(line)) expect(lintFrench(line), line).toEqual([]);
  });
  it("passes the copy rules on every non-code line", () => {
    for (const l of LOCALES) {
      for (const line of fingerprintToText(code, 13, l, "2026-11-21").split("\r\n")) if (line !== "" && !line.startsWith("PACKFP") && !/^[0-9a-fk]=/.test(line)) expect(lintCopy(line, l), line).toEqual([]);
    }
  });
});

describe("comparisonToText", () => {
  const other = [...named.slice(2), place("zz9", {})];
  const c = comparePrints(print, fingerprintPlaces(other));
  it("has the verdict, the counts and one row for each of the sixteen groups", () => {
    const text = comparisonToText(c, "en", "2026-11-21");
    expect(text).toContain("The two devices hold different saved places.");
    expect(text).toContain(`This device: ${c.here} places. The other device: ${c.there} places.`);
    const rows = text.split("\r\n").filter((l) => /^[0-9a-f] {2}\d+ {2}\d+ {2}(same|differs)$/.test(l));
    expect(rows).toHaveLength(16);
    expect(rows.filter((r) => r.endsWith("differs")).map((r) => r[0])).toEqual(c.differing);
  });
  it("lists the differing groups only when there are some", () => {
    expect(comparisonToText(c, "en", "2026-11-21")).toMatch(/groups differ: /);
    const same = comparePrints(print, print);
    expect(comparisonToText(same, "en", "2026-11-21")).not.toMatch(/groups differ/);
    expect(comparisonToText(same, "en", "2026-11-21")).toContain("hold the same saved places with the same details, as read");
  });
  it("holds no place name, address, note or location", () => {
    for (const l of LOCALES) noName(comparisonToText(c, l, "2026-11-21"));
  });
  it("is in French when asked", () => {
    const text = comparisonToText(c, "fr", "2026-11-21");
    expect(text).toContain("Comparaison des lieux enregistrés entre deux appareils");
    expect(text).toContain("groupe  cet appareil  autre appareil  résultat");
    expect(text.split("\r\n").filter((l) => /^[0-9a-f] {2}\d+ {2}\d+ {2}(identique|diffère)$/.test(l))).toHaveLength(16);
  });
  it("passes the copy rules line by line in both languages", () => {
    for (const l of LOCALES) {
      for (const line of comparisonToText(c, l, "2026-11-21").split("\r\n")) if (line !== "") expect(lintCopy(line, l), line).toEqual([]);
    }
  });
  it("ends with a line end and the limit sentence", () => {
    const text = comparisonToText(c, "en", "2026-11-21");
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.trimEnd().endsWith("does not say which device is right.")).toBe(true);
  });
});
