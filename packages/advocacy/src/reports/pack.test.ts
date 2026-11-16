import { describe, expect, it } from "vitest";
import { assertNoForbiddenOrg, containsForbiddenOrg, endorsedByForbiddenOrgSample } from "../../../shared/test/forbiddenOrg.ts";
import { findPersonalData } from "../validate.ts";
import { DEMO_CONSENT_LEDGER, DEMO_INPUT_SETS, DEMO_PURPOSE, DEMO_REGIONS, DEMO_REPORTS, DEMO_REPORT_AS_OF } from "./demo.ts";
import { buildReportEvidencePack, fingerprintOf, packMarkdown, tablesCsv, type ReportPackInput, type ReportPackResult } from "./pack.ts";
import { TEST_PURPOSE, grant, grantsFor, inputSet, many, region, report, seeded } from "./test-helpers.ts";
import type { AdvocacyReport, ReportEvidencePack } from "./types.ts";

const AS_OF = "2026-11-15";
const REGIONS = [region("test-a"), region("test-b")];
const options = { asOf: AS_OF, requiredPurpose: TEST_PURPOSE };

function baseReports() {
  return [
    ...many(12, "parking", "bay_misused", "test-a"),
    ...many(8, "parking", "bay_blocked", "test-a"),
    ...many(2, "parking", "bay_misused", "test-b"),
    ...many(9, "parking", "bay_blocked", "test-b"),
    ...many(3, "coverage", "request_delayed", "test-a"),
  ];
}

function inputFor(reports: readonly unknown[] = baseReports(), overrides: Partial<ReportPackInput> = {}): ReportPackInput {
  return { reports, inputSets: [inputSet()], regions: REGIONS, consentLedger: grantsFor(reports as AdvocacyReport[]), ...overrides };
}

function built(result: ReportPackResult): Extract<ReportPackResult, { ok: true }> {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  return result;
}

function codes(result: ReportPackResult): string[] {
  return result.ok ? [] : result.refusal.map((reason) => reason.code);
}

describe("consent gate", () => {
  it("builds when every report has a granted consent record for the required purpose", () => {
    const { pack } = built(buildReportEvidencePack(inputFor(), options));
    expect(pack.consent).toEqual({ required_purpose: TEST_PURPOSE, all_reports_granted: true });
  });

  it("refuses when one consent record is missing", () => {
    const reports = baseReports();
    const result = buildReportEvidencePack(inputFor(reports, { consentLedger: grantsFor(reports).slice(1) }), options);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.refusal).toEqual([{ code: "consent_missing", count: 1, refs: [reports[0]?.id] }]);
  });

  it("refuses when one consent was revoked", () => {
    const reports = baseReports();
    const ledger = grantsFor(reports).map((entry, i) => (i === 3 ? { ...entry, status: "revoked" as const } : entry));
    expect(codes(buildReportEvidencePack(inputFor(reports, { consentLedger: ledger }), options))).toEqual(["consent_revoked"]);
  });

  it("refuses when a consent is refused, not asked or out of date", () => {
    for (const status of ["refused", "not_asked", "outdated"] as const) {
      const reports = baseReports();
      const ledger = grantsFor(reports).map((entry, i) => (i === 0 ? { ...entry, status } : entry));
      expect(codes(buildReportEvidencePack(inputFor(reports, { consentLedger: ledger }), options))).toEqual(["consent_not_granted"]);
    }
  });

  it("refuses a consent given for another purpose or an earlier version of the purpose", () => {
    const reports = baseReports();
    const other = grantsFor(reports).map((entry, i) => (i === 0 ? { ...entry, purpose_id: "example-other-purpose" } : entry));
    expect(codes(buildReportEvidencePack(inputFor(reports, { consentLedger: other }), options))).toEqual(["consent_wrong_purpose"]);
    expect(codes(buildReportEvidencePack(inputFor(reports), { ...options, requiredPurpose: { ...TEST_PURPOSE, purpose_version: 2 } }))).toEqual(["consent_wrong_purpose"]);
  });

  it("refuses when two ledger entries answer for one reference, even if one of them is granted", () => {
    const reports = baseReports();
    const first = reports[0];
    const ledger = [...grantsFor(reports), grant(first?.consent_ref ?? "", { status: "revoked" })];
    expect(codes(buildReportEvidencePack(inputFor(reports, { consentLedger: ledger }), options))).toEqual(["consent_ambiguous"]);
  });

  it("refuses with an empty ledger, and returns no pack or file at all", () => {
    const result = buildReportEvidencePack(inputFor(baseReports(), { consentLedger: [] }), options);
    expect(result.ok).toBe(false);
    expect(Object.keys(result).sort()).toEqual(["ok", "refusal"]);
  });
});

