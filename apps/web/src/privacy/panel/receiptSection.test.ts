import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { checkParity } from "../audit/parity";
import { rawTexts } from "../audit/rawTexts";
import type { ConsentState, Purpose } from "./consent";
import { lintCopy, type Locale } from "./copyLint";
import { receiptRows, type ReceiptRow } from "./receipt";
import { RECEIPT_STRINGS, receiptAsCsv, receiptAsText, receiptCells, renderReceiptHtml } from "./receiptSection";

const NOW = new Date(2026, 10, 20, 9, 0, 0);
const LOCALES: Locale[] = ["en", "fr"];
const PURPOSE: Purpose = { id: "route-reports", label: { en: "Keep my route reports", fr: "Conserver mes signalements" }, description: { en: "Keep reports on this device.", fr: "Conserver les signalements sur cet appareil." }, wordingVersion: 1 };
const RULES = [{ purposeId: "route-reports", key: "access.routeReports.v1" }];
const REG = [{ key: "access.routeReports.v1", path: "p", holds: { en: "Your route reports", fr: "Vos signalements de parcours" }, gated: true, reach: "panel" as const, source: "s", recordedOn: "2026-11-20" }];
const rows = (consent: ConsentState = {}, over: { keys?: string[]; removesOnNo?: boolean; purpose?: Purpose } = {}): ReceiptRow[] =>
  receiptRows({ purposes: [over.purpose ?? PURPOSE], rules: RULES, consent, register: REG, keys: over.keys ?? [], removesOnNo: over.removesOnNo ?? true });
const YES: ConsentState = { "route-reports": { value: "granted", decidedOn: "2026-11-10", wordingVersion: 1 } };
const textOf = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("receiptCells", () => {
  it("writes the answer, the date and what the choice lets the App save", () => {
    const c = receiptCells("en", rows(YES, { keys: ["access.routeReports.v1"] })[0]!);
    expect(c).toMatchObject({ choice: "Keep my route reports", answer: "Yes", date: "2026-11-10", covers: "Your route reports", saved: "1 item", version: "1" });
  });
  it("says no date for an unanswered choice and not asked yet", () => {
    const c = receiptCells("en", rows()[0]!);
    expect(c).toMatchObject({ answer: "Not asked yet", date: "No date", saved: "0 items" });
  });
  it("says an earlier answer no longer counts after a wording change", () => {
    const c = receiptCells("en", rows(YES, { purpose: { ...PURPOSE, wordingVersion: 2 } })[0]!);
    expect(c.answer).toBe("Asked again because the wording changed");
    expect(c.date).toBe("2026-11-10 (no longer counts)");
  });
  it("says what happens on a no, by whether the App removes what it saved", () => {
    expect(receiptCells("en", rows()[0]!).ifNo).toBe("The App stops saving it and removes what it saved.");
    expect(receiptCells("en", rows({}, { removesOnNo: false })[0]!).ifNo).toBe("The App stops saving it. What is already saved stays until you erase it.");
  });
  it("says nothing changes when nothing is tied to the choice", () => {
    const c = receiptCells("en", receiptRows({ purposes: [PURPOSE], rules: [], consent: {}, keys: [], removesOnNo: true })[0]!);
    expect(c.ifNo).toBe("Nothing changes, because nothing is tied to this choice.");
    expect(c.covers).toBe("Not listed");
  });
  it("says nothing is tied when a list was given and no row matches", () => {
    const c = receiptCells("en", receiptRows({ purposes: [PURPOSE], rules: RULES, consent: {}, register: [], keys: [], removesOnNo: true })[0]!);
    expect(c.covers).toBe("Nothing is tied to this choice.");
  });
  it("is singular and plural in both languages", () => {
    expect(RECEIPT_STRINGS.en.saved(1)).toBe("1 item");
    expect(RECEIPT_STRINGS.fr.saved(0)).toBe("0 élément");
    expect(RECEIPT_STRINGS.fr.saved(2)).toBe("2 éléments");
    expect(RECEIPT_STRINGS.en.open(1)).toContain("1 choice has no current answer. It is off");
    expect(RECEIPT_STRINGS.fr.open(2)).toContain("2 choix n’ont pas de réponse à jour. Ils sont désactivés");
    expect(RECEIPT_STRINGS.en.open(0)).toBe("Every choice has a current answer.");
  });
});

describe("renderReceiptHtml", () => {
  it("renders nothing for no choices", () => {
    for (const l of LOCALES) expect(renderReceiptHtml(l, [])).toBe("");
  });
  it("has a labelled group, a captioned table with a header row and both buttons", () => {
    const html = renderReceiptHtml("en", rows());
    expect(html).toContain('data-privacy-receipt role="group" aria-labelledby="privacy-receipt-title"');
    expect(html.match(/<caption>/g)).toHaveLength(1);
    expect(html.match(/<th scope="col">/g)).toHaveLength(6);
    expect(html).toContain('data-action="export-receipt-csv"');
    expect(html).toContain('data-action="export-receipt-text"');
  });
  it("shows one row for each choice", () => {
    const two = [...rows(), ...rows(YES)];
    expect(renderReceiptHtml("en", two).match(/<tbody>.*<\/tbody>/)?.[0].match(/<tr>/g)).toHaveLength(2);
  });
  it("says it is made on this device and not sent anywhere", () => {
    expect(textOf(renderReceiptHtml("en", rows()))).toContain("It is not sent anywhere");
  });
  it("escapes the text of a choice", () => {
    const html = renderReceiptHtml("en", rows({}, { purpose: { ...PURPOSE, label: { en: "<i>x</i>", fr: "y" } } }));
    expect(html).not.toContain("<i>");
    expect(html).toContain("&lt;i&gt;x&lt;/i&gt;");
  });
});

