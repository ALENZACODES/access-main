import { createHash } from "node:crypto";
import { isFixtureRecord } from "./count.js";
import { isGapToken } from "./values.js";

/**
 * Seed-data deep sample. Master plan Part 5, extended prompt 29, started on Day 30.
 *
 * The tool counts every record itself, checks every record for defects a
 * program can see, and draws a repeatable sample for a person to check against
 * the stated source. It never fills in the second-source column and it never
 * returns PASS. A person gives that verdict after the cross-check.
 */

export const DEEP_SAMPLE_SIZE = 20;
export const NOT_CHECKED = "not checked";

export type DeepDefectCode =
  | "missing_id"
  | "duplicate_id"
  | "missing_source"
  | "missing_licence"
  | "missing_date"
  | "missing_tier"
  | "tier_above_seed"
  | "blank_value"
  | "zero_value"
  | "measurement_without_method";

export interface DeepDefect {
  code: DeepDefectCode;
  file: string;
  record_id: string;
  /** Null when the defect is on the record, not on one field. */
  field: string | null;
  detail: string;
}

export interface SampleRow {
  field: string;
  value: unknown;
  unit: string | null;
  source_id: string;
  licence: string;
  retrieved_at: string;
  tier: string;
  /** A person fills these in. The tool leaves them as NOT_CHECKED. */
  stated_source_check: string;
  second_source: string;
  second_source_agreement: string;
}

export interface SampledRecord {
  file: string;
  index: number;
  record_id: string;
  fixture: boolean;
  populated_fields: SampleRow[];
  unknown_fields: string[];
}

export interface FileCount {
  file: string;
  counted: number;
  expected: number | null;
  status: "match" | "mismatch" | "no expected count given";
  sampled: number;
  fixture_records: number;
}

export interface DeepSampleReport {
  as_of: string;
  seed: string;
  sample_size: number;
  files: FileCount[];
  defect_totals: Partial<Record<DeepDefectCode, number>>;
  /** At most `defectLimit` per code per file. `defect_totals` has the full count. */
  defects: DeepDefect[];
  sample: SampledRecord[];
  human_checks_open: number;
  automatic_result: "BLOCK" | "NO AUTOMATIC DEFECT";
  statement: string;
}

export interface DeepSampleOptions {
  /** Any string. The same seed and the same files give the same sample. */
  seed: string;
  asOf: string;
  sampleSize?: number;
  /** File path, as passed to `add`, to the count in the seed-count report. */
  expectedCounts?: Record<string, number>;
  defectLimit?: number;
}

const SEED_LABELS = new Set(["PROTOTYPE-UNVERIFIED", "SEEDED-OPEN-DATA"]);
const MEASUREMENT_KEY = /(_mm|_cm|_m|_kg|_percent|_degrees|_ratio|width|height|depth|length|slope|gradient|diameter|clearance|load|incline)$/i;

interface Candidate {
  rank: string;
  record: SampledRecord;
}

interface FileState {
  counted: number;
  fixtures: number;
  candidates: Candidate[];
  shown: Map<DeepDefectCode, number>;
}

function isBlank(value: unknown): boolean {
  return typeof value === "string" && value.trim().length === 0;
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value : "";
}

function fieldMap(row: Record<string, unknown>): Record<string, unknown> {
  const holder = row.facts ?? row.fields;
  return holder && typeof holder === "object" && !Array.isArray(holder) ? (holder as Record<string, unknown>) : {};
}

function looksLikeMeasurement(key: string, fact: Record<string, unknown>): boolean {
  return typeof fact.value === "number" && (text(fact.unit) !== "" || MEASUREMENT_KEY.test(key));
}

export class DeepSampler {
  private readonly options: Required<Omit<DeepSampleOptions, "expectedCounts">> & { expectedCounts: Record<string, number> };
  private readonly files = new Map<string, FileState>();
  private readonly firstSeen = new Map<string, string>();
  private readonly totals = new Map<DeepDefectCode, number>();
  private readonly defects: DeepDefect[] = [];

