import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { rawTexts } from "../audit/rawTexts";
import { lintCopy, type Locale } from "./copyLint";
import { EMPTY_SAVE_READING, saveCheck, type SaveReading } from "./saveLive";
import { SAVE_KINDS, SAVE_KIND_LABELS, SAVE_REGISTER, type SaveRow } from "./saveRegister";
import { SAVE_STRINGS, renderSaveHtml, saveAsCsv, saveAsText } from "./saveSection";

const NOW = new Date(2026, 10, 21, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];
const row = (over: Partial<SaveRow> = {}): SaveRow => ({
  kind: "json",
  path: "apps/web/src/a/b.ts",
  uses: 2,
  makes: { en: "A file about a thing", fr: "Un fichier sur une chose" },
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});
const caller = (over: Partial<SaveRow> = {}): SaveRow => row({ kind: "none", path: "apps/web/src/c.tsx", uses: 1, makes: { en: "A report from a caller", fr: "Un rapport d’un appelant" }, ...over });
const reading: SaveReading = { blob: true, address: false, attribute: null };

describe("renderSaveHtml", () => {
  it("is empty when there are no rows", () => {
    for (const locale of LOCALES) expect(renderSaveHtml(locale, [])).toBe("");
  });

  it("shows the heading, note, summary, table and the three buttons", () => {
    const html = renderSaveHtml("en", [row(), caller()]);
    expect(html).toContain('<h3 id="privacy-save-title">Where the App makes files for you to save</h3>');
    expect(html).toContain("2 rows are listed, at 3 places in 2 files. In 1 the code names the format itself and in 1 the format is passed in from somewhere else.");
    for (const action of ["check-save", "export-save-csv", "export-save-text"]) expect(html).toContain(`data-action="${action}"`);
  });

  it("says in the note what it does not know", () => {
    expect(SAVE_STRINGS.en.note).toContain("It is a list read from the code.");
    expect(SAVE_STRINGS.en.note).toContain("It does not say what is inside a file you save");
    expect(SAVE_STRINGS.fr.note).toContain("Elle ne dit pas ce que contient un fichier que vous enregistrez");
  });

  it("gives what the file is about and the formats the code names", () => {
    const html = renderSaveHtml("en", [row()]);
    expect(html).toContain('<span data-label="What the file is about">A file about a thing</span>');
    expect(html).toContain('<span data-label="Formats the code names">Names JSON</span>');
  });

  it("does not show a file name on screen, only in the downloads", () => {
    for (const locale of LOCALES) {
      const html = renderSaveHtml(locale, SAVE_REGISTER);
      expect(html).not.toContain("apps/web/src");
      expect(html).not.toContain("packages/");
      expect(html).not.toMatch(/\.tsx?[<\s"]/);
    }
  });

  it("gives each button a 44 px target", () => {
    expect(renderSaveHtml("en", [row()]).match(/min-width:44px;min-height:44px/g)?.length).toBe(3);
  });

  it("orders the table by format and then by file", () => {
    const html = renderSaveHtml("en", [
      caller({ makes: { en: "Third", fr: "c" } }),
      row({ path: "apps/web/src/z.ts", makes: { en: "Second", fr: "b" } }),
      row({ path: "apps/web/src/a.ts", makes: { en: "First", fr: "a" } }),
    ]);
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
    expect(html.indexOf("Second")).toBeLessThan(html.indexOf("Third"));
  });

  it("escapes what it is given", () => {
    const html = renderSaveHtml("en", [row({ makes: { en: '<b onclick="x">&', fr: "x y" } })]);
    expect(html).not.toContain("<b onclick");
    expect(html).toContain("&lt;b onclick=&quot;x&quot;&gt;&amp;");
  });

  it("has the group role, a labelled heading and a table with a caption and two column headers", () => {
    const html = renderSaveHtml("en", [row()]);
    expect(html).toContain('role="group" aria-labelledby="privacy-save-title"');
    expect(html).toContain("<caption>Places that make a file for you to save</caption>");
    expect(html.match(/<th scope="col">/g)?.length).toBe(2);
  });

  it("uses the singular where there is one, in both languages", () => {
    expect(renderSaveHtml("en", [row({ uses: 1 })])).toContain("1 row is listed, at 1 place in 1 file.");
    expect(renderSaveHtml("fr", [row({ uses: 1 })])).toContain("1 ligne figure dans la liste, à 1 endroit dans 1 fichier. Dans 1, le code nomme lui-même le format et dans 0, le format est transmis par un autre endroit.");
    expect(renderSaveHtml("fr", [row(), caller()])).toContain("2 lignes figurent dans la liste, à 3 endroits dans 2 fichiers.");
  });

  it("gives one table row for each row of the list", () => {
    expect(renderSaveHtml("en", SAVE_REGISTER).match(/<tr><th scope="row">/g)?.length).toBe(SAVE_REGISTER.length);
  });

  it("names every format kind it can show", () => {
    const html = SAVE_KINDS.map((k) => renderSaveHtml("en", [row({ kind: k, path: `apps/web/src/${k}.ts` })])).join("");
    for (const k of SAVE_KINDS) expect(html).toContain(SAVE_KIND_LABELS[k].en);
  });

  it("passes the HTML audit and the copy rules with the real list, in both languages", () => {
    for (const locale of LOCALES) {
      const html = `<section lang="${locale}">${renderSaveHtml(locale, SAVE_REGISTER)}</section>`;
      expect(auditHtml(html), formatViolations(auditHtml(html))).toEqual([]);
      for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
    }
  });
});

describe("the answers after the person asks", () => {
  it("show nothing about an answer until there is one", () => {
    expect(renderSaveHtml("en", [row()])).not.toContain("data-privacy-save-check");
  });

  it("show a table with one row for each of the three questions, in order", () => {
    const html = renderSaveHtml("en", [row()], saveCheck(reading));
    expect(html).toContain("data-privacy-save-check");
    expect(html).toContain("<caption>What your browser said</caption>");
    expect([...html.matchAll(/data-label="Answer">([^<]*)</g)].map((m) => m[1])).toEqual(["Yes", "No", "Unknown"]);
  });

  it("say unknown for a question with no answer, never no", () => {
    const html = renderSaveHtml("en", [row()], saveCheck(EMPTY_SAVE_READING));
    expect([...html.matchAll(/data-label="Answer">([^<]*)</g)].map((m) => m[1])).toEqual(["Unknown", "Unknown", "Unknown"]);
    expect(html).toContain("0 answers to 3 questions.");
  });

  it("list each missing and each unanswered thing", () => {
    const html = renderSaveHtml("en", [row()], saveCheck(reading));
    expect(html).toContain("<li>Making an address for the file: the browser says this is not available here, so a download button may do nothing.</li>");
    expect(html).toContain("<li>Naming the file to save: the browser gave no answer.</li>");
  });

  it("list nothing when all three are yes", () => {
    expect(renderSaveHtml("en", [row()], saveCheck({ blob: true, address: true, attribute: true }))).not.toContain("<ul>");
  });

  it("say that the answers are not saved or sent and that no file is made", () => {
    expect(renderSaveHtml("en", [row()], saveCheck(reading))).toContain("are not saved or sent. No file is made.");
    expect(renderSaveHtml("fr", [row()], saveCheck(reading))).toContain("ne sont ni enregistrées ni envoyées. Aucun fichier n’est fabriqué.");
  });

  it("is a status region, so a screen reader says the answers when they arrive", () => {
    expect(renderSaveHtml("en", [row()], saveCheck(reading))).toContain('<div role="status" data-privacy-save-check>');
  });

  it("passes the HTML audit and the copy rules in every state, in both languages", () => {
    const states: SaveReading[] = [reading, EMPTY_SAVE_READING, { blob: true, address: true, attribute: true }, { blob: false, address: false, attribute: false }];
    for (const locale of LOCALES) {
      for (const st of states) {
        const html = `<section lang="${locale}">${renderSaveHtml(locale, SAVE_REGISTER, saveCheck(st))}</section>`;
        expect(auditHtml(html), formatViolations(auditHtml(html))).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
      }
    }
  });
});

describe("saveAsCsv", () => {
  it("gives a header and one line for each row, with the file and the places", () => {
    const f = saveAsCsv("en", [row(), caller()], NOW);
    expect(f.mime).toBe("text/csv");
    expect(f.count).toBe(2);
    expect(f.filename).toBe("the-app-files-it-makes-2026-11-21.csv");
    expect(f.text.split("\r\n")).toEqual([
      "Formats the code names,What the file is about,In the code,Places,Recorded on",
      "Names JSON,A file about a thing,apps/web/src/a/b.ts,2,2026-11-21",
      "Names no format (the caller passes it in),A report from a caller,apps/web/src/c.tsx,1,2026-11-21",
      "",
    ]);
  });

  it("uses the French header and name, and a semicolon when asked", () => {
    const f = saveAsCsv("fr", [row()], NOW, ";");
    expect(f.filename).toBe("l-app-fichiers-qu-elle-fabrique-2026-11-21.csv");
    expect(f.text.split("\r\n")[0]).toBe("Formats nommés par le code;De quoi parle le fichier;Dans le code;Endroits;Date d’inscription");
    expect(f.text.split("\r\n")[1]).toBe("Nomme le JSON;Un fichier sur une chose;apps/web/src/a/b.ts;2;2026-11-21");
  });

  it("quotes a cell that holds the delimiter, a quote or a line break", () => {
    const f = saveAsCsv("en", [row({ makes: { en: 'A, "b"\nc', fr: "x y" } })], NOW);
    expect(f.text).toContain('"A, ""b""\nc"');
  });

  it("does not start a cell with a character a spreadsheet would run", () => {
    for (const bad of ["=1+1", "+1", "-1", "@x"]) {
      const f = saveAsCsv("en", [row({ makes: { en: bad, fr: "x y" } })], NOW);
      expect(f.text.split("\r\n")[1]?.split(",")[1], bad).not.toMatch(/^[=+\-@]/);
    }
  });

  it("gives the real list as one line each, with a count that says so", () => {
    for (const locale of LOCALES) {
      const f = saveAsCsv(locale, SAVE_REGISTER, NOW);
      expect(f.count).toBe(SAVE_REGISTER.length);
      expect(f.text.split("\r\n").length).toBe(SAVE_REGISTER.length + 2);
    }
  });

  it("gives only a header for no rows", () => {
    const f = saveAsCsv("en", [], NOW);
    expect(f.count).toBe(0);
    expect(f.text.split("\r\n")).toHaveLength(2);
  });

  it("dates the file with the local day", () => {
    expect(saveAsCsv("en", [], new Date(2026, 0, 5, 23, 59)).filename).toContain("2026-01-05");
  });
});

describe("saveAsText", () => {
  it("starts with a title, the note and the summary, and has one block for each row", () => {
    const f = saveAsText("en", [row(), caller()], NOW);
    expect(f.mime).toBe("text/plain");
    expect(f.filename).toBe("the-app-files-it-makes-2026-11-21.txt");
    expect(f.text.startsWith("Where the App makes files for you to save\n\n")).toBe(true);
    expect(f.text).toContain("2 rows are listed, at 3 places in 2 files.");
    expect(f.text).toContain("A file about a thing\n  Formats the code names: Names JSON\n  In the code: apps/web/src/a/b.ts\n  Places: 2\n  Recorded on: 2026-11-21\n");
    expect(f.count).toBe(2);
  });

  it("puts a no-break space before a colon in French", () => {
    const f = saveAsText("fr", [row()], NOW);
    expect(f.text).toContain("Formats nommés par le code\u00A0: Nomme le JSON");
    expect(f.text).not.toMatch(/[^\u00A0] :/);
  });

  it("has one block for each row of the real list, in both languages", () => {
    for (const l of LOCALES) {
      const f = saveAsText(l, SAVE_REGISTER, NOW);
      expect(f.count).toBe(SAVE_REGISTER.length);
      expect(f.text.match(/(?:apps\/web|packages\/[a-z-]+)\/src\//g)?.length).toBe(SAVE_REGISTER.length);
    }
  });

  it("ends with one line break and has no summary for no rows", () => {
    const f = saveAsText("en", [], NOW);
    expect(f.text.endsWith("\n")).toBe(true);
    expect(f.text).not.toContain("rows are listed");
    expect(f.count).toBe(0);
  });

  it("passes the copy rules, in both languages", () => {
    for (const l of LOCALES) for (const line of saveAsText(l, SAVE_REGISTER, NOW).text.split("\n")) if (line.trim() !== "" && !/\/src\//.test(line)) expect(lintCopy(l, line), line).toEqual([]);
  });
});
