import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { checkParity } from "../audit/parity";
import { rawTexts } from "../audit/rawTexts";
import { lintCopy, type Locale } from "./copyLint";
import { IDENTIFIER_REGISTER } from "./identifierRegister";
import type { IdentifierRow } from "./identifierRegister";
import { IDENTIFIER_STRINGS, identifierSummary, identifiersAsCsv, identifiersAsText, renderIdentifiersHtml } from "./identifierSection";

const NOW = new Date(2026, 10, 21, 9, 0, 0);
const LOCALES: Locale[] = ["en", "fr"];
const row = (path: string, count = 1, kept: IdentifierRow["kept"] = "not-kept"): IdentifierRow => ({ path, where: { en: `Part ${path}`, fr: `Partie ${path}` }, what: { en: `Value ${path}`, fr: `Valeur ${path}` }, count, kept, recordedOn: "2026-11-21" });
const ROWS = [row("a.ts", 2, "on-device"), row("b.ts", 1, "in-copy"), row("c.ts", 1, "shown-only")];
const textOf = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("summary sentence", () => {
  it("says how many places and parts, singular and plural", () => {
    expect(IDENTIFIER_STRINGS.en.summary(1, 1, 0)).toBe("1 place in 1 part of the App makes a random value or reads a setting of your browser.");
    expect(IDENTIFIER_STRINGS.en.summary(4, 3, 0)).toBe("4 places in 3 parts of the App make a random value or read a setting of your browser.");
  });
  it("says how many keep the value on this device, only when some do", () => {
    expect(IDENTIFIER_STRINGS.en.summary(4, 3, 2)).toContain("2 of them keep the value on this device.");
    expect(IDENTIFIER_STRINGS.en.summary(3, 2, 1)).toContain("1 of them keeps the value on this device.");
  });
  it("is correct in French, singular and plural", () => {
    expect(IDENTIFIER_STRINGS.fr.summary(1, 1, 0)).toBe("1 endroit dans 1 partie de l’App produit une valeur aléatoire ou lit un réglage de votre navigateur.");
    expect(IDENTIFIER_STRINGS.fr.summary(4, 3, 2)).toBe("4 endroits dans 3 parties de l’App produisent une valeur aléatoire ou lisent un réglage de votre navigateur. 2 d’entre eux conservent la valeur sur cet appareil.");
    expect(IDENTIFIER_STRINGS.fr.summary(3, 2, 1)).toContain("1 d’entre eux conserve la valeur");
  });
  it("is empty for no rows", () => {
    for (const l of LOCALES) expect(identifierSummary(l, [])).toBe("");
  });
  it("adds the places of the rows", () => expect(identifierSummary("en", ROWS)).toBe("4 places in 3 parts of the App make a random value or read a setting of your browser. 2 of them keep the value on this device."));
});

describe("renderIdentifiersHtml", () => {
  it("renders nothing for no rows", () => {
    for (const l of LOCALES) expect(renderIdentifiersHtml(l, [])).toBe("");
  });
  it("has a labelled group, a captioned table with three header cells and both buttons", () => {
    const html = renderIdentifiersHtml("en", ROWS);
    expect(html).toContain('data-privacy-identifiers role="group" aria-labelledby="privacy-identifiers-title"');
    expect(html.match(/<caption>/g)).toHaveLength(1);
    expect(html.match(/<th scope="col">/g)).toHaveLength(3);
    expect(html).toContain('data-action="export-identifiers-csv"');
    expect(html).toContain('data-action="export-identifiers-text"');
  });
  it("shows one row for each part, with what it makes and whether it is kept", () => {
    const text = textOf(renderIdentifiersHtml("en", ROWS));
    expect(text).toContain("Part a.ts Value a.ts Kept on this device");
    expect(text).toContain("Part b.ts Value b.ts Written into the protected copy");
    expect(text).toContain("Part c.ts Value c.ts Shown in this panel, not kept");
  });
  it("says that the list does not show where a value goes after that", () => expect(textOf(renderIdentifiersHtml("en", ROWS))).toContain("does not show where a value goes after that"));
  it("never shows a file path or a code name", () => {
    const text = textOf(renderIdentifiersHtml("en", IDENTIFIER_REGISTER));
    expect(text).not.toContain("apps/web");
    expect(text).not.toMatch(/\.tsx?\b|randomUUID|Math\.random/);
  });
  it("escapes the text of a row", () => expect(renderIdentifiersHtml("en", [{ ...row("a.ts"), what: { en: "<b>x</b>", fr: "y" } }])).not.toContain("<b>"));
  it("lists every part of the real register in both languages", () => {
    for (const l of LOCALES) for (const r of IDENTIFIER_REGISTER) expect(renderIdentifiersHtml(l, IDENTIFIER_REGISTER), r.path).toContain(r.where[l].replace(/&/g, "&amp;"));
  });
});

