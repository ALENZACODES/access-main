/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { DEFAULT_HANDOUT, HANDOUT_SIZES, buildHandout, parseHandoutOptions } from "./handout";
import { handoutCss, handoutToHtml } from "./handoutHtml";
import { importSummary, listToCode, parseListCode, planImport } from "./listTransfer";
import { PROV, lcg, place } from "./placeFixtures";

const TODAY = "2026-11-19";

describe("parseHandoutOptions over random input", () => {
  it("always returns a valid options object and never throws", () => {
    const next = lcg(5);
    const values = [undefined, null, 0, 1, "", "large", "huge", true, false, [], {}, { a: 1 }, "xlarge", NaN];
    for (let n = 0; n < 500; n++) {
      const raw: Record<string, unknown> = {};
      for (const k of ["size", "notes", "mapPoints", "sources", "questions", "other"]) if (next() < 0.7) raw[k] = values[Math.floor(next() * values.length)];
      const o = parseHandoutOptions(raw);
      expect(HANDOUT_SIZES).toContain(o.size);
      for (const k of ["notes", "mapPoints", "sources", "questions"] as const) expect(typeof o[k]).toBe("boolean");
    }
  });
  it("is idempotent", () => {
    const o = parseHandoutOptions({ size: "standard", notes: false });
    expect(parseHandoutOptions(o)).toEqual(o);
  });
  it("does not take a getter's value from a prototype chain or a proxy of defaults", () => {
    const evil = Object.create({ size: "xlarge", notes: false });
    expect(parseHandoutOptions(evil)).toEqual(DEFAULT_HANDOUT);
  });
});

describe("the page for awkward places", () => {
  it("copes with a very long name, address and note, with all options on", () => {
    const long = "x".repeat(5000);
    const p = place("a", { name: long, address: long, wheelchair_description: long });
    const html = handoutToHtml(buildHandout([p], "en", TODAY, { ...DEFAULT_HANDOUT, questions: true }));
    expect(new DOMParser().parseFromString(html, "text/html").querySelectorAll("article")).toHaveLength(1);
    expect(html.length).toBeLessThan(40_000);
  });
  it("copes with twelve places at the biggest size and still has twelve headings", () => {
    const ps = Array.from({ length: 12 }, (_, i) => place(`p${i}`));
    const d = new DOMParser().parseFromString(handoutToHtml(buildHandout(ps, "fr", TODAY, { ...DEFAULT_HANDOUT, size: "xlarge", questions: true })), "text/html");
    expect(d.querySelectorAll("h2")).toHaveLength(12);
    expect(d.title).toBe("Mes 12 lieux");
  });
  it("has the same page for the same input", () => {
    const ps = [place("a"), place("b")];
    expect(handoutToHtml(buildHandout(ps, "en", TODAY))).toBe(handoutToHtml(buildHandout(ps, "en", TODAY)));
  });
  it("shows a place with no source as UNKNOWN in the source line, never a made-up one", () => {
    const html = handoutToHtml(buildHandout([place("a", { provenance: null })], "en", TODAY));
    expect(html).toContain("<dt>Where it comes from</dt>\n<dd>UNKNOWN</dd>");
  });
  it("does not add the OpenStreetMap credit for a place from another source, and keeps the others", () => {
    const html = handoutToHtml(buildHandout([place("a", { provenance: { ...PROV, source_name: "City of Toronto open data" } })], "en", TODAY));
    expect(html).not.toContain("OpenStreetMap");
    expect(html).toContain("not a check of the place");
  });
  it("uses a size no smaller than 14 points anywhere in the stylesheet's base", () => {
    for (const s of HANDOUT_SIZES) {
      const m = handoutCss(s === "standard" ? 14 : s === "large" ? 18 : 24).match(/font-size: (\d+)pt/)!;
      expect(Number(m[1])).toBeGreaterThanOrEqual(14);
    }
  });
});

describe("list codes with awkward ids", () => {
  const WEIRD = ["__proto__", "constructor", "toString", "hasOwnProperty", "a.b-c_d", "é-1", "東京"];
  it("reads such ids as ordinary ids", () => {
    const code = listToCode(WEIRD.map((id) => ({ id, name: id })));
    expect(parseListCode(code).ids).toEqual(WEIRD);
  });
  it("plans them without confusing them with object keys", () => {
    const plan = planImport(WEIRD, [], new Set(["__proto__", "constructor"]));
    expect(plan.toAdd).toEqual(["__proto__", "constructor"]);
    expect(plan.notInPack).toEqual(["toString", "hasOwnProperty", "a.b-c_d", "é-1", "東京"]);
  });
  it("treats a listed weird id as already listed", () => {
    expect(planImport(["__proto__"], ["__proto__"], new Set(["__proto__"])).alreadyListed).toEqual(["__proto__"]);
  });
  it("describes the plan in both languages without throwing", () => {
    const plan = planImport(WEIRD, ["constructor"], new Set(WEIRD), 3);
    for (const locale of ["en", "fr"] as const) expect(importSummary(plan, parseListCode(listToCode(WEIRD.map((id) => ({ id, name: null })))), locale)).toMatch(/\S/);
  });
});
