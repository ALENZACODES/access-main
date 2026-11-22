import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParse";
import { lintCopy } from "./copyLint";
import { NAME_READINGS } from "./nameLanguage";
import { NL_KINDS_CSV_NAME, nlKindColumn, nlKindColumnShort, nlKindTableHeading, nlKindsMore, nlSaveKinds } from "./nameLanguageCopy";
import { nlAddressReadingLabel, nlDiffersLine, nlFilterLabel, nlKindsLine, nlMatchLabel } from "./nameLanguageCopy";
import { namesToCsv, namesToText } from "./nameLanguageExport";
import { NAME_FILTERS, buildNameReport, filterNames, kindsFor } from "./nameLanguageReport";
import { ADDRESS_READINGS, NAME_ADDRESS_MATCHES } from "./addressLanguage";
import { place } from "./placeFixtures";
import { lintFrench } from "./typography";

const p = (id: string, name: string | null, address: string | null, category = "library") => place(id, { name, address, category });
const set = () => [
  p("a", "Bibliothèque municipale", "1 Main Street"),
  p("b", "Public Library", "2 Oak Road"),
  p("c", "Bibliothèque Centrale", "3 Rue Principale"),
  p("d", "Tim Hortons", "4 Elm Lane", "cafe"),
  p("e", "Tim Hortons", "5 Bloor Avenue", "cafe"),
  p("f", "Public Library", "6 Chemin du Lac"),
  p("g", "Library", null),
  p("h", null, "8 Maple Drive"),
];

describe("name and address compared in the report", () => {
  const r = buildNameReport(set());
  it("gives each row what its address points to and how that compares", () => {
    expect(r.rows.map((x) => [x.id, x.addressLanguage.reading, x.match])).toEqual([
      ["a", "english", "differs"],
      ["b", "english", "same"],
      ["c", "french", "same"],
      ["d", "english", "one-side"],
      ["e", "neither", "neither"],
      ["f", "french", "differs"],
      ["g", "no-address", "missing"],
      ["h", "english", "missing"],
    ]);
  });
  it("counts each kind of match, adding up to the number of places", () => {
    expect(r.byMatch).toEqual({ same: 2, differs: 2, "one-side": 1, neither: 1, missing: 2 });
    expect(Object.values(r.byMatch).reduce((a, b) => a + b, 0)).toBe(8);
  });
  it("filters to places whose name and address point to different languages", () => {
    expect(filterNames(r.rows, "differs").map((x) => x.id)).toEqual(["a", "f"]);
    expect(NAME_FILTERS).toContain("differs");
  });
  it("is zero for a list with no differences", () => expect(buildNameReport([p("a", "Public Library", "1 Main Street")]).byMatch.differs).toBe(0));
  it("leaves the name reading counts as they were", () => expect(r.byReading.french).toBe(2));
  it("names the kinds behind a reading", () => expect(kindsFor(r.rows, "english")).toEqual([{ kind: "library", count: 3 }]));
});

describe("name and address wording", () => {
  it("counts places with different languages, in the singular and the plural", () => {
    expect(nlDiffersLine(0, "en")).toBe("");
    expect(nlDiffersLine(1, "en")).toBe("1 place has a name and an address that point to different languages.");
    expect(nlDiffersLine(2, "en")).toBe("2 places have a name and an address that point to different languages.");
    expect(nlDiffersLine(1, "fr")).toBe("1 lieu a un nom et une adresse qui évoquent des langues différentes.");
    expect(nlDiffersLine(3, "fr")).toBe("3 lieux ont un nom et une adresse qui évoquent des langues différentes.");
  });
  it("lists the kinds that are most often behind a reading", () => {
    expect(nlKindsLine([], "en")).toBe("");
    expect(nlKindsLine([{ kind: "library", count: 3 }, { kind: "park", count: 2 }], "en")).toBe("Most often: library (3), park (2).");
    expect(nlKindsLine([{ kind: "library", count: 3 }], "fr")).toBe("Le plus souvent\u00a0: library (3).");
  });
  it("labels every address reading and every match differently", () => {
    for (const l of ["en", "fr"] as const) {
      expect(new Set(ADDRESS_READINGS.map((r) => nlAddressReadingLabel(r, l))).size).toBe(ADDRESS_READINGS.length);
      expect(new Set(NAME_ADDRESS_MATCHES.map((m) => nlMatchLabel(m, l))).size).toBe(NAME_ADDRESS_MATCHES.length);
    }
  });
  it("labels the filters differently, the new one included", () => {
    for (const l of ["en", "fr"] as const) expect(new Set(NAME_FILTERS.map((f) => nlFilterLabel(f, l))).size).toBe(NAME_FILTERS.length);
  });
  it("passes the lint in both languages", () => {
    for (const l of ["en", "fr"] as const) {
      const all = [
        nlDiffersLine(1, l), nlDiffersLine(4, l), nlKindsLine([{ kind: "library", count: 3 }], l), nlFilterLabel("differs", l),
        ...ADDRESS_READINGS.map((r) => nlAddressReadingLabel(r, l)), ...NAME_ADDRESS_MATCHES.map((m) => nlMatchLabel(m, l)),
      ];
      for (const s of all) {
        expect(lintCopy(s, l), s).toEqual([]);
        if (l === "fr") expect(lintFrench(s), s).toEqual([]);
      }
    }
  });
  it("does not say either one is the wrong language", () => {
    for (const m of NAME_ADDRESS_MATCHES) expect(nlMatchLabel(m, "en").toLowerCase()).not.toMatch(/wrong|mismatch|error|incorrect/);
  });
});

