import { describe, expect, it } from "vitest";
import { DEFAULT_HANDOUT, HANDOUT_FILENAMES, HANDOUT_SIZES, SIZE_POINTS, buildHandout, handoutTitle, handoutToText, parseHandoutOptions } from "./handout";
import { PROV, bare, place, varied } from "./placeFixtures";
import { lintCopy } from "./copyLint";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const A = place("a", { wheelchair_description: "Side door at the back" });
const entry = (h: ReturnType<typeof buildHandout>, i = 0) => h.entries[i]!;
const line = (h: ReturnType<typeof buildHandout>, label: string, i = 0) => entry(h, i).lines.find((l) => l.label === label);

describe("sizes", () => {
  it("are three, in increasing point size, starting at 14", () => {
    expect([...HANDOUT_SIZES]).toEqual(["standard", "large", "xlarge"]);
    expect(HANDOUT_SIZES.map((s) => SIZE_POINTS[s])).toEqual([14, 18, 24]);
  });
  it("default to large with everything included", () => {
    expect(DEFAULT_HANDOUT).toEqual({ size: "large", notes: true, mapPoints: true, sources: true, questions: false });
  });
  it("have a file name in each language", () => {
    expect(HANDOUT_FILENAMES).toEqual({ en: "large-print-list.html", fr: "liste-en-gros-caracteres.html" });
  });
});

describe("parseHandoutOptions", () => {
  it("returns the defaults for anything that is not an object", () => {
    for (const bad of [null, undefined, 3, "large", [], true]) expect(parseHandoutOptions(bad)).toEqual(DEFAULT_HANDOUT);
  });
  it("accepts a full valid object", () => {
    expect(parseHandoutOptions({ size: "xlarge", notes: false, mapPoints: false, sources: false, questions: true })).toEqual({ size: "xlarge", notes: false, mapPoints: false, sources: false, questions: true });
  });
  it("falls back for each bad field on its own, keeping the good ones", () => {
    expect(parseHandoutOptions({ size: "huge", notes: false, mapPoints: "yes", sources: 1 })).toEqual({ size: "large", notes: false, mapPoints: true, sources: true, questions: false });
  });
  it("ignores extra fields and does not copy them", () => {
    expect(Object.keys(parseHandoutOptions({ size: "standard", extra: "x", __proto__: { size: "xlarge" } })).sort()).toEqual(["mapPoints", "notes", "questions", "size", "sources"]);
  });
  it("does not let an inherited value in", () => {
    expect(parseHandoutOptions(Object.create({ size: "xlarge" })).size).toBe("large");
  });
});

describe("handoutTitle", () => {
  it("counts the places, singular for one, in both languages", () => {
    expect([handoutTitle(1, "en"), handoutTitle(3, "en")]).toEqual(["My place", "My 3 places"]);
    expect([handoutTitle(1, "fr"), handoutTitle(3, "fr")]).toEqual(["Mon lieu", "Mes 3 lieux"]);
  });
});

