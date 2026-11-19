import { expect, test } from "@playwright/test";
import {
  auditEvidenceList, auditEvidenceRow, compact, conservativeLocaleComparison,
  countUnknownByField, dateKey, dateParts, effectiveLanguage, evidenceDigest,
  evidenceTier, fields, formatEvidenceFindings, hasEvidenceForAllFields,
  isFutureEvidence, isLanguageTag, knowledgeOfValue, mergeEvidenceConservatively,
  metadataSignature, primaryLanguage, transitionEvidenceFindings, unknownText,
  type EvidenceField, type EvidenceRow, type EvidenceValue,
} from "./p20w-evidence-contracts";

const known = (text: string): EvidenceValue => ({ text, sourceLanguage: "en", markedLanguage: null });
const row = (changes: Partial<EvidenceRow> = {}): EvidenceRow => ({
  id: "demo-unit-1", label: "Demonstration unit", description: null,
  route: "/more/housing", locale: "en", visible: true, localOnly: true,
  fields: {
    source: known("Municipal catalogue"), licence: known("ODbL-1.0"),
    date: known("2026-11-15"), tier: known("E"),
  },
  ...changes,
});
const copy = (source: EvidenceRow, key: EvidenceField, text: string | null): EvidenceRow => ({
  ...source, fields: { ...source.fields, [key]: { ...known(text ?? ""), text } },
});
const codes = (source: ReturnType<typeof auditEvidenceRow>) => source.findings.map((item) => item.code);
const transitionCodes = (source: ReturnType<typeof transitionEvidenceFindings>) => source.map((item) => item.code);

test.describe("P20W evidence fields and absent values", () => {
  test("all four metadata properties are explicitly enumerated", () => {
    expect(fields()).toEqual(["source", "licence", "date", "tier"]);
  });
  test("complete demonstration provenance remains internally consistent", () => {
    const result = auditEvidenceRow(row(), "2026-11-19");
    expect(result.status).toBe("KNOWN");
    expect(result.findings).toEqual([]);
    expect(result.knownFields).toHaveLength(4);
    expect(result.unknownFields).toEqual([]);
  });
  test("known metadata never implies a physical access conclusion", () => {
    expect(auditEvidenceList([row()], "2026-11-19")).toMatchObject({ total: 1, known: 1, unknown: 0 });
  });
  for (const value of [null, "", "  ", "UNKNOWN", "Unknown", "Inconnu", "Inconnue", "Non fourni", "—", "-", "n/a", "s.o."]) {
    test(`absent source stays UNKNOWN: ${JSON.stringify(value)}`, () => {
      expect(unknownText(value)).toBe(true);
      expect(auditEvidenceRow(copy(row(), "source", value), "2026-11-19").status).toBe("UNKNOWN");
    });
  }
  for (const value of ["Toronto", "ODbL-1.0", "CC BY 4.0", "E", "2026-11-15", "Mairie de Québec"]) {
    test(`nonempty factual text is not erased: ${value}`, () => {
      expect(unknownText(value)).toBe(false);
    });
  }
  test("missing source object is not filled from the label", () => {
    const item = row({ fields: { licence: known("ODbL-1.0"), date: known("2026-11-15"), tier: known("E") } });
    const report = auditEvidenceRow(item, "2026-11-19");
    expect(report.status).toBe("UNKNOWN");
    expect(report.unknownFields).toContain("source");
    expect(report.knownFields).not.toContain("source");
  });
  test("unknown values count separately from malformed values", () => {
    const item = copy(row(), "date", "UNKNOWN");
    const report = auditEvidenceRow(item, "2026-11-19");
    expect(report.unknownFields).toEqual(["date"]);
    expect(report.findings).toEqual([]);
  });
  test("hidden records do not become known by inheriting metadata", () => {
    const report = auditEvidenceRow(row({ visible: false }), "2026-11-19");
    expect(report.status).toBe("UNKNOWN");
    expect(report.unknownFields).toEqual(fields());
  });
  test("visible records need a stable identifier", () => {
    expect(codes(auditEvidenceRow(row({ id: "" }), "2026-11-19"))).toContain("record-id");
  });
  test("visible records need an accessible label", () => {
    expect(codes(auditEvidenceRow(row({ label: " " }), "2026-11-19"))).toContain("record-label");
  });
  test("null evidence object stays UNKNOWN", () => {
    expect(knowledgeOfValue(undefined)).toBe("UNKNOWN");
    expect(knowledgeOfValue({ text: null, sourceLanguage: null, markedLanguage: null })).toBe("UNKNOWN");
  });
  test("display-only whitespace does not become a source", () => {
    expect(compact("  hello  \n world ")).toBe("hello world");
  });
});

