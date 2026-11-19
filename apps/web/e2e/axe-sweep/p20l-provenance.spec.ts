import { expect, test } from "@playwright/test";
import {
  auditEvidenceCard,
  auditEvidenceCards,
  evidenceAge,
  fieldLabels,
  formatFindings,
  isOpenLicence,
  isUnknown,
  matchesFieldLabel,
  normalize,
  parseCalendarDate,
  readEvidenceValues,
  routeInventoryFindings,
  type EvidenceCard,
  type EvidenceCell,
  type Locale,
} from "./p20l-provenance";

const make = (locale: Locale, values: readonly string[] = ["Civic source", "ODbL-1.0", "2026-11-15", "E"]): EvidenceCard => ({
  location: "/places#result-1",
  name: "Example entry",
  visible: true,
  descriptionLists: [[
    { term: locale === "fr" ? "Source" : "Source", value: values[0] ?? "" },
    { term: "Licence", value: values[1] ?? "" },
    { term: locale === "fr" ? "Date" : "Date", value: values[2] ?? "" },
    { term: locale === "fr" ? "Niveau" : "Tier", value: values[3] ?? "" },
  ]],
});

const table = (locale: Locale): readonly EvidenceCell[] => make(locale).descriptionLists[0] ?? [];

for (const locale of ["en", "fr"] as const) {
  test.describe(`P20L evidence contracts ${locale}`, () => {
    test("complete openly licensed record has four distinct fields", () => {
      const result = auditEvidenceCard(make(locale), locale);
      expect(result.knowledge).toBe("KNOWN");
      expect(result.findings).toEqual([]);
      const { values, duplicated } = readEvidenceValues(table(locale), locale);
      expect(values).toEqual({ source: "Civic source", licence: "ODbL-1.0", date: "2026-11-15", tier: "E" });
      expect(duplicated).toEqual([]);
    });

    test("unknown source never becomes known", () => {
      const result = auditEvidenceCard(make(locale, ["UNKNOWN", "ODbL-1.0", "2026-11-15", "E"]), locale);
      expect(result.knowledge).toBe("UNKNOWN");
      expect(result.findings).toEqual([]);
    });

    test("missing source label is detected even when a value exists", () => {
      const entry = make(locale);
      const list = entry.descriptionLists[0] ?? [];
      const broken: EvidenceCard = {
        ...entry,
        descriptionLists: [[{ term: "Unrelated", value: "Civic source" }, ...list.slice(1)]],
      };
      const result = auditEvidenceCard(broken, locale);
      expect(result.knowledge).toBe("UNKNOWN");
      expect(result.findings.map((issue) => issue.code)).toContain("missing-field");
    });

    test("duplicate field labels are not silently resolved", () => {
      const entry = make(locale);
      const list = entry.descriptionLists[0] ?? [];
      const result = auditEvidenceCard({ ...entry, descriptionLists: [[...list, list[0]!]] }, locale);
      expect(result.findings.map((issue) => issue.code)).toContain("duplicate-field");
    });

    test("a malformed known date is rejected", () => {
      const result = auditEvidenceCard(make(locale, ["Civic source", "ODbL-1.0", "2026-02-30", "E"]), locale);
      expect(result.findings.map((issue) => issue.code)).toContain("invalid-date");
      expect(result.knowledge).toBe("UNKNOWN");
    });

    test("a proprietary licence cannot become known evidence", () => {
      const result = auditEvidenceCard(make(locale, ["Civic source", "All rights reserved", "2026-11-15", "E"]), locale);
      expect(result.findings.map((issue) => issue.code)).toContain("non-open-licence");
      expect(result.knowledge).toBe("UNKNOWN");
    });

    test("missing tier remains unknown rather than defaulting to E", () => {
      const result = auditEvidenceCard(make(locale, ["Civic source", "ODbL-1.0", "2026-11-15", ""]), locale);
      expect(result.knowledge).toBe("UNKNOWN");
      expect(result.findings).toEqual([]);
    });

    test("empty cards are not treated as positive location evidence", () => {
      const result = auditEvidenceCard({ ...make(locale), descriptionLists: [] }, locale);
      expect(result.knowledge).toBe("UNKNOWN");
      expect(result.findings).toEqual([]);
    });

    test("a hidden card cannot claim known status", () => {
      const result = auditEvidenceCard({ ...make(locale), visible: false }, locale);
      expect(result.knowledge).toBe("UNKNOWN");
      expect(result.findings).toEqual([]);
    });

    test("visible records must expose their names", () => {
      const result = auditEvidenceCard({ ...make(locale), name: "" }, locale);
      expect(result.findings.map((issue) => issue.code)).toContain("record-name");
    });

    test("each metadata term has a matching description", () => {
      const values = readEvidenceValues(table(locale), locale).values;
      for (const field of ["source", "licence", "date", "tier"] as const) {
        expect(values[field]).toBeTruthy();
        expect(fieldLabels(locale)[field].length).toBeGreaterThan(0);
      }
    });
  });
}

