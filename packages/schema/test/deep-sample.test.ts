import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import { DeepSampler, NOT_CHECKED, deepSampleMarkdown, type DeepSampleReport } from "../src/deep-sample.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fact(value: unknown, extra: Record<string, unknown> = {}) {
  return { value, source_id: "test-source", licence: "test-licence", retrieved_at: "2026-11-13", tier: 0, ...extra };
}

function record(id: string, fields: Record<string, unknown>) {
  return { id, tranche: "washroom", fields };
}

function run(records: unknown[], options: Partial<ConstructorParameters<typeof DeepSampler>[0]> = {}, file = "seed/test.ndjson"): DeepSampleReport {
  const sampler = new DeepSampler({ seed: "day-30", asOf: "2026-11-14", ...options });
  for (const item of records) sampler.add(item, file);
  return sampler.finish();
}

describe("deep sample", () => {
  it("draws the same sample for the same seed and a different one for another seed", () => {
    const records = Array.from({ length: 200 }, (_, i) => record(`r-${i}`, { name: fact(`Name ${i}`) }));
    const first = run(records).sample.map((item) => item.record_id);
    const again = run(records).sample.map((item) => item.record_id);
    const other = run(records, { seed: "another" }).sample.map((item) => item.record_id);
    expect(first).toHaveLength(20);
    expect(new Set(first).size).toBe(20);
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it("samples every record when a file has fewer than the sample size", () => {
    const report = run([record("a", { name: fact("A") }), record("b", { name: fact("B") })]);
    expect(report.files[0]).toMatchObject({ counted: 2, sampled: 2, status: "no expected count given" });
  });

  it("never fills in the cross-check columns and never returns PASS", () => {
    const report = run([record("a", { name: fact("A"), wheelchair: fact("UNKNOWN") })]);
    const rows = report.sample[0]!.populated_fields;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stated_source_check: NOT_CHECKED, second_source: NOT_CHECKED, second_source_agreement: NOT_CHECKED });
    expect(report.sample[0]!.unknown_fields).toEqual(["wheelchair"]);
    expect(report.human_checks_open).toBe(1);
    expect(report.automatic_result).toBe("NO AUTOMATIC DEFECT");
    expect(JSON.stringify(report)).not.toMatch(/"PASS"/);
    expect(report.statement).toContain("cannot give PASS");
  });

  it("reconciles its own count to the seed-count report", () => {
    const records = [record("a", { name: fact("A") }), record("b", { name: fact("B") })];
    expect(run(records, { expectedCounts: { "seed/test.ndjson": 2 } }).files[0]!.status).toBe("match");
    const wrong = run(records, { expectedCounts: { "seed/test.ndjson": 3, "seed/absent.ndjson": 5 } });
    expect(wrong.files.map((file) => file.status)).toEqual(["mismatch", "mismatch"]);
    expect(wrong.automatic_result).toBe("BLOCK");
  });

  it("finds duplicates inside a file and across files", () => {
    const sampler = new DeepSampler({ seed: "s", asOf: "2026-11-14" });
    sampler.add(record("a", {}), "one.json");
    sampler.add(record("a", {}), "one.json");
    sampler.add(record("a", {}), "two.json");
    sampler.add({ tranche: "venue", fields: {} }, "two.json");
    const report = sampler.finish();
    expect(report.defect_totals).toMatchObject({ duplicate_id: 2, missing_id: 1 });
    expect(report.defects.find((defect) => defect.file === "two.json" && defect.code === "duplicate_id")!.detail).toContain("one.json");
  });

  it("flags blanks, zeros, missing provenance, and numbers with no method", () => {
    const report = run([
      record("x", {
        blank: fact("  "),
        ramp_slope_percent: fact(0),
        door_width_mm: fact(810, { unit: "mm" }),
        measured_width_mm: fact(900, { unit: "mm", method: "tape measure", observed_at: "2026-11-01" }),
        observed_zero: fact(0, { method: "count on site", observed_at: "2026-11-01" }),
        lat: fact(43.65, { source_key: "geometry" }),
        nosrc: { value: "yes", tier: 0 },
      }),
    ]);
    expect(report.defect_totals).toEqual({
      blank_value: 1,
      zero_value: 1,
      measurement_without_method: 1,
      missing_source: 1,
      missing_licence: 1,
      missing_date: 1,
    });
    expect(report.defects.find((defect) => defect.code === "measurement_without_method")!.field).toBe("door_width_mm");
    expect(report.sample[0]!.unknown_fields).toContain("blank");
    expect(report.automatic_result).toBe("BLOCK");
  });

  it("flags any tier above the seed tiers, on a field or on the record", () => {
    const report = run([
      record("t", { name: fact("A", { tier: 3 }), other: { value: "b", source_id: "s", licence: "l", retrieved_at: "2026-11-13" } }),
      {
        id: "canonical",
        record_type: "place",
        provenance: { tier: 0, prototype_label: "VERIFIED", source_name: "S", licence_id: "l", source_date: "2026-11-13" },
        facts: {},
      },
      {
        id: "fine",
        record_type: "place",
        provenance: { tier: 0, prototype_label: "SEEDED-OPEN-DATA", source_name: "S", licence_id: "l", source_date: "2026-11-13" },
        facts: {},
      },
    ]);
    expect(report.defect_totals).toEqual({ tier_above_seed: 2, missing_tier: 1 });
  });

  it("caps the defect list but keeps the full total", () => {
    const records = Array.from({ length: 30 }, (_, i) => record(`z-${i}`, { n: fact(0) }));
    const report = run(records, { defectLimit: 5 });
    expect(report.defects).toHaveLength(5);
    expect(report.defect_totals.zero_value).toBe(30);
  });

  it("requires a seed and a sensible sample size", () => {
    expect(() => new DeepSampler({ seed: " ", asOf: "2026-11-14" })).toThrow(/seed/);
    expect(() => new DeepSampler({ seed: "s", asOf: "2026-11-14", sampleSize: 0 })).toThrow(/sample size/);
  });

  it("writes a worksheet a person can fill in", () => {
    const markdown = deepSampleMarkdown(run([record("pipe|id", { name: fact("A | B") }), record("empty", { name: fact("UNKNOWN") })]));
    expect(markdown).toContain("# Seed-data deep sample");
    expect(markdown).toContain("pipe\\|id");
    expect(markdown).toContain("A \\| B");
    expect(markdown).toContain("| not checked | not checked | not checked |");
    expect(markdown).toContain("No populated field. Every field is unknown.");
    expect(markdown).toContain("This is not a finding that the data is correct.");
  });
});

