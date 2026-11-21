import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { rawTexts } from "../audit/rawTexts";
import { lintCopy, type Locale } from "./copyLint";
import { AUTO_REGISTER, autoCounts, type AutoRow } from "./autoRegister";
import { AUTO_STRINGS, autoAsCsv, autoAsText, renderAutoHtml } from "./autoSection";

const NOW = new Date(2026, 10, 21, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];
const row = (over: Partial<AutoRow> = {}): AutoRow => ({
  kind: "timer",
  path: "apps/web/src/a/b.ts",
  uses: 2,
  effect: "runs",
  when: { en: "While waiting", fr: "Pendant l’attente" },
  does: { en: "Ends the wait", fr: "Met fin à l’attente" },
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});

describe("renderAutoHtml", () => {
  it("is empty when there are no rows", () => {
    for (const locale of LOCALES) expect(renderAutoHtml(locale, [])).toBe("");
  });
  it("shows the heading, note, summary, table and the three buttons", () => {
    const html = renderAutoHtml("en", [row(), row({ kind: "observer", effect: "reacts", path: "apps/web/src/c.tsx", uses: 1 })]);
    expect(html).toContain('<h3 id="privacy-auto-title">What the App does on its own</h3>');
    expect(html).toContain("Work started by outside libraries is not in it.");
    expect(html).toContain("2 rows are listed, at 3 places in 2 files. 1 set work going, 1 answer something that happens and 0 only ask the browser a question.");
    for (const action of ["check-workers", "export-auto-csv", "export-auto-text"]) expect(html).toContain(`data-action="${action}"`);
  });
  it("says each row in words and gives its kind of start", () => {
    const html = renderAutoHtml("en", [row()]);
    expect(html).toContain('<span data-label="What it is">Timer</span>');
    expect(html).toContain("While waiting");
    expect(html).toContain("Ends the wait (Sets work going)");
  });
  it("does not show a file name on screen, only in the downloads", () => {
    const html = renderAutoHtml("en", AUTO_REGISTER);
    expect(html).not.toContain("apps/web/src");
    expect(html).not.toMatch(/\.tsx?[<\s"]/);
  });
  it("gives each button a 44 px target", () => {
    const html = renderAutoHtml("en", [row()]);
    expect(html.match(/min-width:44px;min-height:44px/g)?.length).toBe(3);
  });
  it("orders the table by kind and then by file", () => {
    const html = renderAutoHtml("en", [row({ kind: "service-worker", path: "apps/web/src/z.ts" }), row({ kind: "timer", does: { en: "Second", fr: "b" }, path: "apps/web/src/b.ts" }), row({ kind: "timer", does: { en: "First", fr: "a" }, path: "apps/web/src/a.ts" })]);
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
    expect(html.indexOf("Second")).toBeLessThan(html.indexOf("Offline worker"));
  });
  it("shows nothing about a check until there is one", () => {
    expect(renderAutoHtml("en", [row()])).not.toContain("data-privacy-auto-check");
  });
  it("shows what the browser said, with a list for the findings", () => {
    const html = renderAutoHtml("en", [row()], { registered: 1, findings: [{ code: "registered", detail: { count: 1 } }, { code: "controls-page", detail: {} }] });
    expect(html).toContain('<div role="status" data-privacy-auto-check><p>1 offline worker registered. No differences found.</p><ul><li>1 offline worker is registered for this site.</li><li>An offline worker controls this page.</li></ul></div>');
  });
  it("counts the differences in the summary line of the check", () => {
    const html = renderAutoHtml("en", [row()], { registered: null, findings: [{ code: "unreadable", detail: {} }] });
    expect(html).toContain("Offline workers: count unknown. 1 difference found.");
  });
  it("shows a check with no findings without an empty list", () => {
    expect(renderAutoHtml("en", [row()], { registered: 0, findings: [] })).not.toContain("<ul>");
  });
  it("escapes what a row holds", () => {
    const html = renderAutoHtml("en", [row({ does: { en: '<img src=x onerror="a()"> & "q"', fr: "x" } })]);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &quot;q&quot;");
  });
  it("passes the HTML audit and the copy rules in both languages", () => {
    for (const locale of LOCALES) {
      for (const check of [null, { registered: 2, findings: [{ code: "registered" as const, detail: { count: 2 } }, { code: "unlisted" as const, detail: {} }] }, { registered: null, findings: [{ code: "unsupported" as const, detail: {} }] }]) {
        const html = `<section lang="${locale}" aria-labelledby="privacy-auto-title">${renderAutoHtml(locale, AUTO_REGISTER, check)}</section>`;
        const v = auditHtml(html);
        expect(v, formatViolations(v)).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
        expect(html).not.toMatch(/verified|vérif/i);
      }
    }
  });
});

describe("autoAsCsv", () => {
  it("writes a header and a line for each row", () => {
    const file = autoAsCsv("en", [row(), row({ kind: "frame", effect: "runs", uses: 1, path: "apps/web/src/c.tsx" })], NOW);
    expect(file.filename).toBe("the-app-work-on-its-own-2026-11-21.csv");
    expect(file.mime).toBe("text/csv");
    expect(file.count).toBe(2);
    expect(file.text.split("\r\n").slice(0, 3)).toEqual([
      "What it is,In the code,Places,Kind of start,When it runs,What it does,Recorded on",
      "Timer,apps/web/src/a/b.ts,2,Sets work going,While waiting,Ends the wait,2026-11-21",
      "Next screen refresh,apps/web/src/c.tsx,1,Sets work going,While waiting,Ends the wait,2026-11-21",
    ]);
  });
  it("uses the French header and names and a semicolon", () => {
    const file = autoAsCsv("fr", [row({ kind: "network", effect: "reacts" })], NOW, ";");
    expect(file.filename).toBe("l-app-travail-lance-d-elle-meme-2026-11-21.csv");
    expect(file.text.split("\r\n")[0]).toBe("De quoi il s’agit;Dans le code;Endroits;Type de lancement;Quand cela s’exécute;Ce que cela fait;Date d’inscription");
    expect(file.text.split("\r\n")[1]).toBe("En ligne ou hors ligne;apps/web/src/a/b.ts;2;Répond à un événement;Pendant l’attente;Met fin à l’attente;2026-11-21");
  });
  it("is only a header for no rows", () => {
    expect(autoAsCsv("en", [], NOW).text.split("\r\n").length).toBe(2);
    expect(autoAsCsv("en", [], NOW).count).toBe(0);
  });
  it("names the file from the local date, not the UTC date", () => {
    expect(autoAsCsv("en", [row()], new Date(2026, 10, 21, 23, 30, 0)).filename).toBe("the-app-work-on-its-own-2026-11-21.csv");
  });
  it("keeps words with a delimiter, a quotation mark, a line break or a formula readable", () => {
    const text = autoAsCsv("en", [row({ does: { en: 'a, "b"\n=1+1', fr: "x" } })], NOW).text;
    expect(text).toContain('"a, ""b""\n');
    expect(text).not.toMatch(/,=1\+1/);
  });
  it("lists every real row once", () => {
    expect(autoAsCsv("en", AUTO_REGISTER, NOW).count).toBe(AUTO_REGISTER.length);
  });
});

describe("autoAsText", () => {
  it("writes the title, the note, the summary and a block for each row", () => {
    const file = autoAsText("en", [row()], NOW);
    expect(file.filename).toBe("the-app-work-on-its-own-2026-11-21.txt");
    expect(file.mime).toBe("text/plain");
    expect(file.count).toBe(1);
    expect(file.text.split("\n")[0]).toBe("What the App does on its own");
    expect(file.text).toContain("Timer\n  In the code: apps/web/src/a/b.ts\n  Places: 2\n  Kind of start: Sets work going\n  When it runs: While waiting\n  What it does: Ends the wait\n  Recorded on: 2026-11-21\n");
    expect(file.text.endsWith("\n")).toBe(true);
  });
  it("puts a no-break space before each colon in French", () => {
    const text = autoAsText("fr", [row()], NOW).text;
    expect(text).toContain("  Dans le code\u00a0: apps/web/src/a/b.ts");
    expect(text).toContain("  Ce que cela fait\u00a0: Met fin à l’attente");
  });
  it("passes the copy rules for the whole real file in both languages", () => {
    for (const locale of LOCALES) {
      const file = autoAsText(locale, AUTO_REGISTER, NOW);
      expect(lintCopy(locale, file.text), file.filename).toEqual([]);
      expect(file.text).not.toMatch(/verified|vérif/i);
    }
  });
});

describe("AUTO_STRINGS", () => {
  it("has the same keys in both languages", () => {
    expect(Object.keys(AUTO_STRINGS.fr).sort()).toEqual(Object.keys(AUTO_STRINGS.en).sort());
    expect(Object.keys(AUTO_STRINGS.fr.columns).sort()).toEqual(Object.keys(AUTO_STRINGS.en.columns).sort());
  });
  it("says it is a list read from the code and leaves out outside libraries", () => {
    expect(AUTO_STRINGS.en.note).toContain("It is a list read from the code.");
    expect(AUTO_STRINGS.fr.note).toContain("C’est une liste lue dans le code.");
  });
  it("makes a summary that reads right for one and for none, in both languages", () => {
    expect(AUTO_STRINGS.en.summary({ total: 1, uses: 1, files: 1, runs: 0, reacts: 0, reads: 1 })).toBe("1 row is listed, at 1 place in 1 file. 0 set work going, 0 answer something that happens and 1 only asks the browser a question.");
    expect(AUTO_STRINGS.fr.summary({ total: 1, uses: 1, files: 1, runs: 0, reacts: 1, reads: 0 })).toBe("1 ligne figure dans la liste, à 1 endroit dans 1 fichier. 0 lance un travail, 1 répond à un événement et 0 pose seulement une question au navigateur.");
  });
  it("states the real register's counts", () => {
    const c = autoCounts(AUTO_REGISTER);
    expect(AUTO_STRINGS.en.summary(c)).toContain(`${c.total} rows are listed, at ${c.uses} places in ${c.files} files.`);
  });
});