describe("name and address in the files", () => {
  it("writes what the address points to and how it compares", () => {
    const parsed = parseCsv(namesToCsv(buildNameReport(set()).rows));
    const rows = parsed.ok ? parsed.rows : [];
    expect(rows[0]!.slice(-2)).toEqual(["address_reads_as", "name_and_address"]);
    expect(rows.slice(1).map((r) => r.slice(-2).join("/"))).toEqual(["english/differs", "english/same", "french/same", "english/one-side", "neither/neither", "french/differs", "no-address/missing", "english/missing"]);
  });
  it("adds a line to the text only for a name and address that differ", () => {
    const t = namesToText(buildNameReport(set()).rows, "en");
    expect(t.match(/Name and address point to different languages/g)).toHaveLength(2);
  });
  it("is in French for French", () => expect(namesToText(buildNameReport(set()).rows, "fr")).toContain("Le nom et l’adresse évoquent des langues différentes"));
});

describe("kinds table wording", () => {
  it("passes the lint in both languages", () => {
    for (const l of ["en", "fr"] as const) {
      const all = [nlKindTableHeading(l), nlKindsMore(1, l), nlKindsMore(5, l), nlSaveKinds(l), nlKindColumn("kind", l), nlKindColumn("total", l), nlKindColumn("differs", l), ...NAME_READINGS.map((r) => nlKindColumnShort(r, l))];
      for (const s of all) {
        expect(lintCopy(s, l), s).toEqual([]);
        if (l === "fr") expect(lintFrench(s), s).toEqual([]);
      }
    }
  });
  it("labels each column differently", () => {
    for (const l of ["en", "fr"] as const) expect(new Set(NAME_READINGS.map((r) => nlKindColumnShort(r, l))).size).toBe(NAME_READINGS.length);
  });
  it("agrees in number and says nothing for none", () => {
    expect(nlKindsMore(0, "en")).toBe("");
    expect(nlKindsMore(1, "en")).toBe("1 more kind is in the saved file.");
    expect(nlKindsMore(2, "en")).toBe("2 more kinds are in the saved file.");
    expect(nlKindsMore(1, "fr")).toBe("1 autre genre figure dans le fichier enregistré.");
    expect(nlKindsMore(3, "fr")).toBe("3 autres genres figurent dans le fichier enregistré.");
  });
  it("has a CSV file name for each language", () => {
    expect(NL_KINDS_CSV_NAME.en).not.toBe(NL_KINDS_CSV_NAME.fr);
    expect(NL_KINDS_CSV_NAME.fr).toMatch(/\.csv$/);
  });
});

describe("the address line of a row", () => {
  it("gives the address as the pack gives it and what its street words point to", async () => {
    const { nlAddressLine } = await import("./nameLanguageCopy");
    expect(nlAddressLine("english", "1 Main Street", "en")).toBe("1 Main Street \u2014 Street words that point to English");
    expect(nlAddressLine("french", "3 Rue Principale", "fr")).toBe("3 Rue Principale \u2014 Mots de rue qui évoquent le français");
  });
  it("says there is no address when there is none", async () => {
    const { nlAddressLine } = await import("./nameLanguageCopy");
    expect(nlAddressLine("no-address", null, "en")).toBe("No address in the pack");
    expect(nlAddressLine("no-address", null, "fr")).toBe("Aucune adresse dans le pack");
  });
});
