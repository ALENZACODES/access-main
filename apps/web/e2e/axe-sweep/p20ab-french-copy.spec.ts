import { expect, test } from "@playwright/test";
import {
  buildFrenchTypographyExample, checkFrenchCopy, checkFrenchSpan, copyInventory,
  copyMarkers, hasForeignLanguageMark, hasUnexpectedLeadingSpace,
  isFrenchPunctuation, normalizeFrenchWhitespace, requiredSpaceAfter,
  requiredSpaceBefore, summariseFrenchIssues,
  type CopySpan,
} from "./p20ab-french-copy";

const span = (text: string, change: Partial<CopySpan> = {}): CopySpan => ({
  id: "copy", text, language: "fr", visible: true, userFacing: true, ...change,
});
const codes = (text: string): readonly string[] => checkFrenchSpan(span(text)).map((item) => item.code);
const nbsp = "\u00a0";
const narrow = "\u202f";

test("canonical French example has no spacing findings", () => {
  expect(codes(buildFrenchTypographyExample())).toEqual([]);
});
test("colon requires the regular nonbreaking space", () => {
  expect(codes("Source: Ontario")).toContain("colon-nbsp");
});
test("regular nonbreaking space before a colon is accepted", () => {
  expect(codes(`Source${nbsp}: Ontario`)).toEqual([]);
});
test("narrow space before a colon is rejected", () => {
  expect(codes(`Source${narrow}: Ontario`)).toContain("colon-nbsp");
  expect(codes(`Source${narrow}: Ontario`)).toContain("colon-wrong-space");
});
for (const char of [";", "!", "?"]) {
  test(`requires narrow nonbreaking space before ${char}`, () => {
    expect(codes(`Bonjour ${char}`)).toContain("punctuation-nnbsp");
  });
  test(`accepts narrow nonbreaking space before ${char}`, () => {
    expect(codes(`Bonjour${narrow}${char}`)).toEqual([]);
  });
  test(`rejects normal nonbreaking space before ${char}`, () => {
    expect(codes(`Bonjour${nbsp}${char}`)).toContain("wrong-nbsp-kind");
  });
}
test("opening guillemet requires the narrow space", () => {
  expect(codes("«Texte»")).toContain("guillemet-open-nnbsp");
});
test("closing guillemet requires the narrow space", () => {
  expect(codes("«Texte»")).toContain("guillemet-close-nnbsp");
});
test("balanced guillemets pass", () => {
  expect(codes(`«${narrow}Texte${narrow}»`)).toEqual([]);
});
test("straight apostrophe between letters is rejected", () => {
  expect(codes("L'application")).toContain("apostrophe-curly");
});
test("curly apostrophe between letters is accepted", () => {
  expect(codes("L’application")).toEqual([]);
});
test("English copy explicitly tagged in English is not interpreted as French", () => {
  expect(checkFrenchSpan(span("It's a button!", { language: "en" }))).toEqual([]);
});
test("unknown language is not silently classified as French", () => {
  expect(checkFrenchSpan(span("Bonjour!", { language: "UNKNOWN" }))).toEqual([]);
});
test("hidden text does not become an exposed-language finding", () => {
  expect(checkFrenchSpan(span("Bonjour!", { visible: false }))).toEqual([]);
});
test("non-user-facing metadata is not treated as visible copy", () => {
  expect(checkFrenchSpan(span("Bonjour!", { userFacing: false }))).toEqual([]);
});
test("the report counts visible French and unknown spans independently", () => {
  const spans = [span("Bonjour"), span("Good day", { language: "en" }), span("UNKNOWN", { language: "UNKNOWN" })];
  expect(checkFrenchCopy(spans)).toMatchObject({ inspected: 1, unknown: 1, findings: [] });
});
test("unknown fragment identifiers stay available for audit", () => {
  expect(copyMarkers([span("?", { id: "missing", language: "UNKNOWN" })])).toEqual(["missing"]);
});
test("hidden unknown fragments are omitted from visible marker inventory", () => {
  expect(copyMarkers([span("?", { id: "hidden", language: "UNKNOWN", visible: false })])).toEqual([]);
});
test("copy language inventory does not invent a language for unknown items", () => {
  expect(copyInventory([span("fr"), span("en", { language: "en" }), span("?", { language: "UNKNOWN" })])).toEqual({ en: 1, fr: 1, UNKNOWN: 1 });
});
test("explicit English marker is recognized", () => {
  expect(hasForeignLanguageMark(span("English", { language: "en" }))).toBe(true);
});
test("unmarked French is not called English", () => {
  expect(hasForeignLanguageMark(span("Français"))).toBe(false);
});
test("normalization preserves accented French text", () => {
  expect(normalizeFrenchWhitespace(" École   locale ")).toBe("École locale");
});
test("leading normal and nonbreaking spaces remain detectable", () => {
  for (const start of [" ", nbsp, narrow, "\t"]) expect(hasUnexpectedLeadingSpace(`${start}Texte`)).toBe(true);
});
test("copy beginning with a letter has no unexpected leading space", () => {
  expect(hasUnexpectedLeadingSpace("Texte")).toBe(false);
});
test("recognized French punctuation has a deterministic inventory", () => {
  for (const char of [":", ";", "!", "?", "«", "»"]) expect(isFrenchPunctuation(char)).toBe(true);
});
test("ordinary alphabetic characters are not punctuation", () => {
  for (const char of ["a", "é", "0"]) expect(isFrenchPunctuation(char)).toBe(false);
});
test("colon spacing requirement is distinct from other punctuation", () => {
  expect(requiredSpaceBefore(":")).toBe(nbsp);
  expect(requiredSpaceBefore(";")).toBe(narrow);
  expect(requiredSpaceBefore("!")).toBe(narrow);
  expect(requiredSpaceBefore("?")).toBe(narrow);
});
test("opening guillemet has an after-space requirement", () => {
  expect(requiredSpaceAfter("«")).toBe(narrow);
  expect(requiredSpaceAfter("a")).toBeNull();
});
test("ordinary characters have no special preceding-space requirement", () => {
  expect(requiredSpaceBefore("a")).toBeNull();
});
test("report formatter deduplicates exact findings", () => {
  const findings = checkFrenchSpan(span("Bonjour!"));
  expect(summariseFrenchIssues([...findings, ...findings]).split("\n")).toHaveLength(findings.length);
});
test("report formatter makes truncation explicit", () => {
  const findings = checkFrenchSpan(span("Bonjour! Bonjour? Bonjour;"));
  expect(summariseFrenchIssues(findings, 1)).toContain("more issues");
});
test("report formatter rejects a zero limit", () => {
  expect(() => summariseFrenchIssues([], 0)).toThrow(RangeError);
});
