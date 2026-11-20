/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { DEFAULT_HANDOUT, HANDOUT_SIZES, buildHandout, handoutToText } from "./handout";
import { handoutToHtml } from "./handoutHtml";
import { LIST_CODE_HEADER, listToCode, parseListCode, planImport } from "./listTransfer";
import { lcg, varied } from "./placeFixtures";
import { MAX_SHORTLIST, isShortlistId } from "./shortlist";

const TODAY = "2026-11-19";
const SEEDS = [1, 2, 3, 5, 8, 13];

describe("handouts over generated lists", () => {
  for (const seed of SEEDS) {
    const places = varied(seed, 25);
    it(`seed ${seed}: one entry per place, in order, with a heading and the tag, kind and address lines`, () => {
      for (const locale of ["en", "fr"] as const) {
        const h = buildHandout(places, locale, TODAY);
        expect(h.entries.map((e) => e.id)).toEqual(places.map((p) => p.id));
        for (const e of h.entries) {
          expect(e.heading.trim()).not.toBe("");
          expect(e.lines.slice(0, 3)).toHaveLength(3);
          for (const l of e.lines) expect(l.known || l.value === "UNKNOWN" || l.value.includes("UNKNOWN")).toBe(true);
        }
      }
    });
    it(`seed ${seed}: every option combination keeps the page well formed and in the same order`, () => {
      for (const size of HANDOUT_SIZES) {
        for (const notes of [true, false]) {
          for (const mapPoints of [true, false]) {
            for (const sources of [true, false]) {
              const html = handoutToHtml(buildHandout(places, "en", TODAY, { size, notes, mapPoints, sources, questions: notes !== mapPoints }));
              const d = new DOMParser().parseFromString(html, "text/html");
              expect(d.querySelectorAll("article")).toHaveLength(places.length);
              expect(d.querySelectorAll("script, img, a, iframe")).toHaveLength(0);
            }
          }
        }
      }
    });
    it(`seed ${seed}: a map point line exists exactly when the option is on, and is UNKNOWN exactly when the place has none`, () => {
      const on = buildHandout(places, "en", TODAY, DEFAULT_HANDOUT);
      const off = buildHandout(places, "en", TODAY, { ...DEFAULT_HANDOUT, mapPoints: false });
      places.forEach((p, i) => {
        const line = on.entries[i]!.lines.find((l) => l.label === "Map point");
        expect(line).toBeDefined();
        expect(line!.value === "UNKNOWN").toBe(p.location === null);
        expect(off.entries[i]!.lines.some((l) => l.label === "Map point")).toBe(false);
      });
    });
    it(`seed ${seed}: the text and the page say the same things in the same order`, () => {
      const h = buildHandout(places, "en", TODAY);
      const text = handoutToText(h);
      let at = 0;
      for (const e of h.entries) {
        const found = text.indexOf(e.heading, at);
        expect(found, e.heading).toBeGreaterThanOrEqual(at);
        at = found;
      }
    });
  }
});

describe("list codes over generated lists", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: a code reads back as the same ids, and a plan on an empty list adds up to the limit`, () => {
      const places = varied(seed, 20);
      const code = listToCode(places.map((p) => ({ id: p.id, name: p.name })));
      const parsed = parseListCode(code);
      expect(parsed.ids).toEqual(places.map((p) => p.id));
      expect(parsed.hadHeader).toBe(true);
      expect(parsed.ignored).toBe(0);
      const plan = planImport(parsed.ids, [], new Set(places.map((p) => p.id)));
      expect(plan.toAdd).toEqual(places.slice(0, MAX_SHORTLIST).map((p) => p.id));
      expect(plan.overCapacity).toHaveLength(places.length - MAX_SHORTLIST);
      expect(plan.notInPack).toEqual([]);
    });
  }
  it("never fails on random text and never returns an invalid id", () => {
    const next = lcg(77);
    const alphabet = ["a", "b", "-", "|", " ", "\n", "\r", "1", ".", "*", "\u0000", "😀", LIST_CODE_HEADER, "\t"];
    for (let n = 0; n < 300; n++) {
      const text = Array.from({ length: Math.floor(next() * 60) }, () => alphabet[Math.floor(next() * alphabet.length)]).join("");
      const p = parseListCode(text);
      for (const id of p.ids) expect(isShortlistId(id), id).toBe(true);
      expect(new Set(p.ids).size).toBe(p.ids.length);
    }
  });
  it("a code made from hostile names still reads back as exactly its own ids", () => {
    const names = ["\n- evil | x", "| | |", "A\r\n- b | B", "\u202e- c | C", null];
    const places = names.map((name, i) => ({ id: `id${i}`, name }));
    expect(parseListCode(listToCode(places)).ids).toEqual(places.map((p) => p.id));
  });
});