describe("receiptAsCsv", () => {
  it("has a header and one row per choice", () => {
    const f = receiptAsCsv("en", rows(YES), NOW);
    expect(f.mime).toBe("text/csv");
    expect(f.filename).toBe("the-app-record-of-your-choices-2026-11-20.csv");
    expect(f.count).toBe(1);
    expect(f.text.split("\r\n")).toHaveLength(3);
    expect(f.text.startsWith("Choice,What the choice means,Your answer,")).toBe(true);
  });
  it("uses a semicolon and French words for French", () => {
    const f = receiptAsCsv("fr", rows(YES), NOW, ";");
    expect(f.filename).toBe("l-app-registre-de-vos-choix-2026-11-20.csv");
    expect(f.text.split("\r\n")[1]).toContain(";Oui;2026-11-10;");
  });
  it("quotes a field that holds the delimiter", () => {
    const two: ReceiptRow = { ...rows()[0]!, covers: [{ en: "a, b", fr: "c" }] };
    expect(receiptAsCsv("en", [two], NOW).text).toContain('"a, b"');
  });
  it("is only the header for no choices", () => {
    expect(receiptAsCsv("en", [], NOW).count).toBe(0);
    expect(receiptAsCsv("en", [], NOW).text.split("\r\n")).toHaveLength(2);
  });
});

describe("receiptAsText", () => {
  it("has the title, the date it was made and a block for each choice", () => {
    const f = receiptAsText("en", rows(YES), NOW);
    expect(f.text.split("\n").slice(0, 3)).toEqual(["Record of your choices", "", "Made on this device on 2026-11-20. It is not sent anywhere."]);
    expect(f.text).toContain("Keep my route reports\n  What the choice means: Keep reports on this device.\n  Your answer: Yes");
    expect(f.text.endsWith("\n")).toBe(true);
  });
  it("puts a no-break space before the colon in French", () => {
    const t = receiptAsText("fr", rows(YES), NOW).text;
    expect(t).toContain("Votre réponse : Oui");
    expect(t).not.toMatch(/\S: \S/);
  });
});

describe("wording", () => {
  it("passes the HTML audit and the copy lint in both languages, in every state", () => {
    const states: ConsentState[] = [{}, YES, { "route-reports": { value: "declined", decidedOn: "2026-11-11", wordingVersion: 1 } }];
    for (const l of LOCALES) {
      for (const s of states) {
        const html = renderReceiptHtml(l, rows(s, { keys: ["access.routeReports.v1"] }));
        const v = auditHtml(`<section lang="${l}">${html}</section>`);
        expect(v, formatViolations(v)).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(l, t), t).toEqual([]);
      }
      const changed = renderReceiptHtml(l, rows(YES, { purpose: { ...PURPOSE, wordingVersion: 2 } }));
      for (const t of rawTexts(changed)) expect(lintCopy(l, t), t).toEqual([]);
      for (const line of receiptAsText(l, rows(YES), NOW).text.split("\n")) if (line.trim() !== "") expect(lintCopy(l, line.trim()), line).toEqual([]);
    }
  });
  it("has the same shape in English and French", () => {
    const flat = (l: Locale): Record<string, string> => {
      const s = RECEIPT_STRINGS[l];
      return { heading: s.heading, note: s.note, caption: s.caption, noDate: s.noDate, notListed: s.notListed, nothingTied: s.nothingTied, csvButton: s.csvButton, textButton: s.textButton, fileTitle: s.fileTitle, ...Object.fromEntries(Object.entries(s.columns).map(([k, v]) => [`columns.${k}`, v])), ...Object.fromEntries(Object.entries(s.answers).map(([k, v]) => [`answers.${k}`, v])), ...Object.fromEntries(Object.entries(s.ifNo).map(([k, v]) => [`ifNo.${k}`, v])), ...Object.fromEntries(Object.entries(s.labels).map(([k, v]) => [`labels.${k}`, v])), ...Object.fromEntries(s.exportHeader.map((h, i) => [`h${i}`, h])) };
    };
    expect(checkParity(flat("en"), flat("fr"), {})).toEqual([]);
  });
  it("lists the file labels in the same order as the header", () => {
    for (const l of LOCALES) {
      const s = RECEIPT_STRINGS[l];
      expect(s.exportHeader.slice(1)).toEqual([s.labels.means, s.labels.answer, s.labels.date, s.labels.version, s.labels.covers, s.labels.saved, s.labels.ifNo]);
    }
  });
  it("never says verified or a word for it", () => {
    for (const l of LOCALES) expect(`${renderReceiptHtml(l, rows(YES))}${receiptAsText(l, rows(YES), NOW).text}`).not.toMatch(/verified|vérif/i);
  });
});
