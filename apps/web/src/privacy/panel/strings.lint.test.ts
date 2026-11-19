import { describe, expect, it } from "vitest";
import { STRINGS as NOTICE } from "../onDeviceNotice";
import { lintTable, type Locale } from "./copyLint";
import { PANEL_STRINGS, type Status } from "./strings";

const LOCALES: readonly Locale[] = ["en", "fr"];
const STATUSES: readonly Status[] = [
  { kind: "exported", count: 0 },
  { kind: "exported", count: 1 },
  { kind: "exported", count: 2 },
  { kind: "erased", count: 1 },
  { kind: "erased", count: 5 },
  { kind: "erase-partial", failed: 1 },
  { kind: "erase-partial", failed: 3 },
  { kind: "nothing" },
  { kind: "unavailable" },
  { kind: "consent-saved", value: "granted", label: "Lieux" },
  { kind: "consent-saved", value: "declined", label: "Places" },
  { kind: "save-failed" },
  { kind: "expired-removed", count: 0 },
  { kind: "expired-removed", count: 4 },
  { kind: "list-exported", format: "csv" },
  { kind: "list-exported", format: "text" },
  { kind: "seen-saved" },
];

// This is the CI guard for the wording rules: every shipped string, both languages.
describe.each(LOCALES)("shipped copy (%s)", (loc) => {
  it("notice strings pass the copy lint", () => {
    expect(lintTable(loc, NOTICE[loc])).toEqual([]);
  });
  it("panel strings pass the copy lint", () => {
    const { status, ...rest } = PANEL_STRINGS[loc];
    expect(status).toBeTypeOf("function");
    expect(lintTable(loc, rest)).toEqual([]);
  });
  it("every status message passes the copy lint", () => {
    for (const s of STATUSES) {
      expect(lintTable(loc, PANEL_STRINGS[loc].status(s)), JSON.stringify(s)).toEqual([]);
    }
  });
});

describe("plural forms", () => {
  it("English: 1 is singular, 0 and 2 are plural", () => {
    const f = PANEL_STRINGS.en.status;
    expect(f({ kind: "exported", count: 1 })).toContain("1 item.");
    expect(f({ kind: "exported", count: 0 })).toContain("0 items.");
    expect(f({ kind: "exported", count: 2 })).toContain("2 items.");
  });
  it("French: 0 and 1 are singular", () => {
    const f = PANEL_STRINGS.fr.status;
    expect(f({ kind: "erased", count: 0 })).toContain("0 élément.");
    expect(f({ kind: "erased", count: 1 })).toContain("1 élément.");
    expect(f({ kind: "erased", count: 2 })).toContain("2 éléments.");
    expect(f({ kind: "erase-partial", failed: 1 })).toContain("1 élément n’a pas pu");
    expect(f({ kind: "erase-partial", failed: 2 })).toContain("2 éléments n’ont pas pu");
  });
  it("French messages put U+00A0 before the colon", () => {
    expect(PANEL_STRINGS.fr.status({ kind: "exported", count: 2 })).toContain("préparé\u00a0:");
  });
});

describe("scope wording", () => {
  it("says the panel does not cover server data, in both languages", () => {
    expect(PANEL_STRINGS.en.scopeNote).toContain("does not cover data held on a server");
    expect(PANEL_STRINGS.fr.scopeNote).toContain("ne sont pas incluses");
  });
});

describe("consent copy", () => {
  it.each(LOCALES)("passes the copy lint with sample dates and labels (%s)", (loc) => {
    expect(lintTable(loc, PANEL_STRINGS[loc].consent)).toEqual([]);
  });
  it("French button names keep the visible word first, as Label in Name needs", () => {
    const c = PANEL_STRINGS.fr.consent;
    expect(c.ariaAllow("Lieux").startsWith(c.allow)).toBe(true);
    expect(c.ariaDecline("Lieux").startsWith(c.decline)).toBe(true);
  });
  it("English button names keep the visible words first", () => {
    const c = PANEL_STRINGS.en.consent;
    expect(c.ariaAllow("Places").startsWith(c.allow)).toBe(true);
    expect(c.ariaDecline("Places").startsWith(c.decline)).toBe(true);
  });
  it("French consent messages put U+00A0 before the colon", () => {
    expect(PANEL_STRINGS.fr.status({ kind: "consent-saved", value: "granted", label: "A" })).toContain("Enregistré\u00a0:");
    expect(PANEL_STRINGS.fr.consent.ariaAllow("A")).toContain("Autoriser\u00a0:");
  });
  it("French quotes a label with narrow no-break spaces", () => {
    expect(PANEL_STRINGS.fr.status({ kind: "consent-saved", value: "declined", label: "Lieux" })).toContain(
      "«\u202fLieux\u202f»",
    );
  });
});