test.describe("P20L evidence state and route inventory", () => {
  test.each(["", "  ", "UNKNOWN", "Unknown", "Inconnu", "Inconnue", "—", "n/a", "Not provided"])(
    "absence stays unknown: %s", (value) => expect(isUnknown(value)).toBe(true),
  );
  test.each(["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "Open Government Licence - Ontario", "Licence du gouvernement ouvert"])(
    "recognizes an open licence: %s", (value) => expect(isOpenLicence(value)).toBe(true),
  );
  test.each(["Proprietary", "Exclusive licence", "All rights reserved", "", "UNKNOWN"])(
    "does not mark unsupported licences open: %s", (value) => expect(isOpenLicence(value)).toBe(false),
  );
  test.each(["2025-02-29", "2026-02-30", "2026-00-01", "2026-11-31", "0000-01-01", "2026/11/15"])(
    "rejects invalid calendar dates: %s", (value) => expect(parseCalendarDate(value)).toBe(false),
  );
  test("supports leap day", () => expect(parseCalendarDate("2024-02-29")).toBe(true));
  test("does not assign age to future records", () => expect(evidenceAge("2027-01-01", "2026-11-19")).toBe("UNKNOWN"));
  test("a dated observation can be recognized without claiming freshness", () => expect(evidenceAge("2026-11-01", "2026-11-19")).toBe("KNOWN"));
  test("normalization preserves legitimate accented text", () => expect(normalize("  RÉCUPÉRÉ ")).toBe("récupéré"));
  test("word boundaries prevent substring label matches", () => {
    expect(matchesFieldLabel("source", "source", "en")).toBe(true);
    expect(matchesFieldLabel("resourcefulness", "source", "en")).toBe(false);
  });
  test("route inventory is independent of any current route count", () => {
    expect(routeInventoryFindings(["/", "/places", "/help"], ["/", "/places"])).toEqual([]);
    expect(routeInventoryFindings(["/", "/places", "/help", "/another"], ["/", "/places"])).toEqual([]);
  });
  test("detects duplicates, missing required routes and malformed paths", () => {
    const findings = routeInventoryFindings(["/", "/", "bad", "/places?x=1"], ["/places", "/help"]);
    expect(findings.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "duplicate-route", "invalid-route", "required-route-absent",
    ]));
  });
  test("unrelated empty record sets produce no positive claims", () => {
    expect(auditEvidenceCards([], "en", "/places")).toMatchObject({ total: 0, known: 0, unknown: 0, findings: [] });
  });
  test("aggregated results retain individual unknowns", () => {
    const result = auditEvidenceCards([make("en"), make("en", ["Unknown", "Unknown", "Unknown", "Unknown"])], "en", "/places");
    expect(result).toMatchObject({ total: 2, known: 1, unknown: 1, findings: [] });
  });
  test("diagnostics do not leak other records into a finding", () => {
    const findings = auditEvidenceCard({ ...make("en"), name: "" }, "en").findings;
    expect(formatFindings(findings)).toContain("record-name");
    expect(formatFindings(findings)).not.toContain("Civic source");
  });
});
