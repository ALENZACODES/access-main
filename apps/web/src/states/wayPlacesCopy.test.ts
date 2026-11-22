import { describe, expect, it } from "vitest";
import { TAG_FILTERS } from "./packPlacesView";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";
import { WAY_WIDTHS, type WayResult, type WayRow } from "./wayPlaces";
import {
  wayAlongText, wayCannotSaveText, wayCaption, wayCaveat, wayColumns, wayHeading, wayIntro, wayLimitGroupLabel, wayMoreText, wayNameOf, wayNoMatchText, wayPointError, wayProblemText, wayReversedText, wayRowText, waySavedText, waySideText, wayStatus,
  wayLegsText, wayPickFirst, wayPickLabel, wayPickMore, wayPickNone, wayPickNothing, wayPickOption, wayPickSecond, wayPickedText, wayStretchText, wayStretchesText, waySummary, wayTagGroupLabel, wayTagLabel, wayToggle, wayViaAdd, wayViaFull, wayViaLegend, wayViaRemove, wayWaitText, wayWidthGroupLabel, wayWidthHelp, wayWidthLabel,
} from "./wayPlacesCopy";

type Ok = Extract<WayResult, { ok: true }>;
const LOCALES: readonly Locale[] = ["en", "fr"];
const row = (over: Partial<WayRow> = {}): WayRow => ({ position: 1, id: "a", name: "Alpha", tag: "yes", along: 1200, off: 80, side: "line", leg: 1, ...over });
const result = (over: Partial<Ok> = {}): Ok => ({ ok: true, length: 3219, legs: [3219], width: 250, rows: [row(), row({ id: "b", position: 2 })], outside: 38, unlocatedIds: [], ...over });

/** Every sentence the copy can make, in one language. */
function everything(l: Locale): string[] {
  const out = [
    wayHeading(l), wayToggle(true, l), wayToggle(false, l), wayIntro(l), wayCaveat(l), wayWidthGroupLabel(l), wayWidthHelp(l), wayTagGroupLabel(l), wayLimitGroupLabel(l),
    wayProblemText("same-point", 3, l), wayProblemText("too-long", 61_000, l), waySummary(result(), l), waySummary(result({ rows: [], unlocatedIds: ["x"] }), l), waySummary(result({ rows: [row()], outside: 0 }), l),
    wayRowText(row(), l), wayRowText(row({ side: "start", along: 0, name: null, tag: "unknown" }), l), wayRowText(row({ side: "end" }), l),
    wayStretchText({ from: 1200, to: 2600 }, 3000, l), wayStretchText({ from: 0, to: 3000 }, 3000, l), wayStatus(3, 9, "no", l), wayStatus(9, 9, "any", l),
    wayMoreText(4, l), wayCaption(10, 14, l), wayWaitText(l), wayNoMatchText(l), wayPointError(l), waySavedText("f.txt", l), wayCannotSaveText(l), wayReversedText(l),
    wayPickLabel(l), wayPickNone(l), wayPickMore(3, l), wayPickedText("first", "Alpha", l), wayPickedText("second", null, l), wayPickFirst(l), wayPickSecond(l), wayPickNothing(l),
    wayLegsText([1200, 2000], l), wayRowText(row({ leg: 2 }), l, 2), wayStretchesText([{ from: 300, to: 1500 }], 500, l), wayViaLegend(1, l), wayViaAdd(l), wayViaRemove(1, l), wayViaFull(3, l),
    ...WAY_WIDTHS.map((w) => wayWidthLabel(w, l)), ...TAG_FILTERS.map((f) => wayTagLabel(f, 2, l)), ...Object.values(wayColumns(l)), ...(["start", "line", "end"] as const).map((s) => waySideText(s, l)),
  ];
  return out;
}

