import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { checkParity } from "../audit/parity";
import { rawTexts } from "../audit/rawTexts";
import { CALL_REGISTER } from "./addressRegister";
import { lintCopy, type Locale } from "./copyLint";
import { STATEMENT_REGISTER, checkStatements, type StatementResult, type StatementRow } from "./statementRegister";
import { STATEMENT_STRINGS, renderStatementsHtml, statementCounts, statementsAsCsv, statementsAsText } from "./statementSection";

const NOW = new Date(2026, 10, 20, 9, 0, 0);
const LOCALES: Locale[] = ["en", "fr"];
const row = (path: string, en = 1, fr = 0): StatementRow => ({ path, where: { en: `Part ${path}`, fr: `Partie ${path}` }, en, fr, source: "s", recordedOn: "2026-11-20" });
const RESULTS: StatementResult[] = [
  { row: row("a.ts", 2, 1), check: "no-requests-in-file" },
  { row: row("b.ts", 1, 1), check: "requests-in-file" },
  { row: row("c.ts", 0, 1), check: "not-checked" },
];
const LIVE = checkStatements(STATEMENT_REGISTER, CALL_REGISTER);
const textOf = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("statementCounts", () => {
  it("counts the parts by what the check found", () => {
    expect(statementCounts(RESULTS)).toEqual({ parts: 3, found: 1, some: 1, unchecked: 1 });
    expect(statementCounts([])).toEqual({ parts: 0, found: 0, some: 0, unchecked: 0 });
  });
});

describe("summary sentence", () => {
  it("says how many parts say it and how many were found clear, singular and plural", () => {
    expect(STATEMENT_STRINGS.en.summary(1, 1, 0, 0)).toBe("1 part of the App says this. In 1 of them the check found no network request in that part’s code.");
    expect(STATEMENT_STRINGS.en.summary(3, 2, 1, 0)).toBe("3 parts of the App say this. In 2 of them the check found no network request in that part’s code. In 1 it found one, so the statement there stays unconfirmed.");
  });
  it("says they were not checked when none were", () => {
    expect(STATEMENT_STRINGS.en.summary(2, 0, 0, 2)).toBe("2 parts of the App say this. They were not checked.");
    expect(STATEMENT_STRINGS.fr.summary(1, 0, 0, 1)).toBe("1 partie de l’App le dit. Elle n’a pas été contrôlée.");
  });
  it("is correct in French, singular and plural", () => {
    expect(STATEMENT_STRINGS.fr.summary(2, 2, 0, 0)).toBe("2 parties de l’App le disent. Dans 2 d’entre elles, le contrôle n’a trouvé aucune requête réseau dans le code de cette partie.");
    expect(STATEMENT_STRINGS.fr.summary(3, 1, 2, 0)).toContain("Dans 2, il en a trouvé une, l’affirmation y reste donc non confirmée.");
  });
});

describe("renderStatementsHtml", () => {
  it("renders nothing for no rows", () => {
    for (const l of LOCALES) expect(renderStatementsHtml(l, [])).toBe("");
  });
  it("has a labelled group, a captioned table with two header cells and both buttons", () => {
    const html = renderStatementsHtml("en", RESULTS);
    expect(html).toContain('data-privacy-statements role="group" aria-labelledby="privacy-statements-title"');
    expect(html.match(/<caption>/g)).toHaveLength(1);
    expect(html.match(/<th scope="col">/g)).toHaveLength(2);
    expect(html).toContain('data-action="export-statements-csv"');
    expect(html).toContain('data-action="export-statements-text"');
  });
  it("shows one row per part, with what the check found", () => {
    const text = textOf(renderStatementsHtml("en", RESULTS));
    expect(text).toContain("Part a.ts None found");
    expect(text).toContain("Part b.ts Some. The check cannot confirm the statement there.");
    expect(text).toContain("Part c.ts Not checked");
  });
  it("says the check does not prove a statement", () => {
    expect(textOf(renderStatementsHtml("en", RESULTS))).toContain("so it does not prove a statement");
  });
  it("never shows a file path", () => {
    const text = textOf(renderStatementsHtml("en", LIVE));
    expect(text).not.toContain("apps/web");
    expect(text).not.toMatch(/\.tsx?\b/);
  });
  it("escapes the text of a row", () => {
    const bad: StatementResult[] = [{ row: { ...row("a.ts"), where: { en: "<b>x</b>", fr: "y" } }, check: "no-requests-in-file" }];
    expect(renderStatementsHtml("en", bad)).not.toContain("<b>");
  });
  it("lists every part of the real register in both languages", () => {
    for (const l of LOCALES) for (const r of STATEMENT_REGISTER) expect(renderStatementsHtml(l, LIVE), r.path).toContain(r.where[l].replace(/&/g, "&amp;"));
  });
});