test.describe("P20W evidence dates", () => {
  for (const date of ["2024-02-29", "2000-02-29", "2026-11-19", "0001-01-01", "2026-12-31"]) {
    test(`accepts Gregorian calendar date ${date}`, () => {
      expect(dateParts(date)).not.toBeNull();
    });
  }
  for (const date of ["2025-02-29", "1900-02-29", "2026-02-30", "2026-00-01", "2026-13-01", "2026-04-31", "2026/11/19", "2026-1-1", "0000-01-01", "UNKNOWN"]) {
    test(`rejects invalid calendar date ${date}`, () => {
      expect(dateParts(date)).toBeNull();
      const result = auditEvidenceRow(copy(row(), "date", date), "2026-11-19");
      expect(result.status).toBe("UNKNOWN");
    });
  }
  test("calendar ordering is numeric without time-zone ambiguity", () => {
    expect(dateKey(dateParts("2026-11-19")!)).toBeGreaterThan(dateKey(dateParts("2026-11-18")!));
    expect(dateKey(dateParts("2026-01-01")!)).toBeLessThan(dateKey(dateParts("2026-11-19")!));
  });
  test("current or older observations are not future data", () => {
    expect(isFutureEvidence("2026-11-19", "2026-11-19")).toBe(false);
    expect(isFutureEvidence("2026-11-18", "2026-11-19")).toBe(false);
  });
  test("an unknown reference date cannot certify a known observation", () => {
    const report = auditEvidenceRow(row(), "UNKNOWN");
    expect(report.status).toBe("UNKNOWN");
    expect(codes(report)).toContain("reference-date-unknown");
  });
  test("future dates are not presented as known", () => {
    expect(isFutureEvidence("2027-01-01", "2026-11-19")).toBe(true);
    expect(codes(auditEvidenceRow(copy(row(), "date", "2027-01-01"), "2026-11-19")))
      .toContain("metadata-date-future");
  });
  test("missing reference date never creates a future claim", () => {
    expect(isFutureEvidence("2026-11-19", "UNKNOWN")).toBeNull();
  });
});

test.describe("P20W tier and language metadata", () => {
  for (const tier of ["0", "1", "2", "3", "4", "E", "e"]) {
    test(`accepts canonical tier ${tier}`, () => {
      expect(evidenceTier(tier)).not.toBe("UNKNOWN");
    });
  }
  for (const tier of ["", "UNKNOWN", "5", "A", "Tier 2", "reported", "undetermined"]) {
    test(`does not invent a tier from ${JSON.stringify(tier)}`, () => {
      expect(evidenceTier(tier)).toBe("UNKNOWN");
    });
  }
  test("malformed nonempty tier has a finding", () => {
    expect(codes(auditEvidenceRow(copy(row(), "tier", "Tier two"), "2026-11-19")))
      .toContain("metadata-tier-invalid");
  });
  test("a missing tier is not assigned the lowest value", () => {
    const result = auditEvidenceRow(copy(row(), "tier", "UNKNOWN"), "2026-11-19");
    expect(result.unknownFields).toContain("tier");
    expect(result.status).toBe("UNKNOWN");
  });
  for (const language of ["fr", "fr-CA", "en", "en-US", "es-MX"]) {
    test(`accepts structural language tag ${language}`, () => {
      expect(isLanguageTag(language)).toBe(true);
    });
  }
  for (const language of ["", "?", "français", "fr_XX", "en-", "invalidlongsubtag-abcdefghijk"] ) {
    test(`does not accept malformed language ${language}`, () => {
      expect(isLanguageTag(language)).toBe(false);
    });
  }
  test("lang inheritance uses the most precise mark", () => {
    const value = { text: "Municipal catalogue", sourceLanguage: "fr-CA", markedLanguage: "en" };
    expect(effectiveLanguage(value, "fr")).toBe("en");
  });
  test("document language fills absence of an inherited mark", () => {
    expect(effectiveLanguage({ text: "Source", sourceLanguage: null, markedLanguage: null }, "fr")).toBe("fr");
  });
  test("regional language tags normalize only the base", () => {
    expect(primaryLanguage("fr-CA")).toBe("fr");
    expect(primaryLanguage("en-CA")).toBe("en");
    expect(primaryLanguage("es-MX")).toBeNull();
  });
  test("bad explicit metadata language is a finding", () => {
    const source: EvidenceValue = { text: "Municipal catalogue", sourceLanguage: "en", markedLanguage: "?" };
    const result = auditEvidenceRow(row({ fields: { ...row().fields, source } }), "2026-11-19");
    expect(codes(result)).toContain("metadata-language-invalid");
  });
  test("short source or licence identifiers are not accepted as descriptive", () => {
    expect(codes(auditEvidenceRow(copy(row(), "source", "X"), "2026-11-19"))).toContain("metadata-source-short");
    expect(codes(auditEvidenceRow(copy(row(), "licence", "X"), "2026-11-19"))).toContain("metadata-licence-short");
  });
});

