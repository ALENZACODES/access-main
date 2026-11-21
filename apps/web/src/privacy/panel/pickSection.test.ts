import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { rawTexts } from "../audit/rawTexts";
import { lintCopy, type Locale } from "./copyLint";
import { PICK_REGISTER, pickCounts, type PickRow } from "./pickRegister";
import { PICK_STRINGS, picksAsCsv, picksAsText, renderPickHtml } from "./pickSection";

const NOW = new Date(2026, 10, 21, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];
const row = (over: Partial<PickRow> = {}): PickRow => ({
  kind: "pick",
  path: "apps/web/src/a/b.ts",
  uses: 2,
  reads: { en: "An example file", fr: "Un fichier d’exemple" },
  accepts: ["json", "csv"],
  limit: "before-read",
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});
const reader = (over: Partial<PickRow> = {}): PickRow => row({ kind: "reader", accepts: [], limit: "not-applicable", path: "apps/web/src/c.tsx", uses: 1, reads: { en: "A reader", fr: "Un lecteur" }, ...over });

describe("renderPickHtml", () => {
  it("is empty when there are no rows, and when there are only readers", () => {
    for (const locale of LOCALES) {
      expect(renderPickHtml(locale, [])).toBe("");
      expect(renderPickHtml(locale, [reader()])).toBe("");
    }
  });

  it("shows the heading, note, summary, table and the two buttons", () => {
    const html = renderPickHtml("en", [row(), reader()]);
    expect(html).toContain('<h3 id="privacy-pick-title">Where the App reads a file you choose</h3>');
    expect(html).toContain("2 rows are listed, at 3 places in 2 files. 1 checks the size before reading, 0 only after reading and 0 have no check for some or all of the files.");
    for (const action of ["export-picks-csv", "export-picks-text"]) expect(html).toContain(`data-action="${action}"`);
    expect(html).not.toContain("check-picks");
  });

  it("says in the note that kinds of file only filter, and that it is read from the code", () => {
    expect(PICK_STRINGS.en.note).toContain("It is a list read from the code.");
    expect(PICK_STRINGS.en.note).toContain("only filters");
    expect(PICK_STRINGS.fr.note).toContain("ne fait que filtrer");
  });

  it("gives what you give, the kinds offered and the size limit", () => {
    const html = renderPickHtml("en", [row()]);
    expect(html).toContain('<span data-label="What you give">An example file</span>');
    expect(html).toContain('<span data-label="Kinds offered">JSON, CSV</span>');
    expect(html).toContain('<span data-label="Size limit">Size checked before the file is read</span>');
  });

  it("says in the table when the size is checked only after reading", () => {
    expect(renderPickHtml("en", [row({ limit: "after-read", checkedIn: "apps/web/src/l.ts" })])).toContain("Size checked after the file is read");
    expect(renderPickHtml("fr", [row({ limit: "after-read", checkedIn: "apps/web/src/l.ts" })])).toContain("Taille contrôlée après la lecture du fichier");
  });

  it("shows UNKNOWN as unknown, never as a kind of file", () => {
    expect(renderPickHtml("en", [row({ accepts: ["UNKNOWN"] })])).toContain('<span data-label="Kinds offered">Unknown</span>');
    expect(renderPickHtml("fr", [row({ accepts: ["UNKNOWN"] })])).toContain('<span data-label="Types proposés">Inconnu</span>');
  });

  it("does not show a file name on screen, only in the downloads", () => {
    const html = renderPickHtml("en", PICK_REGISTER);
    expect(html).not.toContain("apps/web/src");
    expect(html).not.toMatch(/\.tsx?[<\s"]/);
  });

  it("does not list a reader as a row of the table", () => {
    const html = renderPickHtml("en", [row(), reader()]);
    expect(html).not.toContain("A reader");
    expect(html.match(/<th scope="row">/g)?.length).toBe(1);
  });

  it("gives each button a 44 px target", () => {
    expect(renderPickHtml("en", [row()]).match(/min-width:44px;min-height:44px/g)?.length).toBe(2);
  });

  it("orders the table by file", () => {
    const html = renderPickHtml("en", [
      row({ path: "apps/web/src/z.ts", reads: { en: "Second", fr: "b" } }),
      row({ path: "apps/web/src/a.ts", reads: { en: "First", fr: "a" } }),
    ]);
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
  });

  it("escapes what it is given", () => {
    const html = renderPickHtml("en", [row({ reads: { en: '<b onclick="x">&', fr: "x y" } })]);
    expect(html).not.toContain("<b onclick");
    expect(html).toContain("&lt;b onclick=&quot;x&quot;&gt;&amp;");
  });

  it("has the group role, a labelled heading and a table with a caption and column headers", () => {
    const html = renderPickHtml("en", [row()]);
    expect(html).toContain('role="group" aria-labelledby="privacy-pick-title"');
    expect(html).toContain("<caption>Files the App reads when you choose them</caption>");
    expect(html.match(/<th scope="col">/g)?.length).toBe(3);
    expect(html).toContain('<th scope="row">');
  });

  it("uses the singular where there is one", () => {
    expect(renderPickHtml("en", [row({ uses: 1 })])).toContain("1 row is listed, at 1 place in 1 file.");
    expect(renderPickHtml("fr", [row({ uses: 1 })])).toContain("1 ligne figure dans la liste, à 1 endroit dans 1 fichier.");
  });

  it("passes the HTML audit and the copy rules with the real list, in both languages", () => {
    for (const locale of LOCALES) {
      const html = `<section lang="${locale}">${renderPickHtml(locale, PICK_REGISTER)}</section>`;
      expect(auditHtml(html), formatViolations(auditHtml(html))).toEqual([]);
      for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
    }
  });
});

describe("the summary", () => {
  const c = (over: Partial<ReturnType<typeof pickCounts>> = {}) => ({ total: 3, uses: 4, files: 3, before: 1, after: 1, unlimited: 1, ...over });

  it("says the numbers in English", () => {
    expect(PICK_STRINGS.en.summary(c())).toBe("3 rows are listed, at 4 places in 3 files. 1 checks the size before reading, 1 only after reading and 1 has no check for some or all of the files.");
    expect(PICK_STRINGS.en.summary(c({ before: 2, unlimited: 0 }))).toContain("2 check the size before reading");
    expect(PICK_STRINGS.en.summary(c({ unlimited: 0 }))).toContain("0 have no check");
  });

  it("says the numbers in French, with the agreement", () => {
    expect(PICK_STRINGS.fr.summary(c())).toBe("3 lignes figurent dans la liste, à 4 endroits dans 3 fichiers. 1 contrôle la taille avant la lecture, 1 seulement après la lecture et 1 n’a aucun contrôle pour une partie ou la totalité des fichiers.");
    expect(PICK_STRINGS.fr.summary(c({ before: 2 }))).toContain("2 contrôlent la taille");
  });

  it("does not use the word verified, or its French forms", () => {
    for (const l of LOCALES) expect(PICK_STRINGS[l].summary(c())).not.toMatch(/verif|vérif/i);
  });
});

describe("picksAsCsv", () => {
  it("has a header, then a row for each pick and reader, picks first", () => {
    const f = picksAsCsv("en", [reader(), row()], NOW);
    const lines = f.text.trimEnd().split("\r\n");
    expect(lines[0]).toBe("What you give,How,Kinds offered,Size limit,Checked in,In the code,Places,Recorded on");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("An example file,A file you choose,\"JSON, CSV\"");
    expect(lines[2]).toContain("A reader,A file reader,Not applicable");
    expect(f.count).toBe(2);
  });

  it("names the file with the local date, and says text/csv", () => {
    const f = picksAsCsv("en", [row()], NOW);
    expect(f.filename).toBe("the-app-files-you-choose-2026-11-21.csv");
    expect(f.mime).toBe("text/csv");
    expect(picksAsCsv("fr", [row()], NOW).filename).toBe("l-app-fichiers-que-vous-choisissez-2026-11-21.csv");
  });

  it("uses a semicolon in French when asked, and quotes a cell that holds one", () => {
    const f = picksAsCsv("fr", [row({ reads: { en: "x y", fr: "Un; deux" } })], NOW, ";");
    expect(f.text.split("\r\n")[1]).toMatch(/^"Un; deux";/);
  });

  it("gives the file where a limit is applied, in its own column, only for after-read rows", () => {
    const f = picksAsCsv("en", [row({ limit: "after-read", checkedIn: "apps/web/src/l.ts" }), row({ path: "apps/web/src/z.ts" })], NOW);
    const [, a, b] = f.text.trimEnd().split("\r\n");
    expect(a).toContain(",apps/web/src/l.ts,apps/web/src/a/b.ts,");
    expect(b).toContain(",Size checked before the file is read,,apps/web/src/z.ts,");
  });

  it("protects a cell that would run as a formula", () => {
    const f = picksAsCsv("en", [row({ reads: { en: "=1+1", fr: "x y" } })], NOW);
    expect(f.text).not.toMatch(/\r\n=1\+1/);
    expect(f.text).toContain("'=1+1");
  });

  it("gives one row per row of the real list, in both languages", () => {
    for (const l of LOCALES) {
      const f = picksAsCsv(l, PICK_REGISTER, NOW);
      expect(f.count).toBe(PICK_REGISTER.length);
      expect(f.text.trimEnd().split("\r\n")).toHaveLength(PICK_REGISTER.length + 1);
    }
  });

  it("is only a header and nothing else for no rows", () => {
    const f = picksAsCsv("en", [], NOW);
    expect(f.count).toBe(0);
    expect(f.text.trimEnd().split("\r\n")).toHaveLength(1);
  });

  it("pads the date with zeros", () => {
    expect(picksAsCsv("en", [row()], new Date(2026, 0, 5)).filename).toContain("2026-01-05");
  });
});

describe("picksAsText", () => {
  it("starts with the title, the note and the summary", () => {
    const f = picksAsText("en", [row()], NOW);
    expect(f.text.startsWith(`${PICK_STRINGS.en.fileTitle}\n\n${PICK_STRINGS.en.note}\n\n${PICK_STRINGS.en.summary(pickCounts([row()]))}\n`)).toBe(true);
    expect(f.mime).toBe("text/plain");
    expect(f.filename).toBe("the-app-files-you-choose-2026-11-21.txt");
  });

  it("gives each row's lines", () => {
    const f = picksAsText("en", [row()], NOW);
    expect(f.text).toContain("An example file\n  How: A file you choose\n  Kinds offered: JSON, CSV\n  Size limit: Size checked before the file is read\n  In the code: apps/web/src/a/b.ts\n  Places: 2\n  Recorded on: 2026-11-21\n");
    expect(f.text).not.toContain("Checked in");
  });

  it("gives the checked-in file for an after-read row", () => {
    expect(picksAsText("en", [row({ limit: "after-read", checkedIn: "apps/web/src/l.ts" })], NOW).text).toContain("  Checked in: apps/web/src/l.ts\n");
  });

  it("uses a no-break space before the colon in French", () => {
    const f = picksAsText("fr", [row()], NOW);
    expect(f.text).toContain("  Comment\u00A0: Un fichier que vous choisissez");
    expect(f.text).not.toMatch(/[^\u00A0\u202F] :/);
  });

  it("says not applicable for a reader's kinds", () => {
    expect(picksAsText("en", [reader()], NOW).text).toContain("Kinds offered: Not applicable");
  });

  it("ends with a newline and has no summary for no rows", () => {
    const f = picksAsText("en", [], NOW);
    expect(f.text.endsWith("\n")).toBe(true);
    expect(f.text).not.toContain("rows are listed");
    expect(f.count).toBe(0);
  });

  it("has one block for each row of the real list", () => {
    for (const l of LOCALES) {
      const f = picksAsText(l, PICK_REGISTER, NOW);
      expect(f.count).toBe(PICK_REGISTER.length);
      expect(f.text.match(/apps\/web\/src\//g)?.length).toBeGreaterThanOrEqual(PICK_REGISTER.length);
    }
  });

  it("passes the copy rules in both languages", () => {
    for (const l of LOCALES) for (const t of [PICK_STRINGS[l].note, PICK_STRINGS[l].heading, PICK_STRINGS[l].caption]) expect(lintCopy(l, t), t).toEqual([]);
  });
});