describe("other refusals", () => {
  it("refuses when there are no reports", () => {
    expect(codes(buildReportEvidencePack(inputFor([]), options))).toEqual(["no_reports"]);
  });

  it("refuses invalid records, duplicate ids, and reports that name a missing set or region", () => {
    const reports = baseReports();
    expect(codes(buildReportEvidencePack(inputFor([...reports, { ...report(), email: "x" }]), options))).toContain("invalid_report");
    expect(codes(buildReportEvidencePack(inputFor([...reports, reports[0]]), options))).toContain("duplicate_report_id");
    expect(codes(buildReportEvidencePack(inputFor(reports, { inputSets: [] }), options))).toEqual(["unknown_set"]);
    expect(codes(buildReportEvidencePack(inputFor(reports, { regions: [region("test-a")] }), options))).toEqual(["unknown_region"]);
    expect(codes(buildReportEvidencePack(inputFor(reports, { regions: [...REGIONS, region("test-a")] }), options))).toContain("invalid_region_table");
    expect(codes(buildReportEvidencePack(inputFor(reports, { inputSets: [inputSet({ tier: 2 })] }), options))).toContain("invalid_input_set");
  });

  it("refuses a set that claims a tier or label this prototype cannot carry", () => {
    for (const bad of [{ tier: 3 }, { tier: 4 }, { label: "VERIFIED" }, { tier: 0, label: "COMMUNITY-REPORTED" }]) {
      const result = buildReportEvidencePack(inputFor(baseReports(), { inputSets: [{ ...inputSet(), ...bad }] }), options);
      expect(codes(result)).toContain("invalid_input_set");
    }
  });

  it("throws on options that make no sense", () => {
    expect(() => buildReportEvidencePack(inputFor(), { ...options, asOf: "2026-02-30" })).toThrow(RangeError);
    expect(() => buildReportEvidencePack(inputFor(), { ...options, minimumCellSize: 2 })).toThrow(RangeError);
    expect(() => buildReportEvidencePack(inputFor(), { ...options, requiredPurpose: { purpose_id: "", purpose_version: 1 } })).toThrow(RangeError);
  });
});

