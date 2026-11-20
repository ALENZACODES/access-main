import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { checkParity } from "../audit/parity";
import { rawTexts } from "../audit/rawTexts";
import { ADDRESS_REGISTER, CALL_REGISTER } from "./addressRegister";
import { lintCopy, type Locale } from "./copyLint";
import { DEVICE_REGISTER } from "./deviceRegister";
import { FEATURE_REGISTER } from "./featureRegister";
import type { GlanceSources } from "./glance";
import { GLANCE_LABELS, GLANCE_STRINGS, glanceAsCsv, glanceAsText, renderGlanceHtml } from "./glanceSection";
import { STORAGE_REGISTER, UNSCANNED } from "./storageRegister";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const LOCALES: Locale[] = ["en", "fr"];
const ALL: GlanceSources = { kept: { register: STORAGE_REGISTER, unscanned: UNSCANNED }, device: DEVICE_REGISTER, features: FEATURE_REGISTER, addresses: { addresses: ADDRESS_REGISTER, calls: CALL_REGISTER } };
const textOf = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("renderGlanceHtml", () => {
  it("renders nothing when no list was given", () => {
    for (const l of LOCALES) expect(renderGlanceHtml(l, {})).toBe("");
  });
  it("has a labelled group, one captioned table for each list given, and both buttons", () => {
    const html = renderGlanceHtml("en", ALL);
    expect(html).toContain('data-privacy-glance role="group" aria-labelledby="privacy-glance-title"');
    expect(html.match(/<table>/g)).toHaveLength(4);
    expect(html.match(/<caption>/g)).toHaveLength(4);
    expect(html).toContain('data-action="export-glance-csv"');
    expect(html).toContain('data-action="export-glance-text"');
  });
  it("shows a table only for a list that was given", () => {
    const html = renderGlanceHtml("en", { device: DEVICE_REGISTER });
    expect(html.match(/<table>/g)).toHaveLength(1);
    expect(html).toContain("Offline storage");
    expect(html).not.toContain("Browser features");
  });
  it("shows the count of every figure", () => {
    const html = renderGlanceHtml("en", ALL);
    expect(html).toContain(`<span data-label="How many">${STORAGE_REGISTER.length}</span>`);
    expect(html).toContain(`<span data-label="How many">${ADDRESS_REGISTER.filter((a) => a.kind === "link").length}</span>`);
  });
  it("says how many things are unconfirmed, and that they are shown as unknown", () => {
    const text = textOf(renderGlanceHtml("en", ALL));
    expect(text).toMatch(/\d+ things? the App has not confirmed\. They are shown as unknown\./);
    expect(text).toContain("(unknown)");
  });
  it("says nothing is unconfirmed when every unknown figure is zero", () => {
    expect(textOf(renderGlanceHtml("en", { kept: { register: [], unscanned: [] } }))).toContain("Nothing in these lists is unconfirmed.");
  });
  it("says where the counts come from", () => {
    expect(textOf(renderGlanceHtml("en", ALL))).toContain("not from your device");
  });
});

describe("unconfirmed sentence", () => {
  it("is singular and plural in both languages", () => {
    expect(GLANCE_STRINGS.en.unconfirmed(1)).toBe("1 thing the App has not confirmed. They are shown as unknown.");
    expect(GLANCE_STRINGS.en.unconfirmed(3)).toBe("3 things the App has not confirmed. They are shown as unknown.");
    expect(GLANCE_STRINGS.fr.unconfirmed(1)).toBe("1 élément que l’App n’a pas confirmé. Il est indiqué comme inconnu.");
    expect(GLANCE_STRINGS.fr.unconfirmed(2)).toBe("2 éléments que l’App n’a pas confirmés. Ils sont indiqués comme inconnus.");
    expect(GLANCE_STRINGS.fr.unconfirmed(0)).toBe("Rien n’est à confirmer dans ces listes.");
  });
});

