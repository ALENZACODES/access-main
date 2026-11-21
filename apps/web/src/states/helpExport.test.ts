import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { lintCopy } from "./copyLint";
import { parseCsv, undoFormulaGuard } from "./csvParse";
import { help } from "./helpFixtures";
import { HELP_CSV_COLUMNS, helpFileName, helpQueryLine, helpToCsv, helpToText } from "./helpExport";
import { EMPTY_HELP_QUERY, rowFor, viewHelp } from "./helpView";
import { parseHelpNumbers } from "./packHelp";
import { lintFrench } from "./typography";

const TODAY = "2026-11-21";
const shipped = parseHelpNumbers((JSON.parse(contentText) as { help_numbers: unknown[] }).help_numbers).items;
const rows = (csv: string): string[][] => {
  const r = parseCsv(csv.replace(/^\uFEFF/, ""));
  if (!r.ok) throw new Error("csv did not parse");
  return r.rows as string[][];
};

describe("helpToCsv", () => {
  it("has the columns, one row per entry and CRLF lines", () => {
    const csv = helpToCsv(shipped);
    expect(csv.split("\r\n")[0]).toBe(HELP_CSV_COLUMNS.join(","));
    expect(csv.split("\r\n")).toHaveLength(shipped.length + 2);
  });
  it("has the header only for no entries, and a byte order mark when asked", () => {
    expect(helpToCsv([])).toBe(`${HELP_CSV_COLUMNS.join(",")}\r\n`);
    expect(helpToCsv([], { bom: true }).charCodeAt(0)).toBe(0xfeff);
    expect(helpToCsv([]).charCodeAt(0)).not.toBe(0xfeff);
  });
  it("carries each number exactly as written, with both languages", () => {
    const [head, , , , fourth] = rows(helpToCsv(shipped));
    const row = Object.fromEntries(head!.map((h, i) => [h, fourth![i]]));
    expect(row.id).toBe("connexontario");
    expect(row.number).toBe("1-866-531-2600");
    expect(row.name_en).toBe("ConnexOntario");
    expect(row.description_fr).toContain("santé mentale");
    expect(row.page).toBe("https://connexontario.ca/contact-us/");
    expect(row.retrieved).toBe("2026-11-13");
    expect(row.tier).toBe("E");
  });
  it("writes UNKNOWN for what is not given", () => {
    const [head, r] = rows(helpToCsv([help({ name: { en: null, fr: null }, how: { en: null, fr: null }, contact: null, url: null, sourceName: null, licence: null, retrievedOn: null, tier: null })]));
    const row = Object.fromEntries(head!.map((h, i) => [h, r![i]]));
    for (const k of HELP_CSV_COLUMNS.filter((c) => c !== "id")) expect(row[k], k).toBe("UNKNOWN");
  });
  it("has the same number of cells in every row", () => {
    for (const r of rows(helpToCsv(shipped))) expect(r).toHaveLength(HELP_CSV_COLUMNS.length);
  });
  it("quotes commas, quotes and line breaks and reads back the same", () => {
    const how = 'Call, "now"\nthen wait';
    const [, r] = rows(helpToCsv([help({ how: { en: how, fr: null } })]));
    expect(r?.[HELP_CSV_COLUMNS.indexOf("description_en")]).toBe(how);
  });
  it("neutralises a cell that would run as a formula", () => {
    for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)"]) {
      const [, r] = rows(helpToCsv([help({ name: { en: bad, fr: null } })]));
      expect(r?.[1]?.startsWith("'"), bad).toBe(true);
      expect(undoFormulaGuard(r![1]!)).toBe(bad);
    }
  });
});

