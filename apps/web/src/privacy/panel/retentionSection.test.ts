import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { rawTexts } from "../audit/rawTexts";
import { lintCopy, type Locale } from "./copyLint";
import { RETENTION_REGISTER, retentionCounts, type Limit, type RetentionRow } from "./retentionRegister";
import { RETENTION_STRINGS, formatBytes, renderRetentionHtml, retentionAsCsv, retentionAsText, retentionText } from "./retentionSection";

const NOW = new Date(2026, 10, 20, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];
const ref = { path: "apps/web/src/a.ts", name: "N" };
const row = (limits: RetentionRow["limits"], over: Partial<RetentionRow> = {}): RetentionRow => ({ key: "app.a.v1", holds: { en: "Saved things", fr: "Choses enregistrées" }, files: ["apps/web/src/a.ts"], limits, source: "s", recordedOn: "2026-11-20", ...over });
const days = (n: number): Limit => ({ kind: "days", days: n, from: ref });
const count = (n: number, full: "oldest-removed" | "new-refused" = "new-refused"): Limit => ({ kind: "count", max: n, unit: { en: "places", fr: "lieux" }, whenFull: full, from: ref });
const bytes = (n: number): Limit => ({ kind: "bytes", max: n, about: { en: "map tiles", fr: "tuiles de carte" }, whenFull: "oldest-removed", from: ref });