describe("glanceAsCsv", () => {
  it("has a header and one row per figure", () => {
    const f = glanceAsCsv("en", ALL, NOW);
    expect(f.mime).toBe("text/csv");
    expect(f.filename).toBe("the-app-privacy-at-a-glance-2026-11-19.csv");
    expect(f.text.split("\r\n")).toHaveLength(f.count + 2);
    expect(f.text.startsWith("Group,What,How many,Not confirmed by the App\r\n")).toBe(true);
  });
  it("marks an unconfirmed figure with Yes, and the others with No", () => {
    const lines = glanceAsCsv("en", ALL, NOW).text.split("\r\n");
    expect(lines.find((l) => l.includes("could not read"))?.endsWith(",Yes")).toBe(true);
    expect(lines.find((l) => l.includes("Databases on this device"))?.endsWith(",No")).toBe(true);
  });
  it("uses a semicolon and French words for French", () => {
    const f = glanceAsCsv("fr", ALL, NOW, ";");
    expect(f.filename).toBe("l-app-vie-privee-en-un-coup-d-oeil-2026-11-19.csv");
    expect(f.text.split("\r\n")[0]).toBe("Groupe;Quoi;Combien;Non confirmé par l’App");
    expect(f.text).toContain(";Oui\r\n");
  });
  it("is only the header for no lists", () => {
    const f = glanceAsCsv("en", {}, NOW);
    expect(f.count).toBe(0);
    expect(f.text).toBe("Group,What,How many,Not confirmed by the App\r\n");
  });
});

describe("glanceAsText", () => {
  it("has the title, the unconfirmed sentence and a block for each list", () => {
    const f = glanceAsText("en", ALL, NOW);
    expect(f.mime).toBe("text/plain");
    expect(f.text.split("\n").slice(0, 2)).toEqual(["Privacy at a glance", ""]);
    expect(f.text).toContain("Saved in this browser\n  Things the App saves in this browser: ");
    expect(f.text.endsWith("\n")).toBe(true);
  });
  it("leaves out a list that was not given", () => {
    expect(glanceAsText("en", { device: DEVICE_REGISTER }, NOW).text).not.toContain("Browser features");
  });
  it("puts a no-break space before the colon in French", () => {
    const t = glanceAsText("fr", ALL, NOW).text;
    expect(t).toContain("Bases de données sur cet appareil : ");
    expect(t).not.toMatch(/\S: \d/);
  });
});

describe("wording", () => {
  it("passes the HTML audit and the copy lint in both languages", () => {
    for (const l of LOCALES) {
      const html = renderGlanceHtml(l, ALL);
      const v = auditHtml(`<section lang="${l}">${html}</section>`);
      expect(v, formatViolations(v)).toEqual([]);
      for (const t of rawTexts(html)) expect(lintCopy(l, t), t).toEqual([]);
      for (const text of [glanceAsText(l, ALL, NOW).text, glanceAsCsv(l, ALL, NOW).text]) for (const line of text.split(/\r?\n/)) if (line !== "") expect(lintCopy(l, line.replace(/^\s+/, "")), line).toEqual([]);
    }
  });
  it("has the same shape in English and French", () => {
    const flat = (l: Locale): Record<string, string> => {
      const s = GLANCE_STRINGS[l];
      return { heading: s.heading, note: s.note, csvButton: s.csvButton, textButton: s.textButton, yes: s.yes, no: s.no, fileTitle: s.fileTitle, ...Object.fromEntries(Object.entries(s.groups).map(([k, v]) => [`groups.${k}`, v])), ...Object.fromEntries(Object.entries(s.columns).map(([k, v]) => [`columns.${k}`, v])), ...Object.fromEntries(s.exportHeader.map((h, i) => [`h${i}`, h])), ...Object.fromEntries(Object.entries(GLANCE_LABELS).map(([k, v]) => [`label.${k}`, v[l]])) };
    };
    expect(checkParity(flat("en"), flat("fr"), {})).toEqual([]);
  });
  it("never says verified or a word for it", () => {
    for (const l of LOCALES) expect(`${renderGlanceHtml(l, ALL)}${glanceAsText(l, ALL, NOW).text}`).not.toMatch(/verified|vérif/i);
  });
});
