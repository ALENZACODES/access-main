import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { rawTexts } from "../audit/rawTexts";
import { lintCopy, type Locale } from "./copyLint";
import { checkAddress } from "./queryLive";
import { QUERY_KIND_LABELS, QUERY_STRINGS, queryAsCsv, queryAsText, queryText, renderQueryHtml } from "./querySection";
import { QUERY_KINDS, QUERY_REGISTER, RUN_TIME_NAME, queryCounts, rowForName, type QueryRow } from "./queryRegister";

const NOW = new Date(2026, 10, 21, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];
const row = (over: Partial<QueryRow> = {}): QueryRow => ({
  name: "q",
  kind: "typed",
  holds: { en: "Words you typed", fr: "Des mots saisis" },
  places: [{ path: "apps/web/src/a.ts", reads: 1, builds: 1 }],
  limits: [],
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});

describe("the labels", () => {
  it("has a label for every kind in both languages", () => {
    for (const l of LOCALES) for (const k of QUERY_KINDS) expect(QUERY_KIND_LABELS[l][k].trim(), `${l} ${k}`).not.toBe("");
  });
  it("passes the copy lint", () => {
    for (const l of LOCALES) for (const k of QUERY_KINDS) expect(lintCopy(l, QUERY_KIND_LABELS[l][k]), `${l} ${k}`).toEqual([]);
  });
});

describe("the summary", () => {
  const counts = (over: Partial<ReturnType<typeof queryCounts>> = {}) => ({ names: 29, runTime: 3, places: 56, files: 16, built: 13, personal: 6, personalBuilt: 1, ...over });
  it("says how many names, how many are built into links and how many are personal", () => {
    expect(QUERY_STRINGS.en.summary(counts())).toBe("29 names are listed, and 3 rows cover names built at run time. 13 are put into links the App builds. 6 hold a place, typed words or picked places, and 1 of those is put into links.");
  });
  it("uses the singular where a count is one", () => {
    expect(QUERY_STRINGS.en.summary(counts({ names: 1, runTime: 1, built: 1, personal: 1, personalBuilt: 1 }))).toBe("1 name is listed, and 1 row covers names built at run time. 1 is put into links the App builds. 1 holds a place, typed words or picked places, and 1 of those is put into links.");
  });
  it("leaves out the run-time part when there is none", () => {
    expect(QUERY_STRINGS.en.summary(counts({ runTime: 0 }))).toContain("29 names are listed. 13 are");
  });
  it("says it in French with the agreements", () => {
    expect(QUERY_STRINGS.fr.summary(counts())).toBe("29 noms figurent dans la liste, et 3 lignes couvrent des noms construits à l’exécution. 13 sont placés dans les liens que l’App construit. 6 contiennent un lieu, des mots saisis ou des lieux choisis, et 1 de ceux-ci est placé dans des liens.");
    expect(QUERY_STRINGS.fr.summary(counts({ names: 1, runTime: 1, built: 1, personal: 1, personalBuilt: 0 }))).toBe("1 nom figure dans la liste, et 1 ligne couvre des noms construits à l’exécution. 1 est placé dans les liens que l’App construit. 1 contient un lieu, des mots saisis ou des lieux choisis, et 0 de ceux-ci est placé dans des liens.");
  });
  it("passes the copy lint for several counts", () => {
    for (const l of LOCALES) for (const c of [counts(), counts({ names: 1, runTime: 0, built: 0, personal: 0, personalBuilt: 0 })]) expect(lintCopy(l, QUERY_STRINGS[l].summary(c)), l).toEqual([]);
  });
});

describe("queryText", () => {
  it("says a name is read when no place builds it, built when none reads it, and both otherwise", () => {
    const only = (reads: number, builds: number) => queryText("en", row({ places: [{ path: "apps/web/src/a.ts", reads, builds }] })).does;
    expect(only(1, 0)).toBe("Reads it from a link you open.");
    expect(only(0, 1)).toBe("Puts it into links it builds.");
    expect(only(1, 1)).toBe("Reads it from a link you open and puts it into links it builds.");
  });
  it("counts a read in one file and a build in another as both", () => {
    const r = row({ places: [{ path: "apps/web/src/a.ts", reads: 1, builds: 0 }, { path: "apps/web/src/b.ts", reads: 0, builds: 1 }] });
    expect(queryText("en", r).does).toContain("and puts it into links");
  });
  it("gives the limit in characters, or says none was found", () => {
    const limit = { max: 100, appliesTo: "apps/web/src/a.ts", from: { path: "apps/web/src/a.ts", name: "MAX_QUERY_LENGTH" } };
    expect(queryText("en", row({ limits: [limit] })).length).toBe("100 characters");
    expect(queryText("en", row({ limits: [{ ...limit, max: 1 }] })).length).toBe("1 character");
    expect(queryText("fr", row({ limits: [limit] })).length).toBe("100 caractères");
    expect(queryText("en", row()).length).toBe("No limit found in the code.");
    expect(queryText("fr", row()).length).toBe("Aucune limite trouvée dans le code.");
  });
  it("shows a run-time row as built at run time, with the names it can take", () => {
    const t = queryText("en", rowForName(QUERY_REGISTER, "stale_places")!);
    expect(t.name).toBe("Built at run time");
    expect(t.holds).toContain("Names it can take: stale_places, stale_routes, stale_transit, stale_boundaries, stale_reference.");
    expect(queryText("fr", rowForName(QUERY_REGISTER, "licence")!).holds).toContain("Noms possibles : source, licence, tier, age.");
  });
  it("says a run-time row with no list has names set by other functions", () => {
    const t = queryText("en", row({ name: RUN_TIME_NAME }));
    expect(t.holds.endsWith("The names are set by other functions and are not listed here.")).toBe(true);
    expect(queryText("fr", row({ name: RUN_TIME_NAME })).holds).toContain("fixés par d’autres fonctions");
  });
  it("gives the kind as its label", () => {
    expect(queryText("en", row({ kind: "place" })).kind).toBe("A place");
    expect(queryText("fr", row({ kind: "ids" })).kind).toBe("Des lieux choisis");
  });
});

