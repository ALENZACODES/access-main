import { expect, test } from "@playwright/test";
import {
  attributeLanguageReport,
  isLanguageTag,
  likelyCopyLanguage,
  normalizeAccessibleCopy,
  primaryLanguage,
  summarizeAttributeLanguageFindings,
  type AttributeCopy,
  type AttributeName,
} from "./p20u-attribute-language";

const attributes: readonly AttributeName[] = ["aria-label", "aria-description", "alt", "title", "placeholder"];
const sample = (changes: Partial<AttributeCopy> = {}): AttributeCopy => ({
  element: "#search", attribute: "aria-label", value: "Search for places on this page",
  inheritedLanguage: "fr", explicitlyMarkedLanguage: null, visible: true, ...changes,
});

for (const attribute of attributes) {
  test(`detects English copy in French ${attribute}`, () => {
    const result = attributeLanguageReport([sample({ attribute })], "fr");
    expect(result.inspected).toBe(1);
    expect(result.findings.map((item) => item.rule)).toEqual(["attribute-language"]);
  });
  test(`accepts explicitly marked English ${attribute}`, () => {
    expect(attributeLanguageReport([sample({ attribute, explicitlyMarkedLanguage: "en" })], "fr").findings).toEqual([]);
  });
  test(`ignores hidden English ${attribute}`, () => {
    expect(attributeLanguageReport([sample({ attribute, visible: false })], "fr")).toEqual({ inspected: 0, findings: [] });
  });
}

for (const value of [
  "Open the details for this record", "This device stores only local records",
  "Select a category", "Clear these filters", "No matching results",
  "Go back to the previous page", "Nothing is sent",
]) {
  test(`English construction: ${value}`, () => {
    expect(likelyCopyLanguage(value)).toBe("en");
  });
}

for (const value of [
  "Choisir une catégorie", "Sur cet appareil", "Champ obligatoire",
  "Aucun résultat", "Ouvrir les détails", "Rien n’est envoyé",
]) {
  test(`French construction: ${value}`, () => {
    expect(likelyCopyLanguage(value)).toBe("fr");
  });
}

for (const value of ["Toronto", "2026-11-19", "12", "North York", "A11Y", "Recherche", "Information", "_"]) {
  test(`does not guess language of ${value}`, () => {
    expect(likelyCopyLanguage(value)).toBeNull();
  });
}

test("accepts French copy under French language and English under English", () => {
  const items = [
    sample({ value: "Champ obligatoire", inheritedLanguage: "fr" }),
    sample({ value: "Clear these filters", inheritedLanguage: "en" }),
  ];
  expect(attributeLanguageReport(items, "fr").findings).toEqual([]);
});

test("a French passage under English is also checked", () => {
  const result = attributeLanguageReport([sample({ value: "Sur cet appareil", inheritedLanguage: "en" })], "en");
  expect(result.findings).toHaveLength(1);
});

test("nested marked languages override page language", () => {
  const items = [
    sample({ inheritedLanguage: "en", value: "Open the details for this record" }),
    sample({ inheritedLanguage: "fr", explicitlyMarkedLanguage: "en-CA" }),
  ];
  expect(attributeLanguageReport(items, "fr").findings).toEqual([]);
});

test("malformed lang attributes fail explicitly", () => {
  const result = attributeLanguageReport([sample({ explicitlyMarkedLanguage: "?" })], "fr");
  expect(result.findings.map((item) => item.rule)).toEqual(["invalid-attribute-language"]);
});

test("unknown language tags never create an English or French guess", () => {
  expect(attributeLanguageReport([sample({ inheritedLanguage: "und" })], "und").findings).toEqual([]);
  expect(primaryLanguage("fr-CA")).toBe("fr");
  expect(primaryLanguage("en-US")).toBe("en");
  expect(primaryLanguage("und")).toBeNull();
  expect(isLanguageTag("es-MX")).toBe(true);
  expect(isLanguageTag("a?b")).toBe(false);
});

test("empty and hidden attributes are ignored", () => {
  const result = attributeLanguageReport([
    sample({ value: "" }), sample({ value: "   " }), sample({ visible: false }),
  ], "fr");
  expect(result.inspected).toBe(0);
  expect(result.findings).toEqual([]);
});

test("normalization preserves accents while collapsing whitespace", () => {
  expect(normalizeAccessibleCopy("  Sur\n cet   appareil ")).toBe("Sur cet appareil");
});

test("diagnostics retain attribute and element identity", () => {
  const { findings } = attributeLanguageReport([sample()], "fr");
  const message = summarizeAttributeLanguageFindings(findings);
  expect(message).toContain("#search");
  expect(message).toContain("aria-label");
});