describe("way places copy", () => {
  it("has French typography in every French sentence", () => {
    for (const s of everything("fr")) expect(lintFrench(s), s).toEqual([]);
  });

  it("never translates UNKNOWN, and never says inconnu", () => {
    for (const l of LOCALES)
      for (const s of everything(l)) {
        expect(s, s).not.toMatch(/inconnu|Inconnu|INCONNU|\bUnknown\b|\bunknown\b/);
      }
    expect(wayRowText(row({ name: null, tag: "unknown" }), "fr")).toContain("UNKNOWN");
    expect(wayTagLabel("unknown", 3, "fr")).toBe("UNKNOWN (3)");
    expect(wayNameOf(null)).toBe("UNKNOWN");
  });

  it("makes no claim the tool cannot back", () => {
    for (const l of LOCALES)
      for (const s of everything(l)) expect(s, s).not.toMatch(/verif|vérifi|guarantee|garanti|real-time|temps réel|certified|certifié|partnership|partenariat|recommend|recommand|route is|itinéraire est/i);
    expect(wayCaveat("en")).toMatch(/is not a route/);
    expect(wayCaveat("fr")).toMatch(/n’est pas un itinéraire/);
  });

  it("is different in the two languages, except for the words that are the same", () => {
    const en = everything("en");
    const fr = everything("fr");
    const same = en.filter((s, i) => s === fr[i]);
    expect(same).toEqual(["UNKNOWN (2)", "Position"]);
  });
});

describe("way places sentences", () => {
  it("sums up the line and the band", () => {
    expect(waySummary(result(), "en")).toBe("The line is 3.2\u00a0km long. 2 places are within 250\u00a0m of it, out of 40 with a map point.");
    expect(waySummary(result({ rows: [row()], outside: 0, unlocatedIds: ["x", "y"] }), "en")).toBe("The line is 3.2\u00a0km long. 1 place is within 250\u00a0m of it, out of 1 with a map point. 2 with no map point: UNKNOWN.");
    expect(waySummary(result({ rows: [], outside: 5 }), "en")).toBe("The line is 3.2\u00a0km long. No place is within 250\u00a0m of it, out of 5 places with a map point.");
    expect(waySummary(result(), "fr")).toBe("La ligne mesure 3,2\u00a0km. 2 lieux sont à 250\u00a0m d’elle ou moins, sur 40 avec un point de carte.");
  });

  it("says where each place is and what its tag is", () => {
    expect(wayRowText(row(), "en")).toBe("Alpha: 1.2\u00a0km along, 80\u00a0m off the line. Wheelchair tag: Yes.");
    expect(wayRowText(row({ side: "start", along: 0 }), "en")).toBe("Alpha: before the first point, 80\u00a0m off the line. Wheelchair tag: Yes.");
    expect(wayRowText(row({ side: "end" }), "fr")).toBe("Alpha\u00a0: après le deuxième point, à 80\u00a0m de la ligne. Indication fauteuil roulant\u00a0: Oui.");
    expect(wayAlongText(row({ along: 450 }), "fr")).toBe("à 450\u00a0m du départ");
  });

  it("names the longest empty stretch, and says it is only where the list has nothing", () => {
    expect(wayStretchText({ from: 1200, to: 2600 }, 3000, "en")).toBe(
      "The longest part of the line with no listed place near it is 1.4\u00a0km, from 1.2\u00a0km to 2.6\u00a0km along. This is where the list has nothing, not proof that nothing is there.",
    );
    expect(wayStretchText({ from: 0, to: 3000 }, 3000, "en")).toBe("No place on the list is near any part of the line.");
    expect(wayStretchText(undefined, 3000, "en")).toBe("");
  });

  it("explains why a line is refused", () => {
    expect(wayProblemText("too-long", 61_200, "en")).toBe("The path is 61\u00a0km long in all. Paths over 50\u00a0km are not measured: straight lines that long say little about a trip.");
    expect(wayProblemText("same-point", 4, "fr")).toMatch(/^Deux points qui se suivent sont au même endroit/);
  });

  it("labels the width and tag choices", () => {
    expect(WAY_WIDTHS.map((w) => wayWidthLabel(w, "en"))).toEqual(["Within 100\u00a0m of the line", "Within 250\u00a0m of the line", "Within 500\u00a0m of the line", "Within 1.0\u00a0km of the line"]);
    expect(wayTagLabel("any", 7, "en")).toBe("Any tag (7)");
    expect(wayTagLabel("limited", 1, "fr")).toBe("Limité (1)");
    expect(wayStatus(3, 9, "no", "en")).toBe("Showing 3 of 9 places with the tag No.");
    expect(wayMoreText(0, "en")).toBe("");
  });
});

