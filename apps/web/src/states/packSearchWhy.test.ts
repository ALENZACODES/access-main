import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { searchPlaces } from "./packSearchFixtures";
import { searchWhyHeading, searchWhyIntro, searchWhyLine, searchWhyNoSingle, searchWhyTakeOut } from "./packSearchHelp";
import { filterBySearch } from "./packSearchMatch";
import { parsePackSearch } from "./packSearchParse";
import { whyNoPlaces } from "./packSearchWhy";
import { lintFrench } from "./typography";

const places = searchPlaces();
/** What the person typed is shown as typed, so it is masked before the copy and typography checks. */
const masked = (s: string) => s.replace(/«\u202f.*?\u202f»/g, "«\u202fx\u202f»");
const why = (q: string) => whyNoPlaces(places, parsePackSearch(q));

describe("whyNoPlaces", () => {
  it("has nothing to say for a search that finds places", () => {
    for (const q of ["cafe", "cafe main", "tag:yes has:note", ""]) expect(why(q), q).toBeNull();
  });
  it("has nothing to say for a search of one part, even if it finds nothing", () => {
    expect(why("zzzz")).toBeNull();
    expect(why("cafe OR zzzz")).toBeNull();
  });
  it("counts each part on its own and with it taken out", () => {
    const w = why("tag:no kind:cafe")!;
    expect(w.counts.map((c) => [c.typed, c.alone, c.without, c.withoutText])).toEqual([
      ["tag:no", 1, 2, "kind:cafe"],
      ["kind:cafe", 2, 1, "tag:no"],
    ]);
  });
  it("names the part whose removal finds the most places", () => {
    expect(why("tag:no kind:cafe")!.best!.typed).toBe("tag:no");
    expect(why("tag:no kind:zzzz")!.best!.typed).toBe("kind:zzzz");
  });
  it("takes the first part on a tie", () => {
    const w = why("kind:cafe kind:bar")!;
    expect(w.counts.map((c) => c.without)).toEqual([1, 2]);
    expect(why("note:ramp tag:no")!.counts.map((c) => c.without)).toEqual([1, 1]);
    expect(why("note:ramp tag:no")!.best!.typed).toBe("note:ramp");
  });
  it("has no best part when taking out any one still leaves nothing", () => {
    const w = why("kind:zzzz tag:qq name:yyyy")!;
    expect(w.counts.length).toBe(2);
    const three = why("kind:zzzz note:xxxx name:yyyy")!;
    expect(three.counts.map((c) => c.without)).toEqual([0, 0, 0]);
    expect(three.best).toBeNull();
  });
  it("counts an OR clause as one part, typed with its OR", () => {
    const w = why("kind:cafe OR kind:bar tag:no")!;
    expect(w.counts.map((c) => c.typed)).toEqual(["kind:cafe OR kind:bar", "tag:no"]);
    expect(w.counts[0]!.alone).toBe(3);
  });
  it("gives text that finds exactly the places counted", () => {
    for (const q of ["tag:no kind:cafe", "kind:zzzz main", 'main "dundas street" tag:yes']) {
      for (const c of why(q)?.counts ?? []) expect(filterBySearch(places, parsePackSearch(c.withoutText)).length, `${q} / ${c.typed}`).toBe(c.without);
    }
  });
  it("counts a part alone the same as searching for just that part", () => {
    const w = why("tag:no kind:cafe")!;
    for (const c of w.counts) expect(filterBySearch(places, parsePackSearch(c.typed)).length).toBe(c.alone);
  });
  it("does not change the places", () => {
    const before = JSON.stringify(places);
    why("tag:no kind:cafe");
    expect(JSON.stringify(places)).toBe(before);
  });
  it("works for every pair of parts out of a pool: a part removed never finds fewer than the whole search", () => {
    const pool = ["cafe", "bar", "tag:no", "tag:yes", "note:ramp", "-main", "no:address", "kind:zzzz", "has:note", "street:king"];
    for (const a of pool) for (const b of pool) {
      const w = whyNoPlaces(places, parsePackSearch(`${a} ${b}`));
      if (w === null) continue;
      for (const c of w.counts) expect(c.without).toBeGreaterThanOrEqual(0);
      expect(w.counts).toHaveLength(2);
    }
  });
});

describe("the wording", () => {
  it("counts with the right singular and plural", () => {
    expect(searchWhyLine("tag:no", 1, 2, "en")).toBe("“tag:no” finds 1 place on its own. Without it, the search finds 2 places.");
    expect(searchWhyLine("kind:x", 0, 1, "en")).toBe("“kind:x” finds 0 places on its own. Without it, the search finds 1 place.");
    expect(searchWhyLine("tag:no", 1, 2, "fr")).toBe("«\u202ftag:no\u202f» trouve 1 lieu à lui seul. Sans lui, la recherche trouve 2 lieux.");
  });
  it("puts what was typed in quotation marks of the language", () => {
    expect(searchWhyTakeOut("tag:no", "en")).toBe("Take out “tag:no”");
    expect(searchWhyTakeOut("tag:no", "fr")).toBe("Retirer «\u202ftag:no\u202f»");
  });
  it("passes the copy rules and French typography, never says INCONNU, and says no part is called wrong", () => {
    for (const l of ["en", "fr"] as const) {
      for (const s of [searchWhyHeading(l), searchWhyIntro(l), searchWhyLine("kind:x", 2, 3, l), searchWhyTakeOut("x", l), searchWhyNoSingle(l)]) {
        expect(lintCopy(masked(s), l), s).toEqual([]);
        expect(s).not.toMatch(/inconnu/i);
        if (l === "fr") expect(lintFrench(masked(s)), s).toEqual([]);
      }
    }
    expect(searchWhyIntro("en")).toContain("does not say which part is wrong");
  });
});
