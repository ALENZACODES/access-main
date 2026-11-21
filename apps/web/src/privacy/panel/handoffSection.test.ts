import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { rawTexts } from "../audit/rawTexts";
import { lintCopy, type Locale } from "./copyLint";
import { HANDOFF_REGISTER, handoffCounts, type HandoffRow, type SchemeId } from "./handoffRegister";
import { HANDOFF_STRINGS, SCHEME_LABELS, handoffAsCsv, handoffAsText, renderHandoffHtml } from "./handoffSection";

const NOW = new Date(2026, 10, 20, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];
const row = (over: Partial<HandoffRow> = {}): HandoffRow => ({ scheme: "tel", path: "apps/web/src/a.ts", uses: 1, opens: { en: "Phone", fr: "Téléphone" }, carries: { en: "A number", fr: "Un numéro" }, source: "s", recordedOn: "2026-11-20", ...over });

describe("the labels", () => {
  it("has a label in both languages for every kind of link", () => {
    const ids: SchemeId[] = ["mailto", "tel", "sms", "geo", "webcal", "maps", "intent", "whatsapp", "facetime", "navigation"];
    expect(Object.keys(SCHEME_LABELS).sort()).toEqual([...ids].sort());
    for (const id of ids) for (const l of LOCALES) expect(SCHEME_LABELS[id][l].trim(), `${id} ${l}`).not.toBe("");
  });
  it("passes the copy lint in both languages", () => {
    for (const id of Object.keys(SCHEME_LABELS) as SchemeId[]) for (const l of LOCALES) expect(lintCopy(l, SCHEME_LABELS[id][l]), `${id} ${l}`).toEqual([]);
  });
});

describe("the summary", () => {
  const s = (l: Locale, c: Parameters<(typeof HANDOFF_STRINGS)["en"]["summary"]>[0]): string => HANDOFF_STRINGS[l].summary(c);
  it("says how many links, places and files", () => {
    expect(s("en", { total: 3, uses: 3, schemes: 3, files: 3 })).toBe("3 links are listed, at 3 places in 3 files.");
    expect(s("fr", { total: 3, uses: 3, schemes: 3, files: 3 })).toBe("3 liens figurent dans la liste, à 3 endroits dans 3 fichiers.");
  });
  it("uses the singular for one", () => {
    expect(s("en", { total: 1, uses: 1, schemes: 1, files: 1 })).toBe("1 link is listed, in 1 place in 1 file.");
    expect(s("fr", { total: 1, uses: 1, schemes: 1, files: 1 })).toBe("1 lien figure dans la liste, à 1 endroit dans 1 fichier.");
  });
  it("uses the French singular for zero, as French does", () => {
    expect(s("fr", { total: 0, uses: 0, schemes: 0, files: 0 })).toBe("0 lien figure dans la liste, à 0 endroit dans 0 fichier.");
  });
});