describe("statementsAsCsv", () => {
  it("has a header and one row per part, with the counts and the result", () => {
    const f = statementsAsCsv("en", RESULTS, NOW);
    expect(f.mime).toBe("text/csv");
    expect(f.filename).toBe("the-app-statements-about-data-2026-11-20.csv");
    expect(f.count).toBe(3);
    const lines = f.text.split("\r\n");
    expect(lines[0]).toBe("Part of the App,English statements,French statements,Network requests in that part’s code");
    expect(lines[1]).toBe("Part a.ts,2,1,None found");
  });
  it("uses a semicolon and French words for French", () => {
    const f = statementsAsCsv("fr", RESULTS, NOW, ";");
    expect(f.filename).toBe("l-app-affirmations-sur-les-donnees-2026-11-20.csv");
    expect(f.text.split("\r\n")[3]).toBe("Partie c.ts;0;1;Non contrôlé");
  });
  it("writes the result that needs a check for the second part", () => {
    expect(statementsAsCsv("en", RESULTS, NOW).text.split("\r\n")[2]).toBe("Part b.ts,1,1,Some. The check cannot confirm the statement there.");
  });
});

describe("statementsAsText", () => {
  it("has the title, the note, the summary and a block for each part", () => {
    const f = statementsAsText("en", RESULTS, NOW);
    expect(f.text.split("\n")[0]).toBe("What the App says about your data");
    expect(f.text).toContain("Part a.ts\n  English statements: 2\n  French statements: 1\n  Network requests in that part’s code: None found");
    expect(f.text.endsWith("\n")).toBe(true);
  });
  it("puts a no-break space before the colon in French", () => {
    const t = statementsAsText("fr", RESULTS, NOW).text;
    expect(t).toContain("Affirmations en anglais : 2");
    expect(t).not.toMatch(/\S: \d/);
  });
  it("has no summary line for no rows", () => {
    expect(statementsAsText("en", [], NOW).count).toBe(0);
  });
});

describe("wording", () => {
  it("passes the HTML audit and the copy lint in both languages", () => {
    for (const l of LOCALES) {
      for (const results of [RESULTS, LIVE]) {
        const html = renderStatementsHtml(l, results);
        const v = auditHtml(`<section lang="${l}">${html}</section>`);
        expect(v, formatViolations(v)).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(l, t), t).toEqual([]);
      }
      for (const line of statementsAsText(l, RESULTS, NOW).text.split("\n")) if (line.trim() !== "") expect(lintCopy(l, line.trim()), line).toEqual([]);
    }
  });
  it("has the same shape in English and French", () => {
    const flat = (l: Locale): Record<string, string> => {
      const s = STATEMENT_STRINGS[l];
      return { heading: s.heading, note: s.note, caption: s.caption, csvButton: s.csvButton, textButton: s.textButton, fileTitle: s.fileTitle, ...Object.fromEntries(Object.entries(s.columns).map(([k, v]) => [`columns.${k}`, v])), ...Object.fromEntries(Object.entries(s.checks).map(([k, v]) => [`checks.${k}`, v])), ...Object.fromEntries(Object.entries(s.labels).map(([k, v]) => [`labels.${k}`, v])), ...Object.fromEntries(s.exportHeader.map((h, i) => [`h${i}`, h])) };
    };
    expect(checkParity(flat("en"), flat("fr"), {})).toEqual([]);
  });
  it("never says verified or a word for it", () => {
    for (const l of LOCALES) expect(`${renderStatementsHtml(l, LIVE)}${statementsAsText(l, LIVE, NOW).text}${statementsAsCsv(l, LIVE, NOW).text}`).not.toMatch(/verified|vérif/i);
  });
});
