import { describe, expect, it } from "vitest";
import { compareNameAndAddress, readAddressLanguage } from "./addressLanguage";
import { readNameLanguage } from "./nameLanguage";
import { ENGLISH_NAME_WORDS, FRENCH_NAME_WORDS } from "./nameLexicon";
import { buildNameReport, filterNames, orderNames, sharesOf } from "./nameLanguageReport";
import { summariseNameKinds } from "./nameLanguageKinds";
import { lcg, place } from "./placeFixtures";

const FR = [...FRENCH_NAME_WORDS];
const EN = [...ENGLISH_NAME_WORDS];
const NEUTRAL = ["Tim", "Hortons", "Smith", "Zoé", "Toronto", "Ahmed", "Nguyen", "1234", "#5", "&"];
const TYPES = ["Street", "St", "Road", "Rd", "Rue", "Chemin", "Avenue", "Drive", "Lane", "Boulevard", ""];

function randomName(rand: () => number): string {
  const pools = [FR, EN, NEUTRAL];
  const n = 1 + Math.floor(rand() * 4);
  const words: string[] = [];
  for (let i = 0; i < n; i++) {
    const pool = pools[Math.floor(rand() * pools.length)]!;
    const w = pool[Math.floor(rand() * pool.length)]!;
    words.push(rand() < 0.3 ? w.charAt(0).toUpperCase() + w.slice(1) : w);
  }
  return words.join(rand() < 0.2 ? "-" : " ");
}

const randomAddress = (rand: () => number): string => `${1 + Math.floor(rand() * 900)} ${NEUTRAL[Math.floor(rand() * NEUTRAL.length)]} ${TYPES[Math.floor(rand() * TYPES.length)]}`.trim();

describe("the name reader over many generated names", () => {
  const rand = lcg(20261121);
  const names = Array.from({ length: 400 }, () => randomName(rand));
  it("never throws and always gives a known reading", () => {
    for (const n of names) expect(["french", "english", "both", "neither"]).toContain(readNameLanguage(n).reading);
  });
  it("gives the same reading twice", () => {
    for (const n of names) expect(readNameLanguage(n)).toEqual(readNameLanguage(n));
  });
  it("does not depend on the case of the name", () => {
    for (const n of names) {
      expect(readNameLanguage(n.toUpperCase()).reading, n).toBe(readNameLanguage(n.toLowerCase()).reading);
    }
  });
  it("does not depend on accents", () => {
    for (const n of names) expect(readNameLanguage(n.normalize("NFD").replace(/[\u0300-\u036f]/g, "")).reading, n).toBe(readNameLanguage(n).reading);
  });
  it("does not depend on whether a hyphen or a space joins the words", () => {
    for (const n of names) expect(readNameLanguage(n.replace(/-/g, " ")).reading, n).toBe(readNameLanguage(n.replace(/ /g, "-")).reading);
  });
  it("lists only words that are in the lexicon", () => {
    for (const n of names) {
      const r = readNameLanguage(n);
      for (const w of r.french) expect(FRENCH_NAME_WORDS.has(w) || w.endsWith("'"), w).toBe(true);
      for (const w of r.english) expect(ENGLISH_NAME_WORDS.has(w), w).toBe(true);
    }
  });
  it("agrees between the reading and the words listed", () => {
    for (const n of names) {
      const r = readNameLanguage(n);
      const expected = r.french.length > 0 && r.english.length > 0 ? "both" : r.french.length > 0 ? "french" : r.english.length > 0 ? "english" : "neither";
      expect(r.reading, n).toBe(expected);
    }
  });
  it("finds a French word added to any name", () => {
    for (const n of names.slice(0, 80)) expect(["french", "both"]).toContain(readNameLanguage(`${n} Bibliothèque`).reading);
  });
  it("finds an English word added to any name", () => {
    for (const n of names.slice(0, 80)) expect(["english", "both"]).toContain(readNameLanguage(`${n} Library`).reading);
  });
  it("never lists a word twice", () => {
    for (const n of names) {
      const r = readNameLanguage(`${n} ${n}`);
      expect(new Set(r.french).size).toBe(r.french.length);
      expect(new Set(r.english).size).toBe(r.english.length);
    }
  });
});

describe("the address reader over many generated addresses", () => {
  const rand = lcg(77);
  const addresses = Array.from({ length: 300 }, () => randomAddress(rand));
  it("never throws and always gives a known reading", () => {
    for (const a of addresses) expect(["french", "english", "both", "neither"]).toContain(readAddressLanguage(a).reading);
  });
  it("reads a French type as French and an English type as English", () => {
    // A street needs a name in front of its type: "1234 Road" has only the type, so it is read as neither.
    for (const a of addresses.filter((x) => x.split(" ").filter((w) => /^\p{L}/u.test(w)).length >= 2)) {
      const r = readAddressLanguage(a);
      if (/\b(Rue|Chemin)\b/.test(a)) expect(r.french.length, a).toBeGreaterThan(0);
      if (/\b(Street|Road|Drive|Lane|St|Rd)$/.test(a)) expect(r.english.length, a).toBeGreaterThan(0);
    }
  });
  it("reads avenue and boulevard as neither", () => {
    for (const a of addresses.filter((x) => /(Avenue|Boulevard)$/.test(x))) expect(readAddressLanguage(a).reading, a).toBe("neither");
  });
});

describe("the whole report over many generated places", () => {
  const rand = lcg(5);
  const kinds = ["library", "cafe", "park", "school", null];
  const places = Array.from({ length: 250 }, (_, i) => place(`p${i}`, { name: rand() < 0.1 ? null : randomName(rand), address: rand() < 0.1 ? null : randomAddress(rand), category: kinds[Math.floor(rand() * kinds.length)] }));
  const report = buildNameReport(places);
  it("has a row for each place and counts that add up", () => {
    expect(report.rows).toHaveLength(250);
    expect(Object.values(report.byReading).reduce((a, b) => a + b, 0)).toBe(250);
    expect(Object.values(report.byMatch).reduce((a, b) => a + b, 0)).toBe(250);
    expect(report.named).toBe(250 - report.byReading["no-name"]);
  });
  it("filters to disjoint readings that cover every named place", () => {
    const ids = (f: "french" | "english" | "both" | "neither") => filterNames(report.rows, f).map((r) => r.id);
    const all = [...ids("french"), ...ids("english"), ...ids("both"), ...ids("neither")];
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(report.named);
  });
  it("orders without losing or repeating a row", () => {
    for (const o of ["pack", "name", "reading"] as const) {
      const out = orderNames(report.rows, o);
      expect(out.map((r) => r.id).sort()).toEqual(report.rows.map((r) => r.id).sort());
    }
  });
  it("gives shares that add up to 100", () => expect(Object.values(sharesOf(report)).reduce((a, b) => a + b, 0)).toBe(100));
  it("gives a kind table whose total is the number of named places", () => expect(summariseNameKinds(report.rows).reduce((n, k) => n + k.total, 0)).toBe(report.named));
  it("compares only places that have both a name and an address", () => {
    for (const r of report.rows) {
      const missing = r.name === null || r.address === null;
      expect(r.match === "missing", r.id).toBe(missing);
      expect(r.match).toBe(compareNameAndAddress(r.language.reading, r.addressLanguage.reading));
    }
  });
});