describe("buildHandout", () => {
  const h = buildHandout([A, place("b", { name: "Beta Court", wheelchair: "no" })], "en", TODAY);
  it("keeps the list's order and gives each place its name as heading", () => {
    expect(h.entries.map((e) => e.heading)).toEqual(["Place a", "Beta Court"]);
    expect(h.entries.map((e) => e.id)).toEqual(["a", "b"]);
  });
  it("gives the tag, kind, address, map point and source lines, in that order", () => {
    expect(entry(h).lines.map((l) => l.label)).toEqual(["Wheelchair tag", "Kind", "Address", "Map point", "Where it comes from"]);
  });
  it("writes the values as the sheet does", () => {
    expect(line(h, "Wheelchair tag")!.value).toBe("Yes");
    expect(line(h, "Wheelchair tag", 1)!.value).toBe("No");
    expect(line(h, "Map point")!.value).toBe("43.65000, -79.38000");
    expect(line(h, "Where it comes from")!.value).toBe("OpenStreetMap, Geofabrik Ontario extract; ODbL 1.0; 10 November 2026 (Retrieved 9 days ago)");
  });
  it("includes the pack's note", () => {
    expect(entry(h).note).toBe("Side door at the back");
    expect(entry(h, 1).note).toBeNull();
  });
  it("has a title, an intro that says UNKNOWN means the pack does not say, and the date", () => {
    expect(h.title).toBe("My 2 places");
    expect(h.intro).toContain("UNKNOWN means the pack does not say.");
    expect(h.footer[0]).toBe("Made on 19 November 2026 from the offline pack on this device.");
    expect(h.madeOn).toBe(TODAY);
  });
  it("says it is not a check of the place and details may have changed", () => {
    expect(h.footer[1]).toBe("This is what the pack reports and not a check of the place. Details may have changed since they were retrieved.");
  });
  it("carries the OpenStreetMap credit exactly when a place comes from it", () => {
    expect(h.footer).toContain("© OpenStreetMap contributors");
    const other = buildHandout([place("c", { provenance: { ...PROV, source_name: "City open data" } })], "en", TODAY);
    expect(other.footer).not.toContain("© OpenStreetMap contributors");
  });
  it("counts places with details over a year old in the footer, and only then", () => {
    expect(h.footer.some((f) => /over a year/.test(f))).toBe(false);
    const old = place("o", { provenance: { ...PROV, retrieved_at: "2024-01-01" } });
    const hh = buildHandout([old, old, A], "en", TODAY);
    expect(hh.footer).toContain("2 of these places have details retrieved over a year ago.");
  });
  it("is the same size as chosen", () => {
    expect(buildHandout([A], "en", TODAY, { ...DEFAULT_HANDOUT, size: "xlarge" }).size).toBe("xlarge");
  });
  it("is an empty handout with a title for no places", () => {
    const e = buildHandout([], "en", TODAY);
    expect(e.entries).toEqual([]);
    expect(e.title).toBe("My 0 places");
  });
});

describe("options change the lines and nothing else", () => {
  it("map points off drops that line", () => {
    const h = buildHandout([A], "en", TODAY, { ...DEFAULT_HANDOUT, mapPoints: false });
    expect(entry(h).lines.map((l) => l.label)).toEqual(["Wheelchair tag", "Kind", "Address", "Where it comes from"]);
  });
  it("sources off drops the source line", () => {
    const h = buildHandout([A], "en", TODAY, { ...DEFAULT_HANDOUT, sources: false });
    expect(line(h, "Where it comes from")).toBeUndefined();
  });
  it("notes off drops the note", () => {
    expect(entry(buildHandout([A], "en", TODAY, { ...DEFAULT_HANDOUT, notes: false })).note).toBeNull();
  });
  it("all three off leaves tag, kind and address", () => {
    const h = buildHandout([A], "en", TODAY, { size: "standard", notes: false, mapPoints: false, sources: false, questions: false });
    expect(entry(h).lines.map((l) => l.label)).toEqual(["Wheelchair tag", "Kind", "Address"]);
  });
  it("the size does not change the content", () => {
    const strip = (s: (typeof HANDOUT_SIZES)[number]) => JSON.stringify({ ...buildHandout([A], "en", TODAY, { ...DEFAULT_HANDOUT, size: s }), size: 0 });
    expect(new Set(HANDOUT_SIZES.map(strip)).size).toBe(1);
  });
});

describe("what the pack does not give", () => {
  const h = buildHandout([bare("z")], "en", TODAY);
  it("is UNKNOWN on every line, marked not known", () => {
    for (const l of entry(h).lines) expect([l.value, l.known]).toEqual(["UNKNOWN", false]);
  });
  it("makes the heading say the name is UNKNOWN", () => {
    expect(entry(h).heading).toBe("Name UNKNOWN");
  });
  it("gives a partly known source as its parts, with UNKNOWN for the missing ones", () => {
    const h2 = buildHandout([place("a", { provenance: { ...PROV, tier: undefined } })], "en", TODAY);
    expect(line(h2, "Where it comes from")!.known).toBe(true);
    const noLicence = buildHandout([place("a", { provenance: null })], "en", TODAY);
    expect(line(noLicence, "Where it comes from")!.value).toBe("UNKNOWN");
  });
  it("never uses the French word for UNKNOWN", () => {
    expect(JSON.stringify(buildHandout([bare("z")], "fr", TODAY))).not.toMatch(/INCONN/i);
  });
});

