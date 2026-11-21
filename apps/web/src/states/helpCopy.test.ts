import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import * as copy from "./helpCopy";
import { help } from "./helpFixtures";
import { rowFor } from "./helpView";
import { lintFrench } from "./typography";

const LOCALES = ["en", "fr"] as const;

function allStrings(l: "en" | "fr"): string[] {
  const row = rowFor(help({ contact: "1-866-531-2600" }), l);
  const other = l === "en" ? "fr" : "en";
  return [
    copy.helpHeading(l), copy.helpLead(l), copy.helpDropped(1, l), copy.helpDropped(4, l), copy.noNumberNote(l), copy.noHowNote(l),
    copy.otherLanguageNote(other, l), copy.saidLine(row, l), copy.kindLine(row, l), copy.helpToolsLabel(true, l), copy.helpToolsLabel(false, l),
    copy.helpSearchLabel(l), copy.helpSearchHelp(l), copy.helpSortLabel(l), copy.helpSortName("pack", l), copy.helpSortName("name", l),
    copy.helpSaveText(l), copy.helpSaveCsv(l), copy.helpSaved("a.csv", l), copy.helpSaveFailed(l), copy.nameOrId(rowFor(help({ name: { en: null, fr: null } }), l), l),
  ];
}

describe("every string is clean", () => {
  it("passes the copy linter in both languages", () => {
    for (const l of LOCALES) for (const s of allStrings(l)) expect(lintCopy(s, l), `${l}: ${s}`).toEqual([]);
  });
  it("passes the French linter, and has no straight apostrophe", () => {
    for (const s of allStrings("fr")) {
      expect(lintFrench(s), s).toEqual([]);
      expect(s.includes("'"), s).toBe(false);
    }
  });
  it("has no word of verification, availability or response, which a saved copy cannot give", () => {
    for (const l of LOCALES) for (const s of allStrings(l)) expect(s, s).not.toMatch(/verif|vérif|confirm|guarantee|garanti|24\/7|answer|répond|open now|ouvert/i);
  });
  it("makes no claim about what is stored or sent, which the statement register owns", () => {
    for (const l of LOCALES) for (const s of allStrings(l)) expect(s, s).not.toMatch(/\bsent\b|\bstored\b|envoy|stock/i);
  });
  it("gives no advice of its own", () => {
    for (const l of LOCALES) for (const s of allStrings(l)) expect(s, s).not.toMatch(/\byou should\b|\bplease call\b|\bcall now\b|devriez|appelez maintenant/i);
  });
});

describe("the lead", () => {
  it("says these are copies, that a number may have changed and to check with the source", () => {
    const en = copy.helpLead("en");
    expect(en).toContain("copies");
    expect(en).toContain("may have changed");
    expect(en).toContain("Check a number with its source");
  });
  it("says the same in French", () => {
    const fr = copy.helpLead("fr");
    expect(fr).toContain("copies");
    expect(fr).toContain("peut avoir changé");
    expect(fr).toContain("source");
  });
});

describe("saidLine and kindLine", () => {
  it("says the number aloud in the page's language", () => {
    expect(copy.saidLine(rowFor(help({ contact: "911" }), "en"), "en")).toBe("Said aloud: nine one one.");
    expect(copy.saidLine(rowFor(help({ contact: "911" }), "fr"), "fr")).toBe("À dire à voix haute\u00a0: neuf un un.");
  });
  it("says nothing when there is no number", () => {
    const r = rowFor(help({ contact: null }), "en");
    expect(copy.saidLine(r, "en")).toBe("");
    expect(copy.kindLine(r, "en")).toBe("");
  });
  it("names the kind of number", () => {
    expect(copy.kindLine(rowFor(help({ contact: "211" }), "en"), "en")).toBe("A three-digit number.");
    expect(copy.kindLine(rowFor(help({ contact: "1-800-268-9017" }), "en"), "en")).toBe("A toll-free number.");
  });
});

describe("nameOrId", () => {
  it("gives the name, or says the entry has none with its id", () => {
    expect(copy.nameOrId(rowFor(help(), "en"), "en")).toBe("Health811");
    expect(copy.nameOrId(rowFor(help({ id: "q1", name: { en: null, fr: null } }), "en"), "en")).toBe("Unnamed entry q1");
    expect(copy.nameOrId(rowFor(help({ id: "q1", name: { en: null, fr: null } }), "fr"), "fr")).toBe("Entrée sans nom q1");
  });
});

describe("otherLanguageNote", () => {
  it("is empty when the language matches and says which language is shown otherwise", () => {
    expect(copy.otherLanguageNote("en", "en")).toBe("");
    expect(copy.otherLanguageNote("fr", "en")).toBe("Shown in French; no English is saved.");
    expect(copy.otherLanguageNote("en", "fr")).toBe("Affiché en anglais\u202f; aucun français n’est enregistré.");
  });
});

describe("helpDropped", () => {
  it("is empty for none, singular for one and plural for more", () => {
    expect(copy.helpDropped(0, "en")).toBe("");
    expect(copy.helpDropped(1, "en")).toBe("1 saved record could not be read and is not shown.");
    expect(copy.helpDropped(2, "en")).toBe("2 saved records could not be read and are not shown.");
    expect(copy.helpDropped(2, "fr")).toBe("2 enregistrements n’ont pas pu être lus et ne sont pas affichés.");
  });
});

describe("helpSourceLine and pageLine", () => {
  const i = help({ sourceName: "Official page", licence: null, retrievedOn: "2026-11-13", tier: "E" });
  it("gives source, licence, date and tier, and says saved copy", () => {
    expect(copy.helpSourceLine(i, "en")).toBe("Source: Official page. Licence: UNKNOWN. Retrieved 13 November 2026. Tier E, saved copy.");
  });
  it("writes UNKNOWN for each part the pack does not give", () => {
    expect(copy.helpSourceLine({ sourceName: null, licence: null, retrievedOn: null, tier: null }, "en")).toBe("Source: UNKNOWN. Licence: UNKNOWN. Retrieved UNKNOWN. Tier UNKNOWN, saved copy.");
  });
  it("is in French with the French colon spacing", () => {
    expect(copy.helpSourceLine(i, "fr")).toContain("Source\u00a0: Official page.");
    expect(copy.helpSourceLine(i, "fr")).toContain("copie enregistrée");
  });
  it("shows the page address as text, and nothing when there is none", () => {
    expect(copy.pageLine(help({ url: "https://988.ca/" }), "en")).toBe("Page: https://988.ca/");
    expect(copy.pageLine(help({ url: null }), "en")).toBe("");
    expect(copy.pageLine(help({ url: "https://988.ca/" }), "fr")).toBe("Page\u00a0: https://988.ca/");
  });
});