  constructor(options: DeepSampleOptions) {
    if (!options.seed.trim()) throw new Error("a seed is required so the sample can be drawn again");
    this.options = {
      seed: options.seed,
      asOf: options.asOf,
      sampleSize: options.sampleSize ?? DEEP_SAMPLE_SIZE,
      expectedCounts: options.expectedCounts ?? {},
      defectLimit: options.defectLimit ?? 50,
    };
    if (!Number.isInteger(this.options.sampleSize) || this.options.sampleSize < 1) {
      throw new Error("sample size must be a whole number of at least 1");
    }
  }

  add(record: unknown, file: string): void {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("record is not an object");
    const row = record as Record<string, unknown>;
    const state = this.state(file);
    state.counted += 1;
    const index = state.counted;
    const fixture = isFixtureRecord(row, file);
    if (fixture) state.fixtures += 1;

    const id = text(row.id);
    const label = id || `(record ${index})`;
    if (!id) {
      this.defect(state, { code: "missing_id", file, record_id: label, field: null, detail: "The record has no id." });
    } else {
      const earlier = this.firstSeen.get(id);
      if (earlier === undefined) this.firstSeen.set(id, file);
      else {
        this.defect(state, {
          code: "duplicate_id",
          file,
          record_id: id,
          field: null,
          detail: earlier === file ? "The id appears more than once in this file." : `The id also appears in ${earlier}.`,
        });
      }
    }

    this.checkProvenance(state, row, file, label);

    const populated: SampleRow[] = [];
    const unknown: string[] = [];
    for (const [key, raw] of Object.entries(fieldMap(row))) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const fact = raw as Record<string, unknown>;
      if (!("value" in fact)) continue;
      if (isBlank(fact.value)) {
        this.defect(state, {
          code: "blank_value",
          file,
          record_id: label,
          field: key,
          detail: "The value is an empty string. Write unknown, or the published value.",
        });
        unknown.push(key);
        continue;
      }
      if (isGapToken(fact.value)) {
        unknown.push(key);
        continue;
      }
      this.checkFact(state, fact, file, label, key);
      populated.push({
        field: key,
        value: fact.value,
        unit: text(fact.unit) || null,
        source_id: text(fact.source_id) || "missing",
        licence: text(fact.licence) || "missing",
        retrieved_at: text(fact.retrieved_at) || "missing",
        tier: fact.tier === undefined || fact.tier === null ? "missing" : String(fact.tier),
        stated_source_check: NOT_CHECKED,
        second_source: NOT_CHECKED,
        second_source_agreement: NOT_CHECKED,
      });
    }

