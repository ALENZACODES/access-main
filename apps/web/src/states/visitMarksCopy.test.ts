import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { lintFrench } from "./typography";
import { VISIT_STATUSES } from "./visitMarks";
import * as copy from "./visitMarksCopy";

const LOCALES = ["en", "fr"] as const;
const summary = { counts: { "to-visit": 2, been: 1, "ruled-out": 1 }, unmarked: 3, elsewhere: 2 };
const mark = { id: "a", status: "been" as const, markedOn: "2026-11-01" };

function allStrings(l: "en" | "fr"): string[] {
  return [
    ...VISIT_STATUSES.map((s) => copy.statusName(s, l)), copy.noMarkName(l), copy.marksToolsLabel(true, l), copy.marksToolsLabel(false, l), copy.marksLead(l),
    copy.placeMarkLabel("Alpha Hall", l), copy.markDayLine(mark, l), copy.markDayLine({ ...mark, markedOn: null }, l), copy.marksSummaryLine(summary, l),
    copy.elsewhereLine(1, l), copy.elsewhereLine(2, l), copy.clearElsewhereLabel(l), copy.marksNotKept(l), copy.noListedPlaces(l), copy.marksSaveText(l),
    copy.marksSaveCsv(l), copy.marksSaved("f.csv", l), copy.marksSaveFailed(l), copy.markChanged("Alpha Hall", "been", l), copy.markChanged("Alpha Hall", null, l), copy.marksFull(l),
  ];
}

describe("every string is clean", () => {
  it("passes the copy linter in both languages", () => {
    for (const l of LOCALES) for (const s of allStrings(l)) expect(lintCopy(s, l), `${l}: ${s}`).toEqual([]);
  });
  it("passes the French linter", () => {
    for (const s of allStrings("fr")) expect(lintFrench(s), s).toEqual([]);
  });
  it("says nothing about the place being good, safe, accessible or recommended", () => {
    for (const l of LOCALES) for (const s of allStrings(l)) expect(s, s).not.toMatch(/\b(good|bad|safe|best|worst|recommend|accessible|verified|favou?rite)\b|recommand|meilleur|sûr|accessible|vérifi/i);
  });
  it("makes no claim about sending or what is stored", () => {
    for (const l of LOCALES) for (const s of allStrings(l)) expect(s, s).not.toMatch(/\bsent\b|\buploaded\b|envoy|télévers/i);
  });
});

describe("statusName", () => {
  it("names each status in both languages, all different", () => {
    for (const l of LOCALES) expect(new Set(VISIT_STATUSES.map((s) => copy.statusName(s, l))).size).toBe(3);
    expect(VISIT_STATUSES.map((s) => copy.statusName(s, "en"))).toEqual(["To visit", "Been there", "Ruled out"]);
    expect(VISIT_STATUSES.map((s) => copy.statusName(s, "fr"))).toEqual(["À visiter", "Déjà allé", "Écarté"]);
  });
});

describe("the lead", () => {
  it("says the marks are the person's own notes and change nothing about the place", () => {
    expect(copy.marksLead("en")).toContain("your own notes");
    expect(copy.marksLead("en")).toContain("do not change what the pack says");
    expect(copy.marksLead("fr")).toContain("vos propres notes");
  });
});

describe("markDayLine", () => {
  it("is empty with no mark and says when the day is not saved", () => {
    expect(copy.markDayLine(null, "en")).toBe("");
    expect(copy.markDayLine({ ...mark, markedOn: null }, "en")).toBe("Marked on a day that is not saved.");
  });
  it("gives the day in the page's language", () => {
    expect(copy.markDayLine(mark, "en")).toBe("Marked 1 November 2026.");
    expect(copy.markDayLine(mark, "fr")).toBe("Marquée le 1er novembre 2026.");
  });
});

describe("marksSummaryLine", () => {
  it("gives every count", () => {
    expect(copy.marksSummaryLine(summary, "en")).toBe("2 to visit, 1 been there, 1 ruled out, 3 with no mark.");
    expect(copy.marksSummaryLine(summary, "fr")).toBe("2 à visiter, 1 déjà allé, 1 écarté, 3 sans marque.");
  });
  it("pluralises écarté", () => {
    expect(copy.marksSummaryLine({ ...summary, counts: { ...summary.counts, "ruled-out": 2 } }, "fr")).toContain("2 écartés");
    expect(copy.marksSummaryLine({ ...summary, counts: { ...summary.counts, "ruled-out": 0 } }, "fr")).toContain("0 écarté,");
  });
});

describe("elsewhereLine", () => {
  it("is empty for none and has the right number and verb", () => {
    expect(copy.elsewhereLine(0, "en")).toBe("");
    expect(copy.elsewhereLine(-1, "en")).toBe("");
    expect(copy.elsewhereLine(1, "en")).toBe("1 mark is on places that are not on the list now.");
    expect(copy.elsewhereLine(3, "en")).toBe("3 marks are on places that are not on the list now.");
    expect(copy.elsewhereLine(1, "fr")).toBe("1 marque est sur un lieu qui n’est plus dans la liste.");
    expect(copy.elsewhereLine(3, "fr")).toBe("3 marques sont sur des lieux qui ne sont plus dans la liste.");
  });
});

describe("markChanged", () => {
  it("says the new mark or that it was removed", () => {
    expect(copy.markChanged("Alpha Hall", "to-visit", "en")).toBe("Alpha Hall: To visit.");
    expect(copy.markChanged("Alpha Hall", null, "en")).toBe("Mark removed for Alpha Hall.");
    expect(copy.markChanged("Alpha Hall", "been", "fr")).toBe("Alpha Hall\u00a0: Déjà allé.");
    expect(copy.markChanged("Alpha Hall", null, "fr")).toBe("Marque retirée pour Alpha Hall.");
  });
});

describe("other strings", () => {
  it("has a label for opening and closing the tools", () => {
    expect(copy.marksToolsLabel(false, "en")).toContain("Mark places");
    expect(copy.marksToolsLabel(true, "en")).toBe("Hide marks");
  });
  it("names the place in the group label", () => {
    expect(copy.placeMarkLabel("Alpha Hall", "en")).toBe("Mark for Alpha Hall");
    expect(copy.placeMarkLabel("Alpha Hall", "fr")).toBe("Marque pour Alpha Hall");
  });
  it("says when marks will not be kept and when there is nothing to mark", () => {
    expect(copy.marksNotKept("en")).toContain("could not be saved on this device");
    expect(copy.noListedPlaces("en")).toContain("nothing to mark");
  });
});
