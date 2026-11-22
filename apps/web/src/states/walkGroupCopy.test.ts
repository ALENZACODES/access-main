import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";
import * as c from "./walkGroupCopy";
import { WALK_GROUP_FILTERS, WALK_GROUP_ORDERS } from "./walkGroupStats";
import { WALK_DISTANCES_M } from "./walkGroups";

const stats = (groups: number) => ({ groups, grouped: groups * 3, alone: 2, withoutPoint: 1, largest: 5, median: 3, percentGrouped: 60 });
const tags = { yes: 2, limited: 0, no: 1, designated: 1, unknown: 3 };

function lines(l: Locale): string[] {
  return [
    c.wgHeading(l), c.wgToggle(true, l), c.wgToggle(false, l), c.wgIntro(l), c.wgDistanceGroup(l), c.wgSummary(stats(0), l), c.wgSummary(stats(1), l), c.wgSummary(stats(4), l),
    c.wgAlone(0, l), c.wgAlone(1, l), c.wgAlone(3, l), c.wgLeftOut(0, 0, l), c.wgLeftOut(1, 0, l), c.wgLeftOut(4, 2, l), c.wgLeftOut(0, 1, l), c.wgNone(l), c.wgNoMatch(l), c.wgFilterGroup(l), c.wgOrderGroup(l),
    c.wgGroupTitle({ kind: "street", text: "Main Street", onStreet: 2 }, l), c.wgGroupTitle({ kind: "place", text: "Cafe", onStreet: 0 }, l), c.wgGroupTitle({ kind: "none", text: null, onStreet: 0 }, l),
    c.wgSizeLine(3, 40, 70, l), c.wgSizeLine(500, 1200, null, l), c.wgTagMix(tags, l), c.wgMoreLine(4, l), c.wgNoName(l), c.wgMoreGroups(1, l), c.wgMoreGroups(5, l), c.wgCaveat(l),
    c.wgLinksLine(["A"], 100, l), c.wgLinksLine(["A", "B", "C", "D", "E"], 200, l), c.wgApartLine("Cafe", 140, l), c.wgUnknownLine(1, l), c.wgUnknownLine(3, l), c.wgSweepHeading(l), c.wgSweepCaption(l), ...Object.values(c.wgSweepColumns(l)), c.wgNoneAt(200, l), c.wgNoneAtAll(l), c.wgSketchHeading(l), c.wgSketchShared(l), c.wgNextLine(400, 0, 0, l), c.wgNextLine(400, 1, 0, l), c.wgNextLine(400, 3, 2, l), c.wgNextLine(200, 0, 1, l), c.wgSaveText(l), c.wgSaveCsv(l), c.wgSavedLine("x.csv", l), c.wgCannotSave(l),
    ...WALK_DISTANCES_M.map((d) => c.wgDistanceLabel(d, l)), ...WALK_GROUP_FILTERS.map((f) => c.wgFilterLabel(f, l)), ...WALK_GROUP_ORDERS.map((o) => c.wgOrderLabel(o, l)),
  ].filter((x) => x !== "");
}