describe("renderHandoffHtml", () => {
  it("renders nothing for no rows", () => {
    for (const l of LOCALES) expect(renderHandoffHtml(l, [])).toBe("");
  });
  it("has a labelled group, a caption, three column headings and a row heading for each row", () => {
    const html = renderHandoffHtml("en", [row(), row({ scheme: "geo" })]);
    expect(html).toContain('data-privacy-handoff role="group" aria-labelledby="privacy-handoff-title"');
    expect(html).toContain("<caption>Links that open another app</caption>");
    expect(html.match(/<th scope="col">/g)).toHaveLength(3);
    expect(html.match(/<th scope="row">/g)).toHaveLength(2);
  });
  it("labels each cell with its column, for the narrow layout", () => {
    const html = renderHandoffHtml("en", [row()]);
    expect(html).toContain('<span data-label="What it is">Phone call</span>');
    expect(html).toContain('<span data-label="What opens">Phone</span>');
    expect(html).toContain('<span data-label="What the App passes on">A number</span>');
  });
  it("says it starts only when a link is tapped, and does not claim to know what happens next", () => {
    const html = renderHandoffHtml("en", [row()]);
    expect(html).toContain("starts only when you tap a link");
    expect(html).toContain("does not see what happens next");
  });
  it("has the two download buttons", () => {
    const html = renderHandoffHtml("fr", [row()]);
    expect(html).toContain('data-action="export-handoff-csv"');
    expect(html).toContain('data-action="export-handoff-text"');
    expect(html).toContain("Télécharger cette liste (texte)");
  });
  it("escapes text", () => {
    const html = renderHandoffHtml("en", [row({ opens: { en: "<img src=x onerror=1>", fr: "x" } })]);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
  it("is the same shape in both languages for the real register", () => {
    const shape = (l: Locale): string => renderHandoffHtml(l, HANDOFF_REGISTER).replace(/="[^"]*"/g, "").replace(/>[^<]*</g, "><");
    expect(shape("en")).toBe(shape("fr"));
  });
  it("passes the HTML audit and the copy lint in both languages for the real register", () => {
    for (const l of LOCALES) {
      const html = renderHandoffHtml(l, HANDOFF_REGISTER);
      const v = auditHtml(`<section lang="${l}">${html}</section>`);
      expect(v, formatViolations(v)).toEqual([]);
      for (const t of rawTexts(html)) expect(lintCopy(l, t), t).toEqual([]);
    }
  });
  it("never says verified, safe, private or secure", () => {
    for (const l of LOCALES) expect(renderHandoffHtml(l, HANDOFF_REGISTER)).not.toMatch(/verified|vérif|\bsafe|\bsecure|sécuris|\bprivate|privé/i);
  });
  it("gives each download button a 44 px target", () => {
    expect(renderHandoffHtml("en", [row()]).match(/min-width:44px;min-height:44px/g)).toHaveLength(2);
  });
});

describe("handoffAsCsv", () => {
  it("has the heading row, then one row per link, with CRLF line ends", () => {
    const f = handoffAsCsv("en", HANDOFF_REGISTER, NOW, ",");
    const lines = f.text.split("\r\n");
    expect(lines[0]).toBe("What it is,What opens,What the App passes on,Where in the code,Places,Recorded on");
    expect(lines).toHaveLength(HANDOFF_REGISTER.length + 2);
    expect(lines.at(-1)).toBe("");
    expect(f).toMatchObject({ mime: "text/csv", count: 3, filename: "the-app-links-to-other-apps-2026-11-20.csv" });
  });
  it("uses a semicolon and French headings in French", () => {
    const f = handoffAsCsv("fr", HANDOFF_REGISTER, NOW, ";");
    expect(f.text.split("\r\n")[0]).toBe("De quoi il s’agit;Ce qui s’ouvre;Ce que l’App transmet;Où dans le code;Endroits;Date d’inscription");
    expect(f.filename).toBe("l-app-liens-vers-d-autres-applications-2026-11-20.csv");
  });
  it("writes the kind as a label, the path and the number of places", () => {
    const line = handoffAsCsv("en", [row({ uses: 4 })], NOW).text.split("\r\n")[1];
    expect(line).toBe("Phone call,Phone,A number,apps/web/src/a.ts,4,2026-11-20");
  });
  it("quotes a cell with the delimiter or a quotation mark, and defuses a formula", () => {
    const f = handoffAsCsv("en", [row({ opens: { en: 'a, "b"', fr: "x" }, carries: { en: "=1+1", fr: "x" } })], NOW);
    expect(f.text).toContain('"a, ""b"""');
    expect(f.text).toMatch(/'=1\+1|"'=1\+1"/);
  });
  it("is just the heading for no rows", () => {
    expect(handoffAsCsv("en", [], NOW).text).toBe("What it is,What opens,What the App passes on,Where in the code,Places,Recorded on\r\n");
  });
});

describe("handoffAsText", () => {
  it("has a title, the note, the summary and a block for each link", () => {
    const f = handoffAsText("en", HANDOFF_REGISTER, NOW);
    const lines = f.text.split("\n");
    expect(lines[0]).toBe("Links that open another app");
    expect(f.text).toContain("3 links are listed, at 3 places in 3 files.");
    expect(f.text).toContain("Email\n  What opens: Your email app");
    expect(f.text).toContain("Where in the code: apps/web/src/states/geo.ts");
    expect(f.text.endsWith("\n")).toBe(true);
    expect(f.text.includes("\r")).toBe(false);
    expect(f).toMatchObject({ mime: "text/plain", count: 3, filename: "the-app-links-to-other-apps-2026-11-20.txt" });
  });
  it("puts a no-break space before each colon in French, and none in English", () => {
    expect(handoffAsText("fr", HANDOFF_REGISTER, NOW).text).toContain("Ce qui s’ouvre : Votre application de courriel");
    expect(handoffAsText("en", HANDOFF_REGISTER, NOW).text).not.toContain(" :");
  });
  it("has no trailing spaces and passes the copy lint line by line", () => {
    for (const l of LOCALES) {
      for (const line of handoffAsText(l, HANDOFF_REGISTER, NOW).text.split("\n")) {
        expect(line).toBe(line.trimEnd());
        if (line.trim() !== "" && !/^\s+(Where in the code|Où dans le code)/.test(line)) expect(lintCopy(l, line.trim()), line).toEqual([]);
      }
    }
  });
  it("leaves out the summary for no rows", () => {
    const f = handoffAsText("en", [], NOW);
    expect(f.count).toBe(0);
    expect(f.text).not.toContain("are listed");
  });
});

describe("the counts shown", () => {
  it("are the counts of the rows given", () => {
    expect(handoffCounts(HANDOFF_REGISTER).total).toBe(3);
    expect(renderHandoffHtml("en", HANDOFF_REGISTER)).toContain("3 links are listed, at 3 places in 3 files.");
  });
});