describe("identifiersAsCsv", () => {
  it("has a header and one row per part, with the count and whether it is kept", () => {
    const f = identifiersAsCsv("en", ROWS, NOW);
    expect(f.mime).toBe("text/csv");
    expect(f.filename).toBe("the-app-random-values-and-browser-reads-2026-11-21.csv");
    expect(f.count).toBe(3);
    const lines = f.text.split("\r\n");
    expect(lines[0]).toBe("Part of the App,What it makes or reads,Places,Is it kept?");
    expect(lines[1]).toBe("Part a.ts,Value a.ts,2,Kept on this device");
  });
  it("uses a semicolon and French words for French", () => {
    const f = identifiersAsCsv("fr", ROWS, NOW, ";");
    expect(f.filename).toBe("l-app-valeurs-aleatoires-et-lectures-du-navigateur-2026-11-21.csv");
    expect(f.text.split("\r\n")[3]).toBe("Partie c.ts;Valeur c.ts;1;Affiché dans ce panneau, non conservé");
  });
  it("quotes a cell that holds the delimiter", () => expect(identifiersAsCsv("en", [{ ...row("a.ts"), what: { en: "a, b", fr: "c" } }], NOW).text.split("\r\n")[1]).toBe('Part a.ts,"a, b",1,Not kept'));
  it("has only the header for no rows", () => expect(identifiersAsCsv("en", [], NOW).text.split("\r\n")).toHaveLength(2));
});

describe("identifiersAsText", () => {
  it("has the title, the note, the summary and a block for each part", () => {
    const f = identifiersAsText("en", ROWS, NOW);
    expect(f.text.split("\n")[0]).toBe("What the App makes or reads about your browser");
    expect(f.text).toContain("Part a.ts\n  What it makes or reads: Value a.ts\n  Places: 2\n  Is it kept?: Kept on this device");
    expect(f.text.endsWith("\n")).toBe(true);
    expect(f.filename).toBe("the-app-random-values-and-browser-reads-2026-11-21.txt");
  });
  it("puts a no-break space before the colon in French", () => {
    const t = identifiersAsText("fr", ROWS, NOW).text;
    expect(t).toContain(`Endroits${String.fromCodePoint(0xa0)}: 2`);
    expect(t).not.toMatch(/\S: \d/);
  });
  it("puts a narrow no-break space before the question mark in French, in the column name, the text and the file", () => {
    const narrow = String.fromCodePoint(0x202f);
    expect(IDENTIFIER_STRINGS.fr.columns.kept).toBe(`Est-ce conservé${narrow}?`);
    expect(identifiersAsText("fr", ROWS, NOW).text).toContain(`Est-ce conservé${narrow}?${String.fromCodePoint(0xa0)}: Conservé`);
    expect(identifiersAsCsv("fr", ROWS, NOW, ";").text.split("\r\n")[0]).toBe(`Partie de l’App;Ce qu’elle produit ou lit;Endroits;Est-ce conservé${narrow}?`);
  });
  it("has the count of rows", () => {
    expect(identifiersAsText("en", ROWS, NOW).count).toBe(3);
    expect(identifiersAsText("en", [], NOW).count).toBe(0);
  });
});

describe("wording", () => {
  it("passes the HTML audit and the copy lint in both languages", () => {
    for (const l of LOCALES) {
      for (const rows of [ROWS, IDENTIFIER_REGISTER]) {
        const html = renderIdentifiersHtml(l, rows);
        const v = auditHtml(`<section lang="${l}">${html}</section>`);
        expect(v, formatViolations(v)).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(l, t), t).toEqual([]);
      }
      for (const line of identifiersAsText(l, IDENTIFIER_REGISTER, NOW).text.split("\n")) if (line.trim() !== "") expect(lintCopy(l, line.trim()), line).toEqual([]);
    }
  });
  it("has the same shape in English and French", () => {
    const flat = (l: Locale): Record<string, string> => {
      const s = IDENTIFIER_STRINGS[l];
      const part = (prefix: string, o: Record<string, string>): Array<[string, string]> => Object.entries(o).map(([k, v]) => [`${prefix}.${k}`, v]);
      return { heading: s.heading, note: s.note, caption: s.caption, csvButton: s.csvButton, textButton: s.textButton, fileTitle: s.fileTitle, ...Object.fromEntries([...part("columns", s.columns), ...part("kept", s.kept), ...part("labels", s.labels), ...s.exportHeader.map((h, i): [string, string] => [`h${i}`, h])]) };
    };
    expect(checkParity(flat("en"), flat("fr"), {})).toEqual([]);
  });
  it("never says verified or a word for it, and never says never sent", () => {
    for (const l of LOCALES) {
      const all = `${renderIdentifiersHtml(l, IDENTIFIER_REGISTER)}${identifiersAsText(l, IDENTIFIER_REGISTER, NOW).text}${identifiersAsCsv(l, IDENTIFIER_REGISTER, NOW).text}`;
      expect(all).not.toMatch(/verified|vérif|never sent|jamais envoy/i);
    }
  });
});