describe("pack content", () => {
  const reports = baseReports();
  const sets = [
    inputSet({ id: "example-set", source_date: "2026-11-01" }),
    inputSet({ id: "example-set-b", source_name: "Second test set", source_url: "https://example.invalid/set-b", source_date: "UNKNOWN", tier: 2, label: "COMMUNITY-REPORTED" }),
    inputSet({ id: "example-unused" }),
  ];
  const second = many(6, "parking", "bay_misused", "test-a").map((r) => ({ ...r, set_id: "example-set-b" }));
  const all = [...reports, ...second];
  const { pack, files } = built(buildReportEvidencePack(inputFor(all, { inputSets: sets }), options));

  it("states the date, methodology, limits and suppression rules in English and French", () => {
    expect(pack.as_of).toBe(AS_OF);
    expect(pack.methodology.en).toHaveLength(5);
    expect(pack.methodology.fr).toHaveLength(5);
    expect(pack.limits.en[0]).toBe("These are reports, not a census. They count what people chose to report, not everything that happened.");
    expect(pack.limits.en[1]).toBe("The reports are not verified. No one has checked them on site.");
    expect(pack.limits.fr[0]).toContain("pas un recensement");
    expect(pack.suppression.minimum_cell_size).toBe(5);
    expect(pack.suppression.rules.map((rule) => rule.id)).toEqual([
      "minimum_cell_size",
      "table_withheld",
      "small_region_roll_up",
      "row_roll_up",
      "topic_combining",
      "primary_suppression",
      "complementary_suppression",
      "no_split",
    ]);
    for (const rule of pack.suppression.rules) {
      expect(rule.en).not.toMatch(/\{\w+\}/);
      expect(rule.fr).not.toMatch(/\{\w+\}/);
    }
  });

  it("gives source, licence, date and tier for every input set that was used, and only those", () => {
    expect(pack.provenance).toEqual([
      { set_id: "example-set", source_name: "Test data", source_url: null, licence: "not-a-real-dataset", source_date: "2026-11-01", tier: 0, label: "PROTOTYPE-UNVERIFIED", example: true },
      { set_id: "example-set-b", source_name: "Second test set", source_url: "https://example.invalid/set-b", licence: "not-a-real-dataset", source_date: "UNKNOWN", tier: 2, label: "COMMUNITY-REPORTED", example: true },
    ]);
  });

  it("counts what was suppressed", () => {
    expect(pack.suppression.counts).toEqual({
      tables_published: 1,
      tables_withheld: 1,
      cells_published: 6,
      cells_suppressed: 4,
      rows_rolled_up: 0,
      topics_combined: 0,
    });
    expect(pack.reports_in_published_tables).toBe(37);
  });

  it("does not reveal how many reports sit in a withheld table", () => {
    const text = files.map((file) => file.content).join("\n");
    expect(pack.tables.find((table) => table.state === "withheld")).toEqual({ id: "coverage:2026-10", state: "withheld", kind: "coverage", period: "2026-10" });
    // 40 reports went in; 3 of them are in the withheld table. Neither 40 nor 3 may be derivable.
    expect(text).not.toMatch(/\b40\b/);
    expect(JSON.stringify(pack)).not.toMatch(/reports_received|reports_total|"count":\s*[1-4]\b/);
  });

  it("is marked as demonstration when it is built from example records", () => {
    expect(pack.demonstration).toBe(true);
    expect(packMarkdown(pack, "en")).toContain("This pack is a demonstration.");
    expect(packMarkdown(pack, "fr")).toContain("Ce dossier est une démonstration.");
  });

  it("writes JSON, two CSV files and a read-me in each language, named after the as-of date", () => {
    expect(files.map((file) => [file.name, file.mime])).toEqual([
      ["advocacy-report-pack-2026-11-15.json", "application/json"],
      ["advocacy-report-pack-2026-11-15-tables.csv", "text/csv"],
      ["advocacy-report-pack-2026-11-15-provenance.csv", "text/csv"],
      ["advocacy-report-pack-2026-11-15.en.md", "text/markdown"],
      ["advocacy-report-pack-2026-11-15.fr.md", "text/markdown"],
    ]);
    expect(JSON.parse(files[0]?.content ?? "")).toEqual(pack);
  });

  it("leaves the count empty for suppressed cells and withheld tables in the CSV", () => {
    const lines = tablesCsv(pack).trimEnd().split("\r\n");
    expect(lines[0]).toBe("table_id,kind,period,region_code,topic,state,count");
    expect(lines).toContain("parking:2026-10,parking,2026-10,test-b,bay_misused,suppressed,");
    expect(lines).toContain("parking:2026-10,parking,2026-10,test-a,TOTAL,published,26");
    expect(lines).toContain("parking:2026-10,parking,2026-10,TOTAL,TOTAL,published,37");
    expect(lines).toContain("coverage:2026-10,coverage,2026-10,,,withheld,");
    for (const line of lines.slice(1)) {
      const [, , , , , state, count] = line.split(",");
      if (state === "published") expect(Number(count) === 0 || Number(count) >= 5).toBe(true);
      else expect(count).toBe("");
    }
  });

  it("writes the limits, rules, provenance and tables into the read-me, with suppressed cells in words", () => {
    const en = packMarkdown(pack, "en");
    for (const heading of ["## Limits", "## Methodology", "## Consent", "## Suppression rules applied", "## What was suppressed", "## Provenance of the inputs", "## Tables"]) {
      expect(en).toContain(heading);
    }
    expect(en).toContain("These are reports, not a census.");
    expect(en).toContain("| test-b | Suppressed | Suppressed | 0 | 0 | 0 | 11 |");
    expect(en).toContain("This table is withheld because it has fewer than 5 reports.");
    expect(en).toContain("Tier 2: peer report");
    const fr = packMarkdown(pack, "fr");
    expect(fr).toContain("## Limites");
    expect(fr).toContain("Supprimée");
    expect(fr).not.toContain("Suppressed");
  });

  it("carries no report id, consent reference, personal field or day-level date of a report", () => {
    const text = files.map((file) => file.content).join("\n");
    for (const r of all) {
      expect(text).not.toContain(r.id);
      expect(text).not.toContain(r.consent_ref);
    }
    expect(findPersonalData(pack)).toEqual([]);
    const days = new Set(text.match(/\d{4}-\d{2}-\d{2}/g) ?? []);
    expect([...days].sort()).toEqual(["2026-11-01", "2026-11-15"]);
    expect(text).not.toMatch(/\d{2}:\d{2}/);
  });

  it("names no organisation and makes no claim of backing", () => {
    for (const file of files) assertNoForbiddenOrg(file.content, file.name);
    expect(containsForbiddenOrg(endorsedByForbiddenOrgSample("en"))).toBe(true);
    expect(containsForbiddenOrg(endorsedByForbiddenOrgSample("fr"))).toBe(true);
    for (const file of files) expect(file.content.toLowerCase()).not.toMatch(/endorsed|partner/);
  });

  it("guards the CSV against values a spreadsheet would run as a formula", () => {
    const risky = built(
      buildReportEvidencePack(inputFor(reports, { inputSets: [inputSet({ source_name: '=HYPERLINK("x"), a', licence: "+1" })] }), options),
    );
    const csv = risky.files[2]?.content ?? "";
    expect(csv).toContain(`"'=HYPERLINK(""x""), a"`);
    expect(csv).toContain(",'+1,");
  });
});