describe("helpToText", () => {
  const view = viewHelp(shipped, EMPTY_HELP_QUERY, "en");
  const text = helpToText(view.rows, TODAY, "en");
  it("has the title, the lead and the day", () => {
    expect(text.startsWith("Saved help numbers\n==================")).toBe(true);
    expect(text).toContain("A number may have changed.");
    expect(text).toContain("As of 21 November 2026.");
  });
  it("lists each entry in the pack's order with the number on its own line", () => {
    const at = (s: string) => text.indexOf(s);
    expect(at("Emergency services\n------------------\n911\n")).toBeGreaterThan(0);
    const order = ["Emergency services", "9-8-8 Suicide Crisis Helpline", "Health811", "ConnexOntario", "Ontario Poison Centre", "211 Ontario"].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("says each number aloud and gives its kind and description", () => {
    expect(text).toContain("Said aloud: nine one one.");
    expect(text).toContain("Said aloud: nine eight eight.");
    expect(text).toContain("A toll-free number.");
    expect(text).toContain("Call or text 9-8-8, any time, in English or French.");
  });
  it("shows the page address as text and gives the source of each", () => {
    expect(text).toContain("Page: https://988.ca/");
    expect(text).toContain("Source: Official page, desk check. Licence: UNKNOWN. Retrieved 13 November 2026. Tier E, saved copy.");
  });
  it("says nothing to show for no rows", () => {
    expect(helpToText([], TODAY, "en")).toContain("No help numbers to show.");
  });
  it("says what the search was", () => {
    const filtered = viewHelp(shipped, { ...EMPTY_HELP_QUERY, text: "911" }, "en");
    const t = helpToText(filtered.rows, TODAY, "en", { ...EMPTY_HELP_QUERY, text: "911" });
    expect(t).toContain('search "911".');
    expect(t).not.toContain("ConnexOntario");
  });
  it("says there is no number or description when there is none", () => {
    const t = helpToText([rowFor(help({ contact: null, how: { en: null, fr: null } }), "en")], TODAY, "en");
    expect(t).toContain("No number is saved for this entry.");
    expect(t).toContain("No description is saved for this entry.");
  });
  it("notes when it shows the other language", () => {
    const t = helpToText([rowFor(help({ how: { en: "English only", fr: null } }), "fr")], TODAY, "fr");
    expect(t).toContain("English only");
    expect(t).toContain("Affiché en anglais");
  });
  it("is in French with the French colon spacing for the French page", () => {
    const fr = helpToText(viewHelp(shipped, EMPTY_HELP_QUERY, "fr").rows, TODAY, "fr");
    expect(fr).toContain("Numéros d’aide enregistrés");
    expect(fr).toContain("À dire à voix haute\u00a0: neuf un un.");
    expect(fr).toContain("En date du 21 novembre 2026.");
    expect(fr).toContain("Services d'urgence");
  });
  it("has no line that the linters reject", () => {
    for (const l of ["en", "fr"] as const) {
      const t = helpToText(viewHelp(shipped, EMPTY_HELP_QUERY, l).rows, TODAY, l);
      const data = new Set(shipped.flatMap((i) => [i.name.en, i.name.fr, i.how.en, i.how.fr]));
      for (const line of t.split("\n").filter((x) => x && !data.has(x) && !/^Source|^Page/.test(x))) {
        expect(lintCopy(line, l), `${l}: ${line}`).toEqual([]);
        if (l === "fr") expect(lintFrench(line), line).toEqual([]);
      }
    }
  });
});

describe("helpQueryLine and helpFileName", () => {
  it("says all for no search, and names a search", () => {
    expect(helpQueryLine(EMPTY_HELP_QUERY, "en")).toBe("All saved help numbers.");
    expect(helpQueryLine({ text: " 211 ", sort: "pack" }, "en")).toBe('search "211".');
    expect(helpQueryLine({ text: "aide", sort: "pack" }, "fr")).toBe("recherche «\u202faide\u202f».");
  });
  it("names the file for the day and kind", () => {
    expect(helpFileName("csv", TODAY)).toBe("help-numbers-2026-11-21.csv");
    expect(helpFileName("txt", TODAY)).toBe("help-numbers-2026-11-21.txt");
  });
});
