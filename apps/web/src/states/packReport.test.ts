import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { lintCopy } from "./copyLint";
import { ISSUES_CSV_HEADER, REPORT_FILENAMES, buildPackReport, duplicateLines, duplicatesHeadline, issuesToCsv, outlierLines, outliersHeadline, packReportToText, reportHeadline, sampleLine } from "./packReport";
import { MAX_OUTLIERS_LISTED } from "./packOutliers";
import { MAX_PAIRS_LISTED } from "./packDuplicates";
import { groupIssues } from "./packIssueText";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const place = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Place ${id}`, wheelchair: "yes", lat: 43.65 + Number(id.charCodeAt(0)) * 0.01, lon: -79.38, provenance: OSM, ...over });
const shipped = (JSON.parse(contentText) as { places: unknown[] }).places;
const lines = (text: string) => text.split("\n");

describe("buildPackReport levels", () => {
  it("is empty for no places, for a pack that is not an array and for null", () => {
    for (const input of [[], null, undefined, "places", { length: 3 }, 7]) {
      const r = buildPackReport(input, TODAY);
      expect(r.level, String(input)).toBe("empty");
      expect(r.records).toEqual([]);
      expect(r.audit.checked).toBe(0);
    }
  });
  it("is clean when nothing is wrong", () => {
    const r = buildPackReport([place("a"), place("b")], TODAY);
    expect(r.level).toBe("clean");
    expect(r.groups).toEqual([]);
    expect(r.records).toHaveLength(2);
  });
  it("is gaps for a warning only", () => {
    const r = buildPackReport([place("a"), place("b", { name: "" })], TODAY);
    expect(r.level).toBe("gaps");
    expect(r.audit).toMatchObject({ errors: 0, warnings: 1 });
  });
  it("is gaps when the only finding is a possible duplicate", () => {
    const r = buildPackReport([place("a", { name: "Hall", lat: 43.65 }), place("b", { name: "hall", lat: 43.6501 })], TODAY);
    expect(r.audit.clean).toBe(true);
    expect(r.duplicates.total).toBe(1);
    expect(r.level).toBe("gaps");
  });
  it("is problems when any error exists, even beside gaps", () => {
    const r = buildPackReport([place("a", { name: "" }), place("b", { provenance: { ...OSM, licence: "All-rights-reserved" } })], TODAY);
    expect(r.level).toBe("problems");
    expect(r.audit.errors).toBeGreaterThan(0);
  });
  it("counts entries it cannot read as problems and leaves them out of the records", () => {
    const r = buildPackReport([place("a"), 5, null, place("a")], TODAY);
    expect(r.level).toBe("problems");
    expect(r.records.map((x) => x.place.id)).toEqual(["a"]);
    expect(r.dropped).toBe(3);
  });
  it("keeps the place's tag UNKNOWN when it has no usable source", () => {
    const r = buildPackReport([place("a", { provenance: null })], TODAY);
    expect(r.records[0]!.place.tag).toBe("unknown");
    expect(r.coverage.reported).toBe(0);
    expect(r.coverage.unknownNoSource).toBe(1);
  });
  it("does not change the input", () => {
    const input = [place("a"), place("b", { name: "" })];
    const copy = JSON.stringify(input);
    buildPackReport(input, TODAY);
    expect(JSON.stringify(input)).toBe(copy);
  });
});

describe("headlines and detail lines", () => {
  it("states the result in each level without claiming the data is right", () => {
    expect(reportHeadline(buildPackReport([], TODAY), "en")).toBe("There are no saved places to report on.");
    expect(reportHeadline(buildPackReport([place("a")], TODAY), "en")).toContain("No problem found in 1 entries.");
    expect(reportHeadline(buildPackReport([place("a", { name: "" })], TODAY), "en")).toBe("0 problems and 1 gap found in 1 entries.");
  });
  it("adds the duplicate count to the headline when there is one", () => {
    const r = buildPackReport([place("a", { name: "Hall", lat: 43.65 }), place("b", { name: "Hall", lat: 43.65 })], TODAY);
    expect(reportHeadline(r, "en")).toContain("1 possible pair of places with the same name close together.");
    expect(duplicatesHeadline({ pairs: [], total: 0, notComparable: 0 }, "en")).toBe("");
    expect(duplicatesHeadline({ pairs: [], total: 3, notComparable: 0 }, "fr")).toBe("3 paires possibles de lieux de même nom, proches l’un de l’autre.");
  });
  it("lists duplicate pairs with ids and distance and says how many are not listed", () => {
    const many = Array.from({ length: 10 }, (_, i) => place(`p${i}`, { name: "Hall", lat: 43.65, lon: -79.38 }));
    const r = buildPackReport(many, TODAY);
    const out = duplicateLines(r.duplicates, "en");
    expect(out).toHaveLength(MAX_PAIRS_LISTED + 1);
    expect(out[0]).toMatch(/^p\d and p\d, 0 m apart$/);
    expect(out.at(-1)).toBe(`25 more not listed (the list stops at ${MAX_PAIRS_LISTED}).`);
    expect(duplicateLines(r.duplicates, "fr")[0]).toMatch(/ à 0 m l’un de l’autre$/);
  });
  it("describes a group's sample by ids, or by entry numbers when no id exists", () => {
    const [byId] = groupIssues(buildPackReport([place("a", { name: "" }), place("b", { name: "" })], TODAY).audit.issues);
    expect(sampleLine(byId!, "en")).toBe("Records: a, b");
    const [noId] = groupIssues(buildPackReport([null, 4], TODAY).audit.issues);
    expect(sampleLine(noId!, "en")).toBe("Entry numbers: 1, 2");
    expect(sampleLine(noId!, "fr")).toBe("Numéros d’entrée : 1, 2".replace(" :", " :"));
  });
  it("says how many more there are past the sample", () => {
    const places = Array.from({ length: 8 }, (_, i) => place(`m${i}`, { name: "" }));
    const [g] = groupIssues(buildPackReport(places, TODAY).audit.issues);
    expect(sampleLine(g!, "en")).toBe("Records: m0, m1, m2, m3, m4, and 3 more");
  });
});

describe("packReportToText", () => {
  const messy = [place("a"), place("b", { name: "" }), place("c", { provenance: { ...OSM, licence: "All-rights-reserved" } }), place("d", { name: "Hall", lat: 43.65 }), place("e", { name: "Hall", lat: 43.65 })];
  const text = packReportToText(buildPackReport(messy, TODAY), "en");
  it("starts with the title, the date and the counts", () => {
    expect(lines(text)[0]).toBe("Report on the places saved on this device");
    expect(text).toContain("5 places, exported 19 November 2026.");
  });
  it("has a section for each part and the credit line for OpenStreetMap data", () => {
    for (const title of ["What the records cover", "How old the records are", "Problems and gaps found", "Possible duplicates", "Sources of the records saved on this device"]) expect(text, title).toContain(title);
    expect(text).toContain("© OpenStreetMap contributors");
  });
  it("labels each problem with its severity and lists the record ids", () => {
    expect(text).toContain("[Needs attention] 1 × A record's licence is not one of the open licences the App accepts.");
    expect(text).toContain("[Gap] 1 × A record has no name, so it is shown with the name UNKNOWN.");
    expect(text).toContain("  Records: b");
  });
  it("ends with a newline and has no blank run of more than one line", () => {
    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toMatch(/\n\n\n/);
  });
  it("is a short note when there is nothing to report, with no empty sections", () => {
    const empty = packReportToText(buildPackReport([], TODAY), "en");
    expect(lines(empty).filter((l) => l !== "")).toEqual(["Report on the places saved on this device", "=".repeat(41), "0 places, exported 19 November 2026.", "There are no saved places to report on."]);
  });
  it("leaves out the problem and duplicate sections for a clean pack", () => {
    const clean = packReportToText(buildPackReport([place("a"), place("b")], TODAY), "en");
    expect(clean).not.toContain("Problems and gaps found");
    expect(clean).not.toContain("Possible duplicates");
  });
  it("notes how many records were left out as unreadable", () => {
    expect(packReportToText(buildPackReport([place("a"), 5], TODAY), "en")).toContain("1 left out because they could not be read safely.");
  });
  it("is French with French typography throughout and the token UNKNOWN", () => {
    const fr = packReportToText(buildPackReport(messy, TODAY), "fr");
    expect(fr.split("\n")[0]).toBe("Rapport sur les lieux enregistrés sur cet appareil");
    for (const line of lines(fr)) expect(lintFrench(line), line).toEqual([]);
    expect(fr).toContain("UNKNOWN");
    expect(fr).not.toMatch(/INCONNU/);
    expect(fr).toContain("Problèmes et lacunes repérés");
  });
  it("carries no banned organisation name and passes the copy linter in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      const body = packReportToText(buildPackReport(messy, TODAY), locale);
      expect(containsForbiddenOrg(body)).toBe(false);
      for (const line of lines(body).filter((l) => l.trim() !== "" && !/^[=-]+$/.test(l) && !l.includes("OpenStreetMap") && !l.startsWith("http"))) {
        // Record names and ids come from the data; the wording around them must pass.
        const wording = line.replace(/Place [a-e]\b/g, "").replace(/\b[a-e], /g, "");
        expect(lintCopy(wording, locale), `${locale}: ${line}`).toEqual([]);
      }
    }
  });
  it("never says the data is verified, current or complete", () => {
    for (const locale of ["en", "fr"] as const) expect(packReportToText(buildPackReport(messy, TODAY), locale)).not.toMatch(/verified|vérifi|up to date|à jour|guarantee|complete data/i);
  });
});

describe("issuesToCsv", () => {
  const r = buildPackReport([place("a", { name: "" }), null, place("=SUM(A1)", { name: "" })], TODAY);
  const rows = issuesToCsv(r).trimEnd().split("\r\n");
  it("has the fixed header and one row per issue with the entry number from 1", () => {
    expect(rows[0]).toBe(ISSUES_CSV_HEADER.join(","));
    expect(rows).toContain("missing-name,warning,1,a");
    expect(rows).toContain("not-an-object,error,2,");
  });
  it("neutralises an id that a spreadsheet could read as a formula", () => {
    expect(rows).toContain("missing-name,warning,3,'=SUM(A1)");
    expect(rows.some((row) => /,[=+@-]/.test(row))).toBe(false);
  });
  it("uses CRLF, ends with a line break and can start with a byte order mark", () => {
    expect(issuesToCsv(r).endsWith("\r\n")).toBe(true);
    expect(issuesToCsv(r, { bom: true }).charCodeAt(0)).toBe(0xfeff);
    expect(issuesToCsv(r).charCodeAt(0)).not.toBe(0xfeff);
  });
  it("is only the header when there is no issue", () => {
    expect(issuesToCsv(buildPackReport([place("a")], TODAY))).toBe("code,severity,position,id\r\n");
  });
});

describe("file names", () => {
  it("are plain ASCII in both languages and differ by language", () => {
    for (const locale of ["en", "fr"] as const) for (const name of Object.values(REPORT_FILENAMES[locale])) expect(name).toMatch(/^[a-z-]+\.(txt|csv)$/);
    expect(REPORT_FILENAMES.en.text).not.toBe(REPORT_FILENAMES.fr.text);
  });
});

describe("the pack shipped in this build", () => {
  const r = buildPackReport(shipped, TODAY);
  it("reports without errors", () => {
    expect(r.audit.errors).toBe(0);
    expect(r.level === "clean" || r.level === "gaps").toBe(true);
  });
  it("accounts for every record: those read plus those dropped equal those checked", () => {
    expect(r.records.length + r.dropped).toBe(r.audit.checked);
    expect(r.coverage.total).toBe(r.records.length);
  });
  it("writes a report in both languages that names the OpenStreetMap credit at most once per file", () => {
    for (const locale of ["en", "fr"] as const) {
      const body = packReportToText(r, locale);
      expect(body.split("© OpenStreetMap contributors").length - 1, locale).toBeLessThanOrEqual(1);
    }
  });
});

const near = (n: number) => Array.from({ length: n }, (_, i) => place(`n${i}`, { lat: 43.65 + (i % 5) * 0.001 }));

describe("positions far from the rest", () => {
  it("make the level gaps even when the audit is clean", () => {
    const r = buildPackReport([...near(5), place("far", { lat: 60, lon: -100 })], TODAY);
    expect(r.audit.clean).toBe(true);
    expect(r.outliers.total).toBe(1);
    expect(r.level).toBe("gaps");
  });
  it("are named in the headline with the limit", () => {
    const r = buildPackReport([...near(5), place("far", { lat: 60, lon: -100 })], TODAY);
    expect(reportHeadline(r, "en")).toContain("1 position is more than 50 km from the middle of the pack.");
    expect(outliersHeadline({ outliers: [], total: 4, located: 9, middle: null }, "en")).toBe("4 positions are more than 50 km from the middle of the pack.");
    expect(outliersHeadline({ outliers: [], total: 0, located: 9, middle: null }, "en")).toBe("");
    expect(outliersHeadline({ outliers: [], total: 1, located: 9, middle: null }, "fr")).toBe("1 position est à plus de 50 km du centre du pack.");
  });
  it("are listed with id and distance, and the overflow is counted", () => {
    const far = Array.from({ length: 24 }, (_, i) => place(`f${String(i).padStart(2, "0")}`, { lat: 60 + i * 0.01, lon: -100 }));
    const r = buildPackReport([...near(60), ...far], TODAY);
    const out = outlierLines(r.outliers, "en");
    expect(out).toHaveLength(MAX_OUTLIERS_LISTED + 1);
    expect(out[0]).toMatch(/^f\d\d, \d+ km away$/);
    expect(out.at(-1)).toBe(`4 more not listed (the list stops at ${MAX_OUTLIERS_LISTED}).`);
    expect(outlierLines(r.outliers, "fr")[0]).toMatch(/, à \d+ km$/);
  });
  it("go in their own section of the text, and only when there are some", () => {
    const withFar = packReportToText(buildPackReport([...near(5), place("far", { lat: 60, lon: -100 })], TODAY), "en");
    expect(withFar).toContain("Positions far from the rest");
    expect(withFar).toContain("far, ");
    expect(packReportToText(buildPackReport(near(5), TODAY), "en")).not.toContain("Positions far from the rest");
  });
});

describe("what each kind leaves out", () => {
  it("is a section of the text with a line per kind, and absent when nothing is missing", () => {
    const text = packReportToText(buildPackReport([place("a", { category: "cafe", address: "1 Main Street" }), place("b", { category: "cafe", address: "" })], TODAY), "en");
    expect(text).toContain("What each kind of place leaves out");
    expect(text).toContain("cafe (2 records): 1 with no address");
    const full = packReportToText(buildPackReport([place("a", { category: "cafe", address: "1 Main Street" })], TODAY), "en");
    expect(full).not.toContain("What each kind of place leaves out");
  });
  it("is French with the colon spaced and UNKNOWN for a missing kind", () => {
    const text = packReportToText(buildPackReport([place("a", { address: "" })], TODAY), "fr");
    expect(text).toContain("Ce que chaque type de lieu laisse de côté");
    expect(text).toContain("UNKNOWN (1 fiche)\u00a0: 1 sans adresse");
  });
  it("does not change the level: a gap in a kind is already a gap in the audit or not a finding at all", () => {
    expect(buildPackReport([place("a", { address: "" })], TODAY).level).toBe("clean");
  });
});

