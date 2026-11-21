import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { rawTexts } from "../audit/rawTexts";
import { browserCheck, EMPTY_BROWSER_READING, type BrowserReading } from "./browserLive";
import { BROWSER_REGISTER, browserCounts, type BrowserRow } from "./browserRegister";
import { BROWSER_STRINGS, browserAsCsv, browserAsText, renderBrowserHtml } from "./browserSection";
import { lintCopy, type Locale } from "./copyLint";

const NOW = new Date(2026, 10, 21, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];
const row = (over: Partial<BrowserRow> = {}): BrowserRow => ({
  kind: "language",
  path: "apps/web/src/a/b.ts",
  uses: 2,
  asks: { en: "A question asked", fr: "Une question posée" },
  usedFor: { en: "A use made of it", fr: "Un usage qui en est fait" },
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});
const id = (over: Partial<BrowserRow> = {}): BrowserRow => row({ kind: "identifier", path: "apps/web/src/c.tsx", uses: 1, asks: { en: "Makes an identifier", fr: "Fabrique un identifiant" }, ...over });
const reading: BrowserReading = { language: "fr-CA", online: false, contrast: false, motion: true, usage: 5_000_000, quota: 2_000_000_000, persisted: null };

describe("renderBrowserHtml", () => {
  it("is empty when there are no rows", () => {
    for (const locale of LOCALES) expect(renderBrowserHtml(locale, [])).toBe("");
  });

  it("shows the heading, note, summary, table and the three buttons", () => {
    const html = renderBrowserHtml("en", [row(), id()]);
    expect(html).toContain('<h3 id="privacy-browser-title">What the App asks your browser</h3>');
    expect(html).toContain("2 rows are listed, at 3 places in 2 files. 1 asks about your device or settings and 1 makes an identifier.");
    for (const action of ["check-browser", "export-browser-csv", "export-browser-text"]) expect(html).toContain(`data-action="${action}"`);
  });

  it("says in the note what it does not know", () => {
    expect(BROWSER_STRINGS.en.note).toContain("It is a list read from the code.");
    expect(BROWSER_STRINGS.en.note).toContain("It does not say what your browser answers");
    expect(BROWSER_STRINGS.fr.note).toContain("Elle ne dit pas ce que répond votre navigateur");
  });

  it("gives the kind, what it asks and what it is used for", () => {
    const html = renderBrowserHtml("en", [row()]);
    expect(html).toContain('<span data-label="About">Language</span>');
    expect(html).toContain('<span data-label="What it asks">A question asked</span>');
    expect(html).toContain('<span data-label="What it is used for">A use made of it</span>');
  });

  it("does not show a file name on screen, only in the downloads", () => {
    for (const locale of LOCALES) {
      const html = renderBrowserHtml(locale, BROWSER_REGISTER);
      expect(html).not.toContain("apps/web/src");
      expect(html).not.toContain("packages/");
      expect(html).not.toMatch(/\.tsx?[<\s"]/);
    }
  });

  it("gives each button a 44 px target", () => {
    expect(renderBrowserHtml("en", [row()]).match(/min-width:44px;min-height:44px/g)?.length).toBe(3);
  });

  it("orders the table by kind and then by file", () => {
    const html = renderBrowserHtml("en", [
      id({ asks: { en: "Third", fr: "c" } }),
      row({ path: "apps/web/src/z.ts", asks: { en: "Second", fr: "b" } }),
      row({ path: "apps/web/src/a.ts", asks: { en: "First", fr: "a" } }),
    ]);
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
    expect(html.indexOf("Second")).toBeLessThan(html.indexOf("Third"));
  });

  it("escapes what it is given", () => {
    const html = renderBrowserHtml("en", [row({ asks: { en: '<b onclick="x">&', fr: "x y" } })]);
    expect(html).not.toContain("<b onclick");
    expect(html).toContain("&lt;b onclick=&quot;x&quot;&gt;&amp;");
  });

  it("has the group role, a labelled heading and a table with a caption and column headers", () => {
    const html = renderBrowserHtml("en", [row()]);
    expect(html).toContain('role="group" aria-labelledby="privacy-browser-title"');
    expect(html).toContain("<caption>Questions the App asks your browser</caption>");
    expect(html.match(/<th scope="col">/g)?.length).toBe(3);
  });

  it("uses the singular where there is one", () => {
    expect(renderBrowserHtml("en", [row({ uses: 1 })])).toContain("1 row is listed, at 1 place in 1 file. 1 asks about your device or settings and 0 make an identifier.");
    expect(renderBrowserHtml("fr", [row({ uses: 1 })])).toContain("1 ligne figure dans la liste, à 1 endroit dans 1 fichier. 1 interroge le navigateur sur votre appareil ou vos réglages et 0 fabrique un identifiant.");
  });

  it("passes the HTML audit and the copy rules with the real list, in both languages", () => {
    for (const locale of LOCALES) {
      const html = `<section lang="${locale}">${renderBrowserHtml(locale, BROWSER_REGISTER)}</section>`;
      expect(auditHtml(html), formatViolations(auditHtml(html))).toEqual([]);
      for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
    }
  });
});

describe("the answers after the person asks", () => {
  it("show nothing about an answer until there is one", () => {
    expect(renderBrowserHtml("en", [row()])).not.toContain("data-privacy-browser-check");
  });

  it("show a table with one row for each of the six questions, in order", () => {
    const html = renderBrowserHtml("en", [row()], browserCheck(reading));
    expect(html).toContain("data-privacy-browser-check");
    expect(html).toContain("<caption>What your browser said</caption>");
    const answers = [...html.matchAll(/data-label="Answer">([^<]*)</g)].map((m) => m[1]);
    expect(answers).toEqual(["fr-CA", "No", "No", "Yes", "5 MB of 2 GB", "Unknown"]);
  });

  it("say unknown for a question with no answer, never no", () => {
    const html = renderBrowserHtml("en", [row()], browserCheck(EMPTY_BROWSER_READING));
    expect([...html.matchAll(/data-label="Answer">([^<]*)</g)].map((m) => m[1])).toEqual(Array(6).fill("Unknown"));
    expect(html).toContain("0 answers to 6 questions.");
  });

  it("say it is offline when the device says so, and list each missing answer", () => {
    const html = renderBrowserHtml("en", [row()], browserCheck(reading));
    expect(html).toContain("<li>Your device says it is offline right now.</li>");
    expect(html).toContain("<li>Whether the browser promised to keep the data: the browser gave no answer.</li>");
  });

  it("say that the answers are not saved or sent", () => {
    expect(renderBrowserHtml("en", [row()], browserCheck(reading))).toContain("are not saved or sent");
    expect(renderBrowserHtml("fr", [row()], browserCheck(reading))).toContain("ne sont ni enregistrées ni envoyées");
  });

  it("is a status region, so a screen reader says the answers when they arrive", () => {
    expect(renderBrowserHtml("en", [row()], browserCheck(reading))).toContain('<div role="status" data-privacy-browser-check>');
  });

  it("has no list when every question was answered and the device is online", () => {
    const html = renderBrowserHtml("en", [row()], browserCheck({ ...reading, online: true, persisted: true }));
    expect(html).not.toContain("<ul>");
  });

  it("escapes an answer that came from the browser", () => {
    const html = renderBrowserHtml("en", [row()], { reading: { ...reading, language: "<x>" }, answered: 6, findings: [] });
    expect(html).not.toContain("<x>");
  });

  it("pass the HTML audit and the copy rules, in both languages", () => {
    for (const locale of LOCALES) {
      for (const r of [reading, EMPTY_BROWSER_READING, { ...reading, online: true, persisted: true }]) {
        const html = `<section lang="${locale}">${renderBrowserHtml(locale, BROWSER_REGISTER, browserCheck(r))}</section>`;
        expect(auditHtml(html), formatViolations(auditHtml(html))).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
      }
    }
  });
});

describe("the summary", () => {
  const c = (over: Partial<ReturnType<typeof browserCounts>> = {}) => ({ total: 3, uses: 4, files: 3, questions: 2, identifiers: 1, ...over });

  it("says the numbers in English", () => {
    expect(BROWSER_STRINGS.en.summary(c())).toBe("3 rows are listed, at 4 places in 3 files. 2 ask about your device or settings and 1 makes an identifier.");
  });

  it("says the numbers in French, with the agreement", () => {
    expect(BROWSER_STRINGS.fr.summary(c())).toBe("3 lignes figurent dans la liste, à 4 endroits dans 3 fichiers. 2 interrogent le navigateur sur votre appareil ou vos réglages et 1 fabrique un identifiant.");
  });

  it("does not use the word verified, or its French forms", () => {
    for (const l of LOCALES) expect(BROWSER_STRINGS[l].summary(c())).not.toMatch(/verif|vérif/i);
  });
});

describe("browserAsCsv", () => {
  it("has a header, then a row for each row, in the order of kinds", () => {
    const f = browserAsCsv("en", [id(), row()], NOW);
    const lines = f.text.trimEnd().split("\r\n");
    expect(lines[0]).toBe("About,What it asks,What it is used for,In the code,Places,Recorded on");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("Language,A question asked,A use made of it,apps/web/src/a/b.ts,2,2026-11-21");
    expect(lines[2]).toContain("A random identifier,Makes an identifier");
    expect(f.count).toBe(2);
  });

  it("names the file with the local date, and says text/csv", () => {
    const f = browserAsCsv("en", [row()], NOW);
    expect(f.filename).toBe("the-app-browser-questions-2026-11-21.csv");
    expect(f.mime).toBe("text/csv");
    expect(browserAsCsv("fr", [row()], NOW).filename).toBe("l-app-questions-au-navigateur-2026-11-21.csv");
  });

  it("uses a semicolon in French when asked, and quotes a cell that holds one", () => {
    const f = browserAsCsv("fr", [row({ asks: { en: "x y", fr: "Un; deux" } })], NOW, ";");
    expect(f.text.split("\r\n")[1]).toMatch(/^Langue;"Un; deux";/);
  });

  it("protects a cell that would run as a formula", () => {
    const f = browserAsCsv("en", [row({ asks: { en: "=1+1", fr: "x y" } })], NOW);
    expect(f.text).not.toMatch(/,=1\+1/);
    expect(f.text).toContain("'=1+1");
  });

  it("gives one row per row of the real list, in both languages", () => {
    for (const l of LOCALES) {
      const f = browserAsCsv(l, BROWSER_REGISTER, NOW);
      expect(f.count).toBe(BROWSER_REGISTER.length);
      expect(f.text.trimEnd().split("\r\n")).toHaveLength(BROWSER_REGISTER.length + 1);
    }
  });

  it("is only a header for no rows, and pads the date with zeros", () => {
    expect(browserAsCsv("en", [], NOW).text.trimEnd().split("\r\n")).toHaveLength(1);
    expect(browserAsCsv("en", [row()], new Date(2026, 0, 5)).filename).toContain("2026-01-05");
  });

  it("does not include any answer from the browser", () => {
    expect(browserAsCsv("en", BROWSER_REGISTER, NOW).text).not.toMatch(/fr-CA|\b[0-9]+ MB\b/);
  });
});

describe("browserAsText", () => {
  it("starts with the title, the note and the summary", () => {
    const f = browserAsText("en", [row()], NOW);
    expect(f.text.startsWith(`${BROWSER_STRINGS.en.fileTitle}\n\n${BROWSER_STRINGS.en.note}\n\n${BROWSER_STRINGS.en.summary(browserCounts([row()]))}\n`)).toBe(true);
    expect(f.mime).toBe("text/plain");
    expect(f.filename).toBe("the-app-browser-questions-2026-11-21.txt");
  });

  it("gives each row's lines", () => {
    expect(browserAsText("en", [row()], NOW).text).toContain("A question asked\n  About: Language\n  What it is used for: A use made of it\n  In the code: apps/web/src/a/b.ts\n  Places: 2\n  Recorded on: 2026-11-21\n");
  });

  it("uses a no-break space before the colon in French", () => {
    const f = browserAsText("fr", [row()], NOW);
    expect(f.text).toContain("  Sujet : Langue");
    expect(f.text).not.toMatch(/[^\u00A0\u202F] :/);
  });

  it("ends with a newline, and has no summary for no rows", () => {
    const f = browserAsText("en", [], NOW);
    expect(f.text.endsWith("\n")).toBe(true);
    expect(f.text).not.toContain("rows are listed");
    expect(f.count).toBe(0);
  });

  it("has one block for each row of the real list", () => {
    for (const l of LOCALES) {
      const f = browserAsText(l, BROWSER_REGISTER, NOW);
      expect(f.count).toBe(BROWSER_REGISTER.length);
      expect(f.text.match(/(?:apps\/web|packages\/[a-z-]+)\/src\//g)?.length).toBe(BROWSER_REGISTER.length);
    }
  });

  it("passes the copy rules in both languages", () => {
    for (const l of LOCALES) for (const t of [BROWSER_STRINGS[l].note, BROWSER_STRINGS[l].heading, BROWSER_STRINGS[l].caption, BROWSER_STRINGS[l].checkNote]) expect(lintCopy(l, t), t).toEqual([]);
  });
});