describe("deep-sample command", () => {
  function capture(): { out: () => string; restore: () => void } {
    let buffer = "";
    const out = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      buffer += String(chunk);
      return true;
    });
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    return { out: () => buffer, restore: () => { out.mockRestore(); err.mockRestore(); } };
  }

  it("samples the real import fixtures and labels them as fixtures", async () => {
    const io = capture();
    const code = await runCli(["deep-sample", "--seed", "day-30", "--as-of", "2026-11-14", path.join(root, "fixtures/import/real")]);
    const text = io.out();
    io.restore();
    const report = JSON.parse(text) as DeepSampleReport;
    expect(report.files.length).toBeGreaterThanOrEqual(4);
    expect(report.files.every((file) => file.fixture_records === file.counted)).toBe(true);
    expect(report.sample.every((item) => item.populated_fields.every((row) => row.second_source === NOT_CHECKED))).toBe(true);
    expect([0, 1]).toContain(code);
    expect(code).toBe(report.automatic_result === "BLOCK" ? 1 : 0);
  });

  it("returns 1 on a count mismatch and 2 on bad arguments", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "deep-sample-"));
    const data = path.join(dir, "seed.ndjson");
    const counts = path.join(dir, "counts.json");
    writeFileSync(data, `${JSON.stringify(record("a", { name: fact("A") }))}\n`);
    writeFileSync(counts, JSON.stringify({ [data]: 2 }));
    const io = capture();
    const mismatch = await runCli(["deep-sample", "--seed", "s", "--as-of", "2026-11-14", "--counts", counts, "--format", "md", data]);
    const markdown = io.out();
    const noSeed = await runCli(["deep-sample", "--as-of", "2026-11-14", data]);
    const badDate = await runCli(["deep-sample", "--seed", "s", "--as-of", "today", data]);
    io.restore();
    expect(mismatch).toBe(1);
    expect(markdown).toContain("| mismatch |");
    expect(noSeed).toBe(2);
    expect(badDate).toBe(2);
  });
});