describe("places close together copy", () => {
  for (const l of ["en", "fr"] as const) {
    it(`passes the copy lint in ${l}`, () => {
      for (const line of lines(l)) expect(lintCopy(line, l), line).toEqual([]);
    });
  }
  it("has French typography in French", () => {
    for (const line of lines("fr")) expect(lintFrench(line), line).toEqual([]);
  });
  it("labels every distance, filter and order differently", () => {
    for (const l of ["en", "fr"] as const) {
      expect(new Set(WALK_DISTANCES_M.map((d) => c.wgDistanceLabel(d, l))).size).toBe(WALK_DISTANCES_M.length);
      expect(new Set(WALK_GROUP_FILTERS.map((f) => c.wgFilterLabel(f, l))).size).toBe(WALK_GROUP_FILTERS.length);
      expect(new Set(WALK_GROUP_ORDERS.map((o) => c.wgOrderLabel(o, l))).size).toBe(WALK_GROUP_ORDERS.length);
    }
  });
  it("says a group is not a route and makes no claim about a path", () => {
    expect(c.wgIntro("en")).toMatch(/not a route/);
    expect(c.wgIntro("fr")).toMatch(/pas un itinéraire/);
    expect(c.wgCaveat("en")).toMatch(/Not a route/);
  });
  it("never calls a group good, bad, safe or accessible", () => {
    for (const l of ["en", "fr"] as const) for (const line of lines(l)) expect(line.toLowerCase(), line).not.toMatch(/\b(best|worst|safe|safer|accessible route|step.free route)\b|sécuritaire|meilleur|pire/);
  });
  it("agrees in number", () => {
    expect(c.wgAlone(1, "en")).toBe("1 place has no other place that close.");
    expect(c.wgAlone(2, "en")).toBe("2 places have no other place that close.");
    expect(c.wgAlone(1, "fr")).toBe("1 lieu n’a aucun autre lieu aussi proche.");
    expect(c.wgAlone(2, "fr")).toBe("2 lieux n’ont aucun autre lieu aussi proche.");
    expect(c.wgSummary(stats(1), "en")).toContain("1 group holding");
    expect(c.wgSummary(stats(2), "en")).toContain("2 groups holding");
    expect(c.wgLeftOut(1, 0, "fr")).toBe("1 lieu n’a pas de point sur la carte et n’est pas regroupé.");
  });
  it("agrees in the plural in French", () => expect(c.wgLeftOut(2, 0, "fr")).toBe("2 lieux n’ont pas de point sur la carte et ne sont pas regroupés."));
  it("puts a non-breaking space before the French percent sign and unit", () => {
    expect(c.wgSummary(stats(2), "fr")).toContain("60 %");
    expect(c.wgDistanceLabel(100, "fr")).toBe("À moins de 100 m");
    expect(c.wgDistanceLabel(200, "en")).toBe("Within 200 m");
  });
  it("lists tags in a fixed order with UNKNOWN last", () => {
    expect(c.wgTagMix(tags, "en")).toBe("Tags: 2 yes, 1 designated, 1 no, 3 UNKNOWN");
    expect(c.wgTagMix({ yes: 0, limited: 0, no: 0, designated: 0, unknown: 2 }, "fr")).toBe("Balises : 2 UNKNOWN");
  });
  it("leaves the width out of the size line when it is not known", () => {
    expect(c.wgSizeLine(500, 1200, null, "en")).not.toContain("furthest");
    expect(c.wgSizeLine(3, 40, 70, "en")).toContain("furthest apart");
  });
  it("has file names in both languages", () => {
    expect(c.WG_CSV_NAME.en).not.toBe(c.WG_CSV_NAME.fr);
    expect(c.WG_TEXT_NAME.fr).toMatch(/\.txt$/);
    expect(c.WG_CSV_HEADER).toHaveLength(13);
  });
  it("says how many links there are, and names at most three", () => {
    expect(c.wgLinksLine(["A"], 100, "en")).toBe("Without this place the rest of the group would split into parts more than 100\u00a0m apart: A.");
    expect(c.wgLinksLine(["A", "B"], 100, "en")).toContain("one of these places");
    expect(c.wgLinksLine(["A", "B", "C", "D", "E"], 200, "en")).toContain("A, B, C and 2 more.");
    expect(c.wgLinksLine(["A", "B", "C", "D", "E"], 200, "fr")).toContain("A, B, C et 2 autres.");
  });
  it("says where a place stands apart, in metres", () => expect(c.wgApartLine("Cafe", 140, "en")).toBe("Cafe is the furthest from its nearest neighbour in the group, 140\u00a0m."));
  it("agrees in number for places with an UNKNOWN tag", () => {
    expect(c.wgUnknownLine(1, "en")).toBe("1 place here has no wheelchair tag (UNKNOWN).");
    expect(c.wgUnknownLine(2, "fr")).toBe("2 lieux n’ont pas de balise d’accès en fauteuil roulant (UNKNOWN).");
  });
  it("says at which distance groups start to form", () => {
    expect(c.wgNoneAt(400, "en")).toBe("Groups start to form at 400\u00a0m.");
    expect(c.wgNoneAt(100, "fr")).toBe("Des groupes commencent à se former à 100\u00a0m.");
  });
  it("has five different column names for the table of distances", () => {
    for (const l of ["en", "fr"] as const) expect(new Set(Object.values(c.wgSweepColumns(l))).size).toBe(5);
  });
  it("says what the next distance would change", () => {
    expect(c.wgNextLine(400, 0, 0, "en")).toBe("At 400\u00a0m the groups would only get larger or stay the same.");
    expect(c.wgNextLine(400, 1, 0, "en")).toBe("At 400\u00a0m: 1 group would join into larger ones.");
    expect(c.wgNextLine(400, 3, 2, "en")).toBe("At 400\u00a0m: 3 groups would join into larger ones; 2 new groups would form.");
    expect(c.wgNextLine(200, 0, 1, "fr")).toBe("À 200\u00a0m\u00a0: 1 nouveau groupe se formerait.");
  });
});