test.describe("P20W multi-record and transition policies", () => {
  test("empty collections cannot produce positive evidence", () => {
    expect(auditEvidenceList([], "2026-11-19")).toEqual({ total: 0, known: 0, unknown: 0, findings: [] });
  });
  test("hidden entries do not count as visible records", () => {
    expect(auditEvidenceList([row({ visible: false })], "2026-11-19").total).toBe(0);
  });
  test("mixed known and unknown entries retain both states", () => {
    const result = auditEvidenceList([row(), copy(row({ id: "two" }), "source", "UNKNOWN")], "2026-11-19");
    expect(result).toMatchObject({ total: 2, known: 1, unknown: 1 });
  });
  test("duplicated visible identifiers cannot count as independent known records", () => {
    const result = auditEvidenceList([row(), row()], "2026-11-19");
    expect(result.known).toBe(0);
    expect(result.findings.some((item) => item.code === "record-duplicate")).toBe(true);
  });
  test("aggregate field counts do not include invisible records", () => {
    const result = countUnknownByField([copy(row(), "date", null), row({ visible: false })]);
    expect(result).toEqual({ source: 0, licence: 0, date: 1, tier: 0 });
  });
  test("known fields are not inferred from the record title", () => {
    expect(hasEvidenceForAllFields(copy(row(), "licence", null))).toBe(false);
    expect(hasEvidenceForAllFields(row())).toBe(true);
  });
  test("metadata digest counts uncertain records", () => {
    expect(evidenceDigest([row(), copy(row({ id: "two" }), "tier", "UNKNOWN")]))
      .toBe("records=2; visible=2; uncertain=1");
  });
  test("metadata signature preserves UNKNOWN as missing", () => {
    const signature = metadataSignature(copy(row(), "date", "UNKNOWN"));
    expect(signature.date).toBeNull();
    expect(signature.source).toBe("Municipal catalogue");
  });
  test("a stable offline observation does not invent new facts", () => {
    expect(transitionEvidenceFindings({ before: row(), after: row(), offline: true, languageChanged: false })).toEqual([]);
  });
  test("a mismatch in stable licence is a finding", () => {
    const transition = { before: row(), after: copy(row(), "licence", "CC BY 4.0"), offline: false, languageChanged: false };
    expect(transitionCodes(transitionEvidenceFindings(transition))).toContain("record-metadata-changed");
  });
  test("language change permits a translated source label", () => {
    const after = copy(row({ locale: "fr" }), "source", "Catalogue municipal");
    expect(transitionEvidenceFindings({ before: row(), after, offline: false, languageChanged: true })).toEqual([]);
  });
  test("language change cannot silently change an observation date", () => {
    const after = copy(row({ locale: "fr" }), "date", "2026-11-18");
    expect(transitionCodes(transitionEvidenceFindings({ before: row(), after, offline: false, languageChanged: true })))
      .toContain("record-metadata-changed");
  });
  test("offline transition preserves local-only claims", () => {
    const after = row({ localOnly: false });
    expect(transitionCodes(transitionEvidenceFindings({ before: row(), after, offline: true, languageChanged: false })))
      .toContain("record-storage-claim");
  });
  test("missing counterparts do not become known after merging", () => {
    const merged = mergeEvidenceConservatively(row(), copy(row(), "source", "UNKNOWN"));
    expect(merged?.fields.source?.text).toBe("UNKNOWN");
  });
  test("conflicting metadata is explicitly degraded rather than guessed", () => {
    const merged = mergeEvidenceConservatively(row(), copy(row(), "tier", "2"));
    expect(merged?.fields.tier?.text).toBe("UNKNOWN");
  });
  test("unrelated record identities cannot be combined", () => {
    expect(mergeEvidenceConservatively(row(), row({ id: "elsewhere" }))).toBeNull();
  });
  test("matching records in two locales retain known neutral fields", () => {
    const translated = row({ locale: "fr", label: "Fiche de démonstration" });
    expect(conservativeLocaleComparison(row(), translated)).toBe("KNOWN");
  });
  test("a missing counterpart is never known", () => {
    expect(conservativeLocaleComparison(row(), copy(row({ locale: "fr" }), "tier", null))).toBe("UNKNOWN");
  });
  test("diagnostics are limited and deduplicated", () => {
    const issues = auditEvidenceRow(row({ label: "" }), "2026-11-19").findings;
    expect(formatEvidenceFindings([...issues, ...issues]).split("\n")).toHaveLength(1);
  });
});
