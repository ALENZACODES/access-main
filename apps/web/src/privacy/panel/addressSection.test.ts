import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { checkParity } from "../audit/parity";
import { rawTexts } from "../audit/rawTexts";
import { ADDRESS_REGISTER, CALL_REGISTER, type AddressRow, type CallRow } from "./addressRegister";
import { ADDRESS_STRINGS, renderAddressesHtml } from "./addressSection";
import { lintCopy, type Locale } from "./copyLint";

const LOCALES: Locale[] = ["en", "fr"];
const VIEW = { addresses: ADDRESS_REGISTER, calls: CALL_REGISTER };
const textOf = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const link = (host: string, en = "A page", fr = "Une page"): AddressRow => ({ host, kind: "link", path: "p.ts", holds: { en, fr }, source: "s", recordedOn: "2026-11-20" });
const call = (destination: CallRow["destination"], calls = 1): CallRow => ({ path: "p.ts", calls, destination, holds: { en: "Loads a file", fr: "Charge un fichier" }, source: "s", recordedOn: "2026-11-20" });

describe("renderAddressesHtml", () => {
  it("renders nothing when both lists are empty", () => {
    for (const l of LOCALES) expect(renderAddressesHtml(l, { addresses: [], calls: [] })).toBe("");
  });
  it("has a labelled group, two tables with captions, and both download buttons", () => {
    const html = renderAddressesHtml("en", VIEW);
    expect(html).toContain('data-privacy-addresses role="group" aria-labelledby="privacy-addresses-title"');
    expect(html).toContain('<h3 id="privacy-addresses-title">Web addresses and network requests in the App</h3>');
    expect(html.match(/<table>/g)).toHaveLength(2);
    expect(html.match(/<caption>/g)).toHaveLength(2);
    expect(html).toContain('data-action="export-addresses-csv"');
    expect(html).toContain('data-action="export-addresses-text"');
  });
  it("shows only the host, never a full address or a file path", () => {
    const text = textOf(renderAddressesHtml("en", VIEW));
    expect(text).toContain("creativecommons.org");
    expect(text).not.toMatch(/https?:/);
    expect(text).not.toContain("apps/web");
    expect(text).not.toContain(".ts");
  });
  it("says a destination the code does not fix is unknown", () => {
    const html = renderAddressesHtml("en", { addresses: [], calls: [call("UNKNOWN")] });
    expect(textOf(html)).toContain("Unknown. The address comes from data the code does not fix.");
    expect(textOf(renderAddressesHtml("fr", { addresses: [], calls: [call("UNKNOWN")] }))).toContain("Inconnu.");
  });
  it("says a request that stays on the same site goes to the same site", () => {
    expect(textOf(renderAddressesHtml("en", { addresses: [], calls: [call("same-site", 2)] }))).toContain("The same site");
  });
  it("tells the person what was and was not checked", () => {
    const en = textOf(renderAddressesHtml("en", VIEW));
    expect(en).toContain("read from the App’s source, not from your device");
    expect(en).toContain("was not checked");
  });
  it("counts addresses and places in the summary, singular and plural", () => {
    expect(ADDRESS_STRINGS.en.summary(1, 1)).toBe("1 address named. 1 place makes network requests.");
    expect(ADDRESS_STRINGS.en.summary(3, 4)).toBe("3 addresses named. 4 places make network requests.");
    expect(ADDRESS_STRINGS.fr.summary(0, 0)).toBe("0 adresse nommée. 0 endroit fait des requêtes réseau.");
    expect(ADDRESS_STRINGS.fr.summary(2, 2)).toBe("2 adresses nommées. 2 endroits font des requêtes réseau.");
  });
  it("says none found for an empty list while the other has rows", () => {
    expect(textOf(renderAddressesHtml("en", { addresses: [link("a-site.org")], calls: [] }))).toContain("None found.");
    expect(textOf(renderAddressesHtml("fr", { addresses: [], calls: [call("same-site")] }))).toContain("Aucun trouvé.");
  });
  it("escapes the text of a row", () => {
    const html = renderAddressesHtml("en", { addresses: [link("a-site.org", '<b>"x"</b>')], calls: [] });
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
  });
  it("labels every cell with its column for small screens", () => {
    const html = renderAddressesHtml("en", VIEW);
    expect(html).toContain('data-label="Address"');
    expect(html).toContain('data-label="Where it goes"');
  });
  it("lists every row of the real registers", () => {
    for (const l of LOCALES) {
      const html = renderAddressesHtml(l, VIEW);
      for (const a of ADDRESS_REGISTER) expect(html, a.host).toContain(a.host);
      for (const c of CALL_REGISTER) expect(html, c.path).toContain(c.holds[l].replace(/&/g, "&amp;"));
    }
  });
});

describe("wording", () => {
  it("passes the HTML audit and the copy lint in both languages", () => {
    for (const l of LOCALES) {
      const html = renderAddressesHtml(l, VIEW);
      const v = auditHtml(`<section lang="${l}">${html}</section>`);
      expect(v, formatViolations(v)).toEqual([]);
      for (const t of rawTexts(html)) expect(lintCopy(l, t), t).toEqual([]);
    }
  });
  it("has the same shape in English and French", () => {
    const flat = (l: Locale): Record<string, string> => {
      const s = ADDRESS_STRINGS[l];
      return { heading: s.heading, note: s.note, linksHeading: s.linksHeading, callsHeading: s.callsHeading, ...Object.fromEntries(Object.entries(s.kinds).map(([k, v]) => [`kinds.${k}`, v])), ...Object.fromEntries(Object.entries(s.destinations).map(([k, v]) => [`destinations.${k}`, v])), ...Object.fromEntries(Object.entries(s.columns).map(([k, v]) => [`columns.${k}`, v])), none: s.none, csvButton: s.csvButton, textButton: s.textButton };
    };
    expect(checkParity(flat("en"), flat("fr"), {})).toEqual([]);
  });
  it("uses a typographic apostrophe and no space-before-colon error in French", () => {
    const s = ADDRESS_STRINGS.fr;
    expect(s.note).toContain("l’App");
    expect(s.note).not.toContain("'");
    expect(s.destinations.UNKNOWN).toContain("Inconnu.");
  });
});