    const rank = createHash("sha256").update(`${this.options.seed}\u0000${file}\u0000${label}\u0000${index}`).digest("hex");
    this.offer(state, { rank, record: { file, index, record_id: label, fixture, populated_fields: populated, unknown_fields: unknown } });
  }

  finish(): DeepSampleReport {
    const files: FileCount[] = [];
    const sample: SampledRecord[] = [];
    let mismatch = false;
    for (const [file, state] of this.files) {
      const expected = Object.prototype.hasOwnProperty.call(this.options.expectedCounts, file) ? this.options.expectedCounts[file]! : null;
      const status = expected === null ? "no expected count given" : expected === state.counted ? "match" : "mismatch";
      if (status === "mismatch") mismatch = true;
      const picked = [...state.candidates].sort((a, b) => a.rank.localeCompare(b.rank)).map((item) => item.record);
      files.push({ file, counted: state.counted, expected, status, sampled: picked.length, fixture_records: state.fixtures });
      sample.push(...picked);
    }
    for (const file of Object.keys(this.options.expectedCounts)) {
      if (!this.files.has(file)) {
        mismatch = true;
        files.push({ file, counted: 0, expected: this.options.expectedCounts[file]!, status: "mismatch", sampled: 0, fixture_records: 0 });
      }
    }
    const total = [...this.totals.values()].reduce((sum, value) => sum + value, 0);
    const open = sample.reduce((sum, record) => sum + record.populated_fields.length, 0);
    return {
      as_of: this.options.asOf,
      seed: this.options.seed,
      sample_size: this.options.sampleSize,
      files,
      defect_totals: Object.fromEntries(this.totals),
      defects: this.defects,
      sample,
      human_checks_open: open,
      automatic_result: total > 0 || mismatch ? "BLOCK" : "NO AUTOMATIC DEFECT",
      statement:
        "This report cannot give PASS. A program cannot tell whether a value matches its source. A person must check each sampled value against the stated source and a second approved source, and record the result.",
    };
  }

  private state(file: string): FileState {
    let state = this.files.get(file);
    if (!state) {
      state = { counted: 0, fixtures: 0, candidates: [], shown: new Map() };
      this.files.set(file, state);
    }
    return state;
  }

  /** Keep the `sampleSize` lowest ranks, so memory does not grow with the file. */
  private offer(state: FileState, candidate: Candidate): void {
    const size = this.options.sampleSize;
    if (state.candidates.length < size) {
      state.candidates.push(candidate);
      return;
    }
    let worst = 0;
    for (let i = 1; i < state.candidates.length; i += 1) {
      if (state.candidates[i]!.rank > state.candidates[worst]!.rank) worst = i;
    }
    if (candidate.rank < state.candidates[worst]!.rank) state.candidates[worst] = candidate;
  }

  private defect(state: FileState, defect: DeepDefect): void {
    this.totals.set(defect.code, (this.totals.get(defect.code) ?? 0) + 1);
    const shown = state.shown.get(defect.code) ?? 0;
    if (shown < this.options.defectLimit) {
      state.shown.set(defect.code, shown + 1);
      this.defects.push(defect);
    }
  }

  private checkProvenance(state: FileState, row: Record<string, unknown>, file: string, id: string): void {
    const provenance = row.provenance;
    if (!provenance || typeof provenance !== "object") return;
    const p = provenance as Record<string, unknown>;
    if (!text(p.source_id) && !text(p.source_name)) {
      this.defect(state, { code: "missing_source", file, record_id: id, field: null, detail: "The record provenance names no source." });
    }
    if (!text(p.licence_id) && !text(p.licence)) {
      this.defect(state, { code: "missing_licence", file, record_id: id, field: null, detail: "The record provenance names no licence." });
    }
    if (!text(p.source_date) && !text(p.retrieved_at)) {
      this.defect(state, { code: "missing_date", file, record_id: id, field: null, detail: "The record provenance has no source date and no retrieval date." });
    }
    this.checkTier(state, p.tier, p.prototype_label, file, id, null);
  }

  private checkFact(state: FileState, fact: Record<string, unknown>, file: string, id: string, key: string): void {
    if (!text(fact.source_id)) {
      this.defect(state, { code: "missing_source", file, record_id: id, field: key, detail: "A value is present with no source id." });
    }
    if (!text(fact.licence)) {
      this.defect(state, { code: "missing_licence", file, record_id: id, field: key, detail: "A value is present with no licence." });
    }
    if (!text(fact.retrieved_at)) {
      this.defect(state, { code: "missing_date", file, record_id: id, field: key, detail: "A value is present with no retrieval date." });
    }
    this.checkTier(state, fact.tier, undefined, file, id, key);
    const observed = text(fact.method) !== "" && text(fact.observed_at) !== "";
    if (fact.value === 0 && !observed) {
      this.defect(state, {
        code: "zero_value",
        file,
        record_id: id,
        field: key,
        detail: "The value is 0 with no method and observation date. A zero can be read as a measurement. Check the source, or write unknown.",
      });
    } else if (looksLikeMeasurement(key, fact) && text(fact.method) === "" && text(fact.source_key) === "") {
      this.defect(state, {
        code: "measurement_without_method",
        file,
        record_id: id,
        field: key,
        detail: "A number that reads as a measurement has no method and no source key. It may be a guess. Check the source.",
      });
    }
  }

  private checkTier(state: FileState, tier: unknown, label: unknown, file: string, id: string, key: string | null): void {
    if (tier === undefined || tier === null || tier === "") {
      this.defect(state, { code: "missing_tier", file, record_id: id, field: key, detail: "No verification tier is recorded." });
      return;
    }
    const labelAbove = typeof label === "string" && label !== "" && !SEED_LABELS.has(label);
    if (String(tier) !== "0" || labelAbove) {
      this.defect(state, {
        code: "tier_above_seed",
        file,
        record_id: id,
        field: key,
        detail: `Tier ${String(tier)}${typeof label === "string" && label ? ` with label ${label}` : ""} is above SEEDED-OPEN-DATA and PROTOTYPE-UNVERIFIED.`,
      });
    }
  }
}