describe("renderQueryHtml", () => {
  it("is empty when there are no rows", () => {
    for (const l of LOCALES) expect(renderQueryHtml(l, [])).toBe("");
  });
  it("has a titled group, the note, the summary, a captioned table and three buttons", () => {
    const html = renderQueryHtml("en", QUERY_REGISTER);
    expect(html).toContain('data-privacy-query role="group" aria-labelledby="privacy-query-title"');
    expect(html).toContain('<h3 id="privacy-query-title">What a web address can carry</h3>');
    expect(html).toContain("<caption>Names in a web address, what they hold and what the App does with them</caption>");
    expect(html).toContain("29 names are listed");
    for (const a of ["check-query", "export-query-csv", "export-query-text"]) expect(html).toContain(`data-action="${a}"`);
  });
  it("has a row header and a label for every cell, so a narrow screen can show each one", () => {
    const html = renderQueryHtml("en", [row()]);
    expect(html).toContain('<th scope="row"><span data-label="Name">q</span></th>');
    expect(html).toContain('<td><span data-label="What it holds">Words you typed</span></td>');
    expect(html).toContain('<td><span data-label="Longest value read">No limit found in the code.</span></td>');
    expect(html.match(/<th scope="col">/g)).toHaveLength(5);
  });
  it("leaves out the check button when the page cannot read its own address", () => {
    const html = renderQueryHtml("en", QUERY_REGISTER, null, false);
    expect(html).not.toContain('data-action="check-query"');
    expect(html).toContain('data-action="export-query-csv"');
  });
  it("shows the result of a check with its summary and a list, and none before", () => {
    expect(renderQueryHtml("en", QUERY_REGISTER)).not.toContain("data-privacy-query-check");
    const html = renderQueryHtml("en", QUERY_REGISTER, checkAddress(QUERY_REGISTER, "?near=1,2&zzz=1"));
    expect(html).toContain('<div role="status" data-privacy-query-check>');
    expect(html).toContain("Read 2 parameters from the address of this page. 2 things to report.");
    expect(html.match(/<li>/g)).toHaveLength(2);
  });
  it("shows a check with nothing found as a summary and no list", () => {
    const html = renderQueryHtml("en", QUERY_REGISTER, checkAddress(QUERY_REGISTER, ""));
    expect(html).toContain("The address of this page has no parameters.");
    expect(html).not.toContain("<ul>");
  });
  it("escapes what it is given", () => {
    const html = renderQueryHtml("en", [row({ name: "q", holds: { en: "<img src=x onerror=1>", fr: "x" } })], checkAddress([row()], "?<b>=1"));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;img");
  });
  it("has the same shape in both languages", () => {
    const shape = (l: Locale): string => renderQueryHtml(l, QUERY_REGISTER).replace(/="[^"]*"/g, "").replace(/>[^<]*</g, "><");
    expect(shape("fr")).toBe(shape("en"));
  });
  it("passes the HTML audit, the copy lint and the wording rules in both languages", () => {
    for (const l of LOCALES) {
      const html = `<section lang="${l}">${renderQueryHtml(l, QUERY_REGISTER, checkAddress(QUERY_REGISTER, "?near=1,2&q=x&zzz=1"))}</section>`;
      const v = auditHtml(html);
      expect(v, formatViolations(v)).toEqual([]);
      for (const t of rawTexts(html)) expect(lintCopy(l, t), t).toEqual([]);
      expect(html).not.toMatch(/verified|vérif|\bsafe|\bsecure|sécuris|\bprivate|privé/i);
    }
  });
  it("gives each button a 44 px target", () => {
    expect(renderQueryHtml("en", [row()]).match(/min-width:44px;min-height:44px/g)).toHaveLength(3);
  });
  it("says a place or typed words travel with the link, and that what a browser keeps is not known", () => {
    const html = renderQueryHtml("en", [row()]);
    expect(html).toContain("travel with the link wherever it is copied or sent");
    expect(html).toContain("is outside the App and is not known here");
  });
});