describe("handoutToText", () => {
  const text = handoutToText(buildHandout([A, bare("z")], "en", TODAY));
  it("numbers the places and gives label then value", () => {
    expect(text).toContain("\n1. Place a\nWheelchair tag: Yes\n");
    expect(text).toContain("\n2. Name UNKNOWN\nWheelchair tag: UNKNOWN\n");
  });
  it("gives the note, and the footer last, ending in one LF", () => {
    expect(text).toContain("Note: Side door at the back\n");
    expect(text.endsWith("© OpenStreetMap contributors\n")).toBe(true);
    expect(text).not.toContain("\r");
  });
  it("spaces the colon in French", () => {
    const fr = handoutToText(buildHandout([A], "fr", TODAY));
    expect(fr).toContain("Indication pour fauteuil roulant\u00a0: Oui");
    expect(fr).toContain("Note\u00a0: Side door at the back");
  });
});

describe("copy", () => {
  it("passes the copy check and French typography for every generated line", () => {
    for (const locale of ["en", "fr"] as const) {
      const h = buildHandout(varied(3, 20), locale, TODAY);
      const all = [h.title, h.intro, ...h.footer, ...h.entries.flatMap((e) => e.lines.flatMap((l) => [l.label]))];
      for (const s of all) {
        expect(lintCopy(s, locale), s).toEqual([]);
        if (locale === "fr") expect(lintFrench(s), s).toEqual([]);
      }
    }
  });
  it("does not rank, rate or recommend", () => {
    for (const locale of ["en", "fr"] as const) {
      const h = buildHandout(varied(8, 10), locale, TODAY);
      expect([h.intro, ...h.footer].join(" ")).not.toMatch(/\b(best|better|safest|easiest|recommended|top pick)\b|meilleur|recommand|le plus sûr/i);
    }
  });
  it("does not change the places it is given", () => {
    const ps = varied(5, 12);
    const before = JSON.stringify(ps);
    buildHandout(ps, "fr", TODAY);
    expect(JSON.stringify(ps)).toBe(before);
  });
});

describe("questions to ask", () => {
  const on = { ...DEFAULT_HANDOUT, questions: true };
  it("are off by default and give no questions", () => {
    expect(buildHandout([A], "en", TODAY).entries[0]!.questions).toEqual([]);
  });
  it("are the visit plan's questions for the place, in its order, when on", () => {
    const qs = buildHandout([A], "en", TODAY, on).entries[0]!.questions;
    expect(qs.length).toBeGreaterThanOrEqual(2);
    expect(qs.at(-1)).toMatch(/reach someone there/);
    expect(new Set(qs).size).toBe(qs.length);
  });
  it("are asked of each place, so a place with gaps has more than a full one", () => {
    const h = buildHandout([place("full"), bare("z")], "en", TODAY, on);
    expect(h.entries[1]!.questions.length).toBeGreaterThan(h.entries[0]!.questions.length);
  });
  it("are questions, not claims: each ends with a question mark", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const q of buildHandout(varied(6, 15), locale, TODAY, on).entries.flatMap((e) => e.questions)) expect(q.trimEnd().endsWith("?"), q).toBe(true);
    }
  });
  it("leave the other lines as they were", () => {
    const off = buildHandout([A], "en", TODAY);
    const withQ = buildHandout([A], "en", TODAY, on);
    expect(withQ.entries[0]!.lines).toEqual(off.entries[0]!.lines);
  });
  it("go into the text with a blank answer line each", () => {
    const text = handoutToText(buildHandout([A], "en", TODAY, on));
    expect(text).toContain("Questions to ask:\n1) ");
    expect(text.match(/Answer: ________________/g)!.length).toBe(buildHandout([A], "en", TODAY, on).entries[0]!.questions.length);
  });
  it("go into the French text with the colons spaced", () => {
    const text = handoutToText(buildHandout([A], "fr", TODAY, on));
    expect(text).toContain("Questions à poser\u00a0:\n1) ");
    expect(text).toContain("Réponse\u00a0: ____");
  });
  it("pass French typography", () => {
    // Only the lines the App writes; a place name or note is the pack's own text and is not ours to correct.
    const ours = handoutToText(buildHandout(varied(2, 8), "fr", TODAY, on)).split("\n").filter((l) => /^(\d+\) |\s+Réponse|Questions à poser)/.test(l));
    expect(ours.length).toBeGreaterThan(8);
    for (const line of ours) expect(lintFrench(line), line).toEqual([]);
  });
});
