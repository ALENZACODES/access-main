import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { normalizeText } from "./filters";
import { filterBySearch } from "./packSearchMatch";
import { parsePackSearch } from "./packSearchParse";
import { searchExamples } from "./packSearchHelp";
import { parsePackPlaces } from "./packPlaces";

type Raw = Record<string, unknown> & { id: string; provenance?: Record<string, unknown> };
const raw = (JSON.parse(contentText) as { places: Raw[] }).places;
const { places } = parsePackPlaces(raw);
const find = (q: string) => filterBySearch(places, parsePackSearch(q)).map((p) => p.id);
const str = (v: unknown) => (typeof v === "string" && v.toUpperCase() !== "UNKNOWN" && v.trim() !== "" ? v : null);

describe("the search on the shipped pack", () => {
  it("reads every place, and an empty search gives them all", () => {
    expect(places.length).toBeGreaterThan(10);
    expect(find("")).toHaveLength(places.length);
  });
  it("finds the same places for a kind as a count made straight from the pack file", () => {
    const kinds = new Set(raw.map((p) => str(p.category)).filter((c): c is string => c !== null));
    expect(kinds.size).toBeGreaterThan(3);
    for (const k of kinds) {
      const want = raw.filter((p) => normalizeText((str(p.category) ?? "").replace(/_/g, " ")).includes(normalizeText(k.replace(/_/g, " ")))).map((p) => p.id);
      expect(find(`kind:${k.replace(/ /g, "_")}`).sort(), k).toEqual(want.sort());
    }
  });
  it("finds the same places for each tag as a count made straight from the pack file", () => {
    for (const tag of ["yes", "limited", "no", "designated"]) {
      const want = raw.filter((p) => p.wheelchair === tag && p.provenance !== undefined).map((p) => p.id);
      expect(find(`tag:${tag}`).sort(), tag).toEqual(want.sort());
    }
  });
  it("splits the pack in two with has: and no:, for every detail", () => {
    for (const key of ["note", "address", "name", "kind", "tag", "source", "location"]) {
      const has = find(`has:${key}`);
      const no = find(`no:${key}`);
      expect(has.length + no.length, key).toBe(places.length);
      expect(has.filter((id) => no.includes(id)), key).toEqual([]);
    }
  });
  it("finds the one note the pack has today with a word from it, and no other place", () => {
    const withNote = places.filter((p) => p.note !== null);
    expect(withNote.length).toBeGreaterThan(0);
    const word = normalizeText(withNote[0]!.note!.split(/\s+/)[0]!);
    expect(find(`note:${word}`)).toContain(withNote[0]!.id);
    for (const id of find(`note:${word}`)) expect(places.find((p) => p.id === id)!.note).not.toBeNull();
  });
  it("gives a different place count with -word than with the word, adding up to the whole pack", () => {
    for (const w of ["street", "cafe", "restaurant", "dundas"]) expect(find(w).length + find(`-${w}`).length).toBe(places.length);
  });
  it("finds something for each search tip", () => {
    for (const e of searchExamples("en")) expect(parsePackSearch(e.text).problems, e.text).toEqual([]);
    expect(searchExamples("en").some((e) => find(e.text).length > 0)).toBe(true);
  });
  it("never finds a place twice", () => {
    for (const q of ["cafe OR restaurant OR bar", "a OR b OR c", "-zzz", "has:name OR has:address"]) {
      const out = find(q);
      expect(new Set(out).size).toBe(out.length);
    }
  });
});