describe("queryAsCsv", () => {
  it("has the heading row, then one row per name, with CRLF line ends", () => {
    const f = queryAsCsv("en", QUERY_REGISTER, NOW, ",");
    const lines = f.text.split("\r\n");
    expect(lines[0]).toBe("Name in the address,What it holds,Kind,What the App does,Longest value read,Where in the code,Recorded on");
    expect(lines).toHaveLength(QUERY_REGISTER.length + 2);
    expect(lines.at(-1)).toBe("");
    expect(f).toMatchObject({ mime: "text/csv", count: QUERY_REGISTER.length, filename: "the-app-web-address-names-2026-11-21.csv" });
  });
  it("uses a semicolon and French headings in French", () => {
    const f = queryAsCsv("fr", QUERY_REGISTER, NOW, ";");
    expect(f.text.split("\r\n")[0]).toBe("Nom dans l’adresse;Ce qu’il contient;Type;Ce que l’App en fait;Plus longue valeur lue;Endroits dans le code;Date d’inscription");
    expect(f.filename).toBe("l-app-noms-de-l-adresse-web-2026-11-21.csv");
  });
  it("writes one name, its kind, what the App does, the limit, the files and the date", () => {
    const line = queryAsCsv("en", [row({ limits: [{ max: 100, appliesTo: "apps/web/src/a.ts", from: { path: "apps/web/src/a.ts", name: "MAX_X" } }] })], NOW).text.split("\r\n")[1];
    expect(line).toBe("q,Words you typed,Typed words,Reads it from a link you open and puts it into links it builds.,100 characters,apps/web/src/a.ts,2026-11-21");
  });
  it("lists every file of a name with a bar between them", () => {
    const r = row({ places: [{ path: "apps/web/src/a.ts", reads: 1, builds: 0 }, { path: "apps/web/src/b.ts", reads: 1, builds: 0 }] });
    expect(queryAsCsv("en", [r], NOW).text).toContain("apps/web/src/a.ts | apps/web/src/b.ts");
  });
  it("quotes a cell with the delimiter or a quotation mark, and defuses a formula", () => {
    const f = queryAsCsv("en", [row({ holds: { en: '=1+1, "b"', fr: "x" } })], NOW);
    expect(f.text).toMatch(/"'=1\+1, ""b"""/);
  });
  it("is just the heading for no rows", () => {
    expect(queryAsCsv("en", [], NOW).text).toBe("Name in the address,What it holds,Kind,What the App does,Longest value read,Where in the code,Recorded on\r\n");
    expect(queryAsCsv("en", [], NOW).count).toBe(0);
  });
  it("dates the file by the local day", () => {
    expect(queryAsCsv("en", [], new Date(2026, 0, 5, 23, 59)).filename).toBe("the-app-web-address-names-2026-01-05.csv");
  });
});

describe("queryAsText", () => {
  it("has a title, the note, the summary and a block for each name", () => {
    const f = queryAsText("en", QUERY_REGISTER, NOW);
    expect(f.text.split("\n")[0]).toBe("What a web address can carry");
    expect(f.text).toContain("29 names are listed");
    expect(f.text).toContain("near\n  A point on the map, as latitude and longitude in one value\n  Kind: A place");
    expect(f.text).toContain("Where in the code: apps/web/src/states/geo.ts");
    expect(f.text.endsWith("\n")).toBe(true);
    expect(f.text.includes("\r")).toBe(false);
    expect(f).toMatchObject({ mime: "text/plain", count: QUERY_REGISTER.length, filename: "the-app-web-address-names-2026-11-21.txt" });
  });
  it("puts a no-break space before each colon in French, and none in English", () => {
    expect(queryAsText("fr", QUERY_REGISTER, NOW).text).toContain("Type : Un lieu");
    expect(queryAsText("en", QUERY_REGISTER, NOW).text).not.toContain(" :");
  });
  it("has no trailing spaces and passes the copy lint line by line", () => {
    for (const l of LOCALES) {
      for (const line of queryAsText(l, QUERY_REGISTER, NOW).text.split("\n")) {
        expect(line).toBe(line.trimEnd());
        if (line.trim() !== "" && !/^\s+(Where in the code|Endroits dans le code)/.test(line)) expect(lintCopy(l, line.trim()), line).toEqual([]);
      }
    }
  });
  it("leaves out the summary for no rows", () => {
    const f = queryAsText("en", [], NOW);
    expect(f.count).toBe(0);
    expect(f.text).not.toContain("names are listed");
  });
});