function cell(value: unknown): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return (raw ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** The worksheet a person fills in. Plain Markdown, no styling. */
export function deepSampleMarkdown(report: DeepSampleReport): string {
  const lines: string[] = [];
  lines.push("# Seed-data deep sample", "");
  lines.push(`As of ${report.as_of}. Seed \`${report.seed}\`. Up to ${report.sample_size} records per file.`, "");
  lines.push(report.statement, "");
  lines.push(`Automatic result: **${report.automatic_result}**. Values waiting for a person: ${report.human_checks_open}.`, "");
  lines.push("## Counts", "", "| File | Counted here | Seed-count report | Result | Sampled | Fixture records |", "| --- | ---: | ---: | --- | ---: | ---: |");
  for (const file of report.files) {
    lines.push(`| ${cell(file.file)} | ${file.counted} | ${file.expected ?? "not given"} | ${file.status} | ${file.sampled} | ${file.fixture_records} |`);
  }
  lines.push("", "## Defects a program can see", "");
  const codes = Object.entries(report.defect_totals);
  if (codes.length === 0) lines.push("None found. This is not a finding that the data is correct.");
  else {
    lines.push("| Defect | Total |", "| --- | ---: |");
    for (const [code, total] of codes) lines.push(`| ${code} | ${total} |`);
    lines.push("", "| Defect | File | Record | Field | Detail |", "| --- | --- | --- | --- | --- |");
    for (const defect of report.defects) {
      lines.push(`| ${defect.code} | ${cell(defect.file)} | ${cell(defect.record_id)} | ${cell(defect.field ?? "record")} | ${cell(defect.detail)} |`);
    }
  }
  lines.push("", "## Cross-check worksheet", "");
  for (const record of report.sample) {
    lines.push(`### ${cell(record.record_id)}`, "", `File ${cell(record.file)}, record ${record.index}.${record.fixture ? " Fixture, not a real place." : ""}`, "");
    if (record.populated_fields.length === 0) lines.push("No populated field. Every field is unknown.", "");
    else {
      lines.push("| Field | Value | Source | Licence | Retrieved | Tier | Matches stated source | Second source | Second source agrees |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
      for (const row of record.populated_fields) {
        lines.push(
          `| ${cell(row.field)} | ${cell(row.value)}${row.unit ? ` ${row.unit}` : ""} | ${cell(row.source_id)} | ${cell(row.licence)} | ${cell(row.retrieved_at)} | ${cell(row.tier)} | ${row.stated_source_check} | ${row.second_source} | ${row.second_source_agreement} |`,
        );
      }
      lines.push("");
    }
    if (record.unknown_fields.length > 0) lines.push(`Unknown in the record: ${record.unknown_fields.map(cell).join(", ")}.`, "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