describe("way places sentences for a path with points in between", () => {
  it("gives the length of each part", () => {
    expect(wayLegsText([1200, 2000], "en")).toBe("The path has 2 parts, 3.2\u00a0km in all: 1.2\u00a0km, then 2.0\u00a0km.");
    const fr = wayLegsText([1200, 2000, 450], "fr");
    expect(fr).toBe("Le trajet a 3 parties, 3,7\u00a0km en tout\u00a0: 1,2\u00a0km, puis 2,0\u00a0km, puis 450\u00a0m.");
    expect(lintFrench(fr)).toEqual([]);
    expect(waySummary(result({ legs: [1200, 2019], length: 3219 }), "en")).toMatch(/^The path has 2 parts, 3\.2\u00a0km in all: /);
  });

  it("names the part of each place only when there is more than one", () => {
    expect(wayRowText(row({ leg: 2 }), "en", 2)).toBe("Alpha: 1.2\u00a0km along (part 2), 80\u00a0m off the line. Wheelchair tag: Yes.");
    expect(wayRowText(row({ leg: 2 }), "fr", 3)).toContain("du départ (partie 2), à 80\u00a0m");
    expect(wayRowText(row({ leg: 1 }), "en", 1)).not.toContain("part");
  });

  it("lists every long empty part", () => {
    const s = wayStretchesText([{ from: 300, to: 1500 }, { from: 1700, to: 3000 }], 500, "en");
    expect(s).toBe("Parts with no listed place near them for 500\u00a0m or more: from 300\u00a0m to 1.5\u00a0km; from 1.7\u00a0km to 3.0\u00a0km.");
    const fr = wayStretchesText([{ from: 300, to: 1500 }, { from: 1700, to: 3000 }], 500, "fr");
    expect(fr).toContain("de 300\u00a0m à 1,5\u00a0km\u202f; de 1,7\u00a0km à 3,0\u00a0km.");
    expect(lintFrench(fr)).toEqual([]);
    expect(wayStretchesText([], 500, "en")).toBe("");
  });

  it("labels the points in between, and says remove for the control that takes one away", () => {
    expect([wayViaLegend(2, "en"), wayViaAdd("en"), wayViaRemove(2, "en"), wayViaFull(3, "en")]).toEqual([
      "Point in between 2",
      "Add a point in between",
      "Remove point in between 2",
      "A path can have up to 3 points in between.",
    ]);
    expect(wayViaRemove(1, "fr")).toBe("Retirer le point intermédiaire 1");
    for (const s of [wayViaLegend(1, "fr"), wayViaAdd("fr"), wayViaFull(3, "fr")]) expect(lintFrench(s), s).toEqual([]);
  });
});

describe("way places sentences for picking a place as a point", () => {
  it("names a place with its id, and UNKNOWN when it has no name", () => {
    expect(wayPickOption("Alpha", "a1")).toBe("Alpha (a1)");
    expect(wayPickOption(null, "z")).toBe("UNKNOWN (z)");
  });

  it("says which point was filled, and how many places the list leaves out", () => {
    expect(wayPickedText("second", "Alpha", "en")).toBe("The second point is now Alpha.");
    expect(wayPickedText("first", null, "fr")).toBe("Le premier point est maintenant UNKNOWN.");
    expect(wayPickMore(0, "en")).toBe("");
    expect(wayPickMore(5, "en")).toBe("5 more places are not in this list. Search the places above to narrow it.");
  });
});