describe("formatBytes", () => {
  it("writes whole megabytes, kilobytes and bytes, with a no-break space before the unit", () => {
    expect(formatBytes("en", 50 * 1024 * 1024)).toBe("50 MB");
    expect(formatBytes("en", 2048)).toBe("2 KB");
    expect(formatBytes("en", 900)).toBe("900 bytes");
  });
  it("writes one decimal for a part of a unit, with a comma in French", () => {
    expect(formatBytes("en", 1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes("fr", 1.5 * 1024 * 1024)).toBe("1,5 Mo");
    expect(formatBytes("fr", 3 * 1024)).toBe("3 Ko");
    expect(formatBytes("fr", 12)).toBe("12 octets");
  });
  it("changes unit at exactly one kilobyte and one megabyte", () => {
    expect(formatBytes("en", 1023)).toBe("1023 bytes");
    expect(formatBytes("en", 1024)).toBe("1 KB");
    expect(formatBytes("en", 1024 * 1024 - 1)).toContain("KB");
    expect(formatBytes("en", 1024 * 1024)).toBe("1 MB");
  });
});

describe("retentionText", () => {
  it("says no end date and no size limit were found, in those words, for a row with no limits", () => {
    expect(retentionText("en", row([]))).toEqual({ how: "No end date found in the code.", size: "No limit on how many or how much found in the code." });
    expect(retentionText("fr", row([]))).toEqual({ how: "Aucune date de fin trouvée dans le code.", size: "Aucune limite de nombre ou de taille trouvée dans le code." });
  });
  it("says how many days, with the singular for one", () => {
    expect(retentionText("en", row([days(90)])).how).toBe("Expires 90 days after the latest save.");
    expect(retentionText("en", row([days(1)])).how).toBe("Expires 1 day after the latest save.");
    expect(retentionText("fr", row([days(30)])).how).toBe("Expire 30 jours après la dernière sauvegarde.");
    expect(retentionText("fr", row([days(1)])).how).toBe("Expire 1 jour après la dernière sauvegarde.");
  });
  it("says what happens when a count limit is reached", () => {
    expect(retentionText("en", row([count(12)])).size).toBe("Up to 12 places. When full, new ones are refused.");
    expect(retentionText("en", row([count(30, "oldest-removed")])).size).toBe("Up to 30 places. When full, the oldest are removed.");
    expect(retentionText("fr", row([count(12)])).size).toBe("Jusqu’à 12 lieux. Quand la limite est atteinte, les nouveaux éléments sont refusés.");
    expect(retentionText("fr", row([count(30, "oldest-removed")])).size).toContain("les éléments les plus anciens sont retirés");
  });
  it("says a size limit in plain units, and says both limits when a row has both", () => {
    expect(retentionText("en", row([bytes(50 * 1024 * 1024)])).size).toBe("Up to 50 MB of map tiles. When full, the oldest are removed.");
    expect(retentionText("fr", row([bytes(50 * 1024 * 1024)])).size).toBe("Jusqu’à 50 Mo de tuiles de carte. Quand la limite est atteinte, les éléments les plus anciens sont retirés.");
    expect(retentionText("en", row([count(5), bytes(4096)])).size).toBe("Up to 5 places. When full, new ones are refused. Up to 4 KB of map tiles. When full, the oldest are removed.");
  });
  it("says a time limit and a count limit separately in their own columns", () => {
    const t = retentionText("en", row([days(30), count(50, "oldest-removed")]));
    expect(t.how).toBe("Expires 30 days after the latest save.");
    expect(t.size).toBe("Up to 50 places. When full, the oldest are removed.");
  });
  it("says Unknown, never none, for a store that could not be read", () => {
    expect(retentionText("en", row("UNKNOWN", { key: "UNKNOWN" }))).toEqual({ how: "Unknown", size: "Unknown" });
    expect(retentionText("fr", row("UNKNOWN", { key: "UNKNOWN" }))).toEqual({ how: "Inconnu", size: "Inconnu" });
  });
});

describe("the summary", () => {
  const s = (l: Locale, c: Parameters<(typeof RETENTION_STRINGS)["en"]["summary"]>[0]): string => RETENTION_STRINGS[l].summary(c);
  it("states each count in a sentence of its own, and leaves out the unreadable sentence when there are none", () => {
    expect(s("en", { total: 16, timed: 3, capped: 7, none: 6, unknown: 0 })).toBe("16 stored items are listed. 3 expire after a set number of days. 7 have a limit on how many or how much. For 6, no limit of either kind was found in the code.");
    expect(s("en", { total: 16, timed: 3, capped: 7, none: 5, unknown: 1 })).toMatch(/ 1 could not be read\.$/);
  });
  it("uses the singular for one, in English and in French", () => {
    expect(s("en", { total: 1, timed: 1, capped: 1, none: 0, unknown: 1 })).toBe("1 stored item is listed. 1 expires after a set number of days. 1 has a limit on how many or how much. For 0, no limit of either kind was found in the code. 1 could not be read.");
    expect(s("fr", { total: 1, timed: 1, capped: 1, none: 0, unknown: 1 })).toBe("1 élément conservé figure dans la liste. 1 expire après un nombre de jours fixé. 1 a une limite de nombre ou de taille. Pour 0, aucune limite de l’un ou l’autre type n’a été trouvée dans le code. 1 n’a pas pu être lu.");
  });
  it("uses the plural for French zero... as singular, as French does", () => {
    expect(s("fr", { total: 0, timed: 0, capped: 0, none: 0, unknown: 0 })).toContain("0 élément conservé figure");
    expect(s("fr", { total: 2, timed: 2, capped: 2, none: 0, unknown: 2 })).toContain("2 éléments conservés figurent");
    expect(s("fr", { total: 2, timed: 2, capped: 2, none: 0, unknown: 2 })).toContain("2 n’ont pas pu être lus");
  });
});

describe("renderRetentionHtml", () => {
  it("renders nothing for no rows", () => {
    for (const l of LOCALES) expect(renderRetentionHtml(l, [])).toBe("");
  });
  it("has a labelled group, a table with a caption and three column headings, and a row heading for each row", () => {
    const html = renderRetentionHtml("en", [row([days(5)]), row([], { key: "app.b.v1", holds: { en: "Other", fr: "Autre" } })]);
    expect(html).toContain('data-privacy-retention role="group" aria-labelledby="privacy-retention-title"');
    expect(html).toContain("<caption>What is kept, how long and how much</caption>");
    expect(html.match(/<th scope="col">/g)).toHaveLength(3);
    expect(html.match(/<th scope="row">/g)).toHaveLength(2);
  });
  it("labels every cell with its column, for the narrow layout", () => {
    const html = renderRetentionHtml("en", [row([days(5)])]);
    expect(html).toContain('<span data-label="How long">Expires 5 days after the latest save.</span>');
    expect(html).toContain('<span data-label="What is kept">Saved things</span>');
  });
  it("shows the summary and the two download buttons", () => {
    const html = renderRetentionHtml("fr", [row([days(5)])]);
    expect(html).toContain("1 élément conservé figure dans la liste.");
    expect(html).toContain('data-action="export-retention-csv"');
    expect(html).toContain('data-action="export-retention-text"');
    expect(html).toContain("Télécharger cette liste (CSV)");
  });
  it("explains the unknown row only when there is one", () => {
    expect(renderRetentionHtml("en", [row([])])).not.toContain("outside what could be read");
    expect(renderRetentionHtml("en", [row("UNKNOWN", { key: "UNKNOWN" })])).toContain("outside what could be read");
  });
  it("escapes text", () => {
    const html = renderRetentionHtml("en", [row([], { holds: { en: "<img src=x onerror=1>", fr: "x" } })]);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
  it("is the same shape in both languages for the real register", () => {
    const shape = (l: Locale): string => renderRetentionHtml(l, RETENTION_REGISTER).replace(/="[^"]*"/g, "").replace(/>[^<]*</g, "><");
    expect(shape("en")).toBe(shape("fr"));
  });
  it("passes the HTML audit and the copy lint in both languages, for the real register", () => {
    for (const l of LOCALES) {
      const html = renderRetentionHtml(l, RETENTION_REGISTER);
      const v = auditHtml(`<section lang="${l}">${html}</section>`);
      expect(v, formatViolations(v)).toEqual([]);
      for (const t of rawTexts(html)) expect(lintCopy(l, t), t).toEqual([]);
    }
  });
  it("never says verified, guaranteed or a word for it, and never claims something is deleted", () => {
    for (const l of LOCALES) expect(renderRetentionHtml(l, RETENTION_REGISTER)).not.toMatch(/verified|vérif|guarantee|garanti|deleted|supprimé/i);
  });
});

describe("retentionAsCsv", () => {
  it("has the heading row, then one row per store, with CRLF line ends", () => {
    const f = retentionAsCsv("en", RETENTION_REGISTER, NOW, ",");
    const lines = f.text.split("\r\n");
    expect(lines[0]).toBe("Stored under,What is kept,How long,How much,Files read,Recorded on");
    expect(lines).toHaveLength(RETENTION_REGISTER.length + 2);
    expect(lines.at(-1)).toBe("");
    expect(f.count).toBe(RETENTION_REGISTER.length);
    expect(f.mime).toBe("text/csv");
    expect(f.filename).toBe("the-app-how-long-kept-2026-11-20.csv");
  });
  it("uses a semicolon and French headings in French", () => {
    const f = retentionAsCsv("fr", RETENTION_REGISTER, NOW, ";");
    expect(f.text.split("\r\n")[0]).toBe("Enregistré sous;Ce qui est gardé;Combien de temps;Quelle quantité;Fichiers lus;Date d’inscription");
    expect(f.filename).toBe("l-app-duree-de-conservation-2026-11-20.csv");
  });
  it("quotes a cell that holds the delimiter, a quotation mark or a line break, and defuses a formula", () => {
    const f = retentionAsCsv("en", [row([], { holds: { en: 'a, "b"\nc', fr: "x" }, files: ["apps/web/src/a.ts", "apps/web/src/b.ts"] }), row([], { holds: { en: "=1+1", fr: "x" } })], NOW, ",");
    expect(f.text).toContain('"a, ""b""\nc"');
    expect(f.text).toContain("apps/web/src/a.ts | apps/web/src/b.ts");
    expect(f.text).toMatch(/'=1\+1|"'=1\+1"/);
  });
  it("is just the heading for no rows", () => {
    expect(retentionAsCsv("en", [], NOW).text).toBe("Stored under,What is kept,How long,How much,Files read,Recorded on\r\n");
  });
});

describe("retentionAsText", () => {
  it("has a title, the note, the summary and a block for each store", () => {
    const f = retentionAsText("en", RETENTION_REGISTER, NOW);
    const lines = f.text.split("\n");
    expect(lines[0]).toBe("How long the App keeps things");
    expect(f.text).toContain("Stored under: access.activity.v1");
    expect(f.text).toContain("How long: Expires 90 days after the latest save.");
    expect(f.text).toContain("Stored under: UNKNOWN");
    expect(f.text.endsWith("\n")).toBe(true);
    expect(f.text.includes("\r")).toBe(false);
    expect(f.mime).toBe("text/plain");
    expect(f.count).toBe(16);
  });
  it("puts a no-break space before each colon in French and no space before it in English", () => {
    const fr = retentionAsText("fr", RETENTION_REGISTER, NOW).text;
    expect(fr).toContain("Enregistré sous : access.activity.v1");
    expect(fr).not.toMatch(/\S: \S.*\n {2}/);
    expect(retentionAsText("en", RETENTION_REGISTER, NOW).text).not.toContain(" :");
  });
  it("has no trailing spaces and passes the copy lint line by line", () => {
    for (const l of LOCALES) {
      for (const line of retentionAsText(l, RETENTION_REGISTER, NOW).text.split("\n")) {
        expect(line).toBe(line.trimEnd());
        if (line.trim() !== "" && !/^\s+(Stored under|Enregistré sous|Files read|Fichiers lus)/.test(line)) expect(lintCopy(l, line.trim()), line).toEqual([]);
      }
    }
  });
  it("says nothing about a summary for no rows", () => {
    const f = retentionAsText("en", [], NOW);
    expect(f.count).toBe(0);
    expect(f.text).not.toContain("stored items are listed");
  });
});

describe("counts shown", () => {
  it("are the counts of the rows given", () => {
    expect(retentionCounts(RETENTION_REGISTER).total).toBe(16);
    expect(renderRetentionHtml("en", RETENTION_REGISTER)).toContain("16 stored items are listed.");
  });
});