describe("reproducible output", () => {
  it("gives the same bytes for the same input, and for the same input in any order", () => {
    const reports = baseReports();
    const input = inputFor(reports);
    const first = built(buildReportEvidencePack(input, options));
    const again = built(buildReportEvidencePack(input, options));
    expect(again.files).toEqual(first.files);

    const next = seeded(7);
    const shuffle = <T>(list: readonly T[]): T[] => [...list].map((v) => [next(), v] as const).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    for (let round = 0; round < 5; round += 1) {
      const mixed = built(
        buildReportEvidencePack(
          { reports: shuffle(input.reports), inputSets: shuffle(input.inputSets), regions: shuffle(input.regions), consentLedger: shuffle(input.consentLedger) },
          options,
        ),
      );
      expect(mixed.files).toEqual(first.files);
      expect(mixed.pack.fingerprint).toBe(first.pack.fingerprint);
    }
  });

  it("changes the fingerprint when the as-of date, the minimum or the data changes", () => {
    const reports = baseReports();
    const base = built(buildReportEvidencePack(inputFor(reports), options)).pack.fingerprint;
    const more = [...reports, ...many(1, "parking", "bay_misused", "test-a")];
    expect(built(buildReportEvidencePack(inputFor(reports), { ...options, asOf: "2026-11-16" })).pack.fingerprint).not.toBe(base);
    expect(built(buildReportEvidencePack(inputFor(reports), { ...options, minimumCellSize: 3 })).pack.fingerprint).not.toBe(base);
    expect(built(buildReportEvidencePack(inputFor(more), options)).pack.fingerprint).not.toBe(base);
  });

  it("has a fingerprint that covers everything else in the pack", () => {
    const { pack } = built(buildReportEvidencePack(inputFor(), options));
    const { fingerprint, ...body } = pack;
    expect(fingerprint).toBe(fingerprintOf(JSON.stringify(body)));
    expect(fingerprint).toMatch(/^fnv1a-[0-9a-f]{16}$/);
  });

  it("never reads the clock", () => {
    const real = Date.now;
    Date.now = () => {
      throw new Error("clock read");
    };
    try {
      expect(built(buildReportEvidencePack(inputFor(), options)).pack.as_of).toBe(AS_OF);
    } finally {
      Date.now = real;
    }
  });
});

describe("demonstration pack", () => {
  const result = built(
    buildReportEvidencePack(
      { reports: DEMO_REPORTS, inputSets: DEMO_INPUT_SETS, regions: DEMO_REGIONS, consentLedger: DEMO_CONSENT_LEDGER },
      { asOf: DEMO_REPORT_AS_OF, requiredPurpose: DEMO_PURPOSE },
    ),
  );
  const pack: ReportEvidencePack = result.pack;

  it("is built only from records marked as examples", () => {
    expect(DEMO_REPORTS.every((r) => r.example)).toBe(true);
    expect(DEMO_REGIONS.every((r) => r.example)).toBe(true);
    expect(DEMO_INPUT_SETS.every((s) => s.example && s.licence === "not-a-real-dataset")).toBe(true);
    expect(pack.demonstration).toBe(true);
  });

  it("shows each rule at work: a withheld table, a rolled-up region, combined topics and suppressed cells", () => {
    expect(pack.tables.map((t) => `${t.id}:${t.state}`)).toEqual([
      "barrier:2026-10:published",
      "parking:2026-10:published",
      "coverage:2026-10:withheld",
      "housing_wait:2026-09:published",
    ]);
    const parking = pack.tables.find((t) => t.id === "parking:2026-10");
    expect(parking?.state === "published" && parking.rolled_up_rows).toEqual(["demo-area-east"]);
    expect(parking?.state === "published" && parking.rows.map((r) => r.region_code)).toEqual(["demo-area-east", "demo-area-west", "demo-north-1", "demo-north-2"]);
    expect(parking?.state === "published" && parking.suppressed_cells).toBeGreaterThanOrEqual(4);
    const barrier = pack.tables.find((t) => t.id === "barrier:2026-10");
    expect(barrier?.state === "published" && barrier.combined_topics.length).toBeGreaterThan(0);
    expect(pack.suppression.counts.tables_withheld).toBe(1);
  });
});
