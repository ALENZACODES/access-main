import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import * as copy from "./elevatorCopy";
import { lintFrench } from "./typography";

const LOCALES = ["en", "fr"] as const;
const src = { sourceName: "TTC alerts", licence: "OGL-Toronto-1.0", retrievedOn: "2026-11-13", tier: 0 as const };

function allStrings(l: "en" | "fr"): string[] {
  const out: string[] = [
    copy.elevatorHeading(l), copy.elevatorLead(l), copy.droppedNote(1, l), copy.droppedNote(3, l), copy.stationName("", l),
    copy.stateText("out-of-service", l), copy.stateText("back-in-service", l), copy.noReadingNote(l), copy.stopIdsLine(["1", "2"], l),
    copy.languageNote("en", l === "en" ? "fr" : "en"), copy.languageNote("fr", l === "en" ? "fr" : "en"), copy.toolsLabel(true, l), copy.toolsLabel(false, l),
    copy.searchLabel(l), copy.searchHelp(l), copy.ageFilterLabel(l), copy.sortLabel(l), copy.allLabel(l), copy.sortName("station", l), copy.sortName("oldest", l),
    copy.sortName("newest", l), copy.saveTextLabel(l), copy.saveCsvLabel(l), copy.savedNote("a.csv", l), copy.saveFailedNote(l),
  ];
  for (const r of copy.readingLines({ elevator: "1", state: "out-of-service", cause: "maintenance", between: "A and B" }, l)) out.push(r.label);
  return out;
}

describe("every string is clean", () => {
  it("passes the copy linter in both languages", () => {
    for (const l of LOCALES) for (const s of allStrings(l)) expect(lintCopy(s, l), `${l}: ${s}`).toEqual([]);
  });
  it("passes the French linter", () => {
    for (const s of allStrings("fr")) expect(lintFrench(s), s).toEqual([]);
  });
  it("never uses a straight apostrophe in French", () => {
    for (const s of allStrings("fr")) expect(s.includes("'"), s).toBe(false);
  });
  it("has no word of verification, which the pack cannot give", () => {
    for (const l of LOCALES) for (const s of allStrings(l)) expect(s, s).not.toMatch(/verif|vérif|confirm|guarantee|garanti/i);
  });
  it("never says an elevator works", () => {
    for (const l of LOCALES) for (const s of allStrings(l)) expect(s, s).not.toMatch(/\b(is|est) (working|available|usable|disponible)\b|fonctionne/i);
  });
  it("makes no claim about what is stored or sent, which the statement register owns", () => {
    for (const l of LOCALES) for (const s of allStrings(l)) expect(s, s).not.toMatch(/\bsent\b|\bstored\b|envoy|stock/i);
  });
});

describe("the lead says what a person must know", () => {
  it("says the notices are copies, are not live and may be out of date", () => {
    const en = copy.elevatorLead("en");
    expect(en).toContain("copies");
    expect(en).toContain("not live");
    expect(en).toContain("out of date");
    expect(en).toContain("Check with the operator");
  });
  it("says the same in French", () => {
    const fr = copy.elevatorLead("fr");
    expect(fr).toContain("copies");
    expect(fr).toContain("pas en direct");
    expect(fr).toContain("périmées");
    expect(fr).toContain("exploitant");
  });
});

describe("readingLines", () => {
  it("lists only what was read, in a fixed order", () => {
    expect(copy.readingLines({ elevator: "ELV1", state: "out-of-service", cause: "maintenance", between: "A and B" }, "en")).toEqual([
      { label: "Elevator", value: "ELV1" },
      { label: "The notice says", value: "Out of service" },
      { label: "Reason given", value: "Maintenance" },
      { label: "Between", value: "A and B" },
    ]);
  });
  it("leaves out each part that is not stated", () => {
    expect(copy.readingLines({ elevator: null, state: null, cause: null, between: null }, "en")).toEqual([]);
    expect(copy.readingLines({ elevator: null, state: "out-of-service", cause: null, between: null }, "en")).toEqual([{ label: "The notice says", value: "Out of service" }]);
  });
  it("labels the lines in French", () => {
    expect(copy.readingLines({ elevator: "1", state: "back-in-service", cause: null, between: "A et B" }, "fr").map((l) => l.label)).toEqual(["Ascenseur", "L’avis indique", "Entre"]);
  });
  it("says a back-in-service state as the notice's word, not as fact", () => {
    expect(copy.stateText("back-in-service", "en")).toContain("as the notice says");
    expect(copy.stateText("back-in-service", "fr")).toContain("selon l’avis");
  });
});

describe("stationName", () => {
  it("gives the name, or says there is none", () => {
    expect(copy.stationName("Pape", "en")).toBe("Pape");
    expect(copy.stationName("", "en")).toBe("Station not named");
    expect(copy.stationName("", "fr")).toBe("Station non nommée");
  });
});

describe("droppedNote", () => {
  it("is empty for none, singular for one and plural for more", () => {
    expect(copy.droppedNote(0, "en")).toBe("");
    expect(copy.droppedNote(-2, "en")).toBe("");
    expect(copy.droppedNote(1, "en")).toBe("1 saved record could not be read and is not shown.");
    expect(copy.droppedNote(3, "en")).toBe("3 saved records could not be read and are not shown.");
    expect(copy.droppedNote(1, "fr")).toBe("1 enregistrement n’a pas pu être lu et n’est pas affiché.");
    expect(copy.droppedNote(3, "fr")).toBe("3 enregistrements n’ont pas pu être lus et ne sont pas affichés.");
  });
});

describe("noticeSourceLine", () => {
  it("gives the source, licence, date and tier, and says saved copy", () => {
    expect(copy.noticeSourceLine(src, "en")).toBe("Source: TTC alerts. Licence: OGL-Toronto-1.0. Retrieved 13 November 2026. Tier 0, saved copy.");
  });
  it("writes UNKNOWN for each part the pack does not give", () => {
    expect(copy.noticeSourceLine({ sourceName: null, licence: null, retrievedOn: null, tier: null }, "en")).toBe("Source: UNKNOWN. Licence: UNKNOWN. Retrieved UNKNOWN. Tier UNKNOWN, saved copy.");
  });
  it("is in French with the French colon spacing", () => {
    expect(copy.noticeSourceLine(src, "fr")).toContain("Source\u00a0: TTC alerts.");
    expect(copy.noticeSourceLine(src, "fr")).toContain("Consulté le 13 novembre 2026.");
    expect(copy.noticeSourceLine(src, "fr")).toContain("copie enregistrée");
  });
});

describe("stopIdsLine and languageNote", () => {
  it("is empty for no stop ids, and lists them otherwise", () => {
    expect(copy.stopIdsLine([], "en")).toBe("");
    expect(copy.stopIdsLine(["1", "22"], "en")).toBe("Stop ids in the notice: 1, 22.");
  });
  it("notes a notice only when its language differs from the page's", () => {
    expect(copy.languageNote(null, "en")).toBe("");
    expect(copy.languageNote("en", "en")).toBe("");
    expect(copy.languageNote("fr", "en")).toBe("The notice is in French.");
    expect(copy.languageNote("en", "fr")).toBe("L’avis est en anglais.");
  });
});
