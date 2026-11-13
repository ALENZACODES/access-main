import { readFileSync } from "node:fs";
import { RECORDS, ILLUSTRATIVE_TOTAL, ILLUSTRATIVE_TRANCHE_TARGETS, RECONCILIATION_TARGET } from "./catalog/index.js";
import type { FactClass, RecordDef } from "./catalog/types.js";
import { judgeFreshness } from "./freshness.js";
import { accessKeysFor } from "./import-class.js";
import { isFactLike, isGapToken, observationComplete, type FactLike } from "./values.js";
import { schemaFile } from "./paths.js";

export const PIECE_DEFINITION =
  "A piece is one populated field value on one canonical record. unknown, empty, null, and not-assessed tokens do not count. A tri-state unknown counts only when method, observed_at, and source_id are recorded. Derived copies, translations of a populated field, system fields, provenance, free text, local profiles, and source-registry rows do not count. A stale value stays in the headline until it is older than 730 days. Elevator and escalator status observations count only inside a 30-day snapshot. Journeys are derived products and do not count. Example fixtures do not count. This is the Table T3-12 rule. The 500,000 and 502,300 figures are targets, not a claim about this file.";

export interface TypeSlice {
  records: number;
  headline_pieces: number;
  accessibility_fact_pieces: number;
  other_pieces: number;
  gaps: number;
  accessibility_fact_gaps: number;
  derived_excluded: number;
  translations_not_counted: number;
  stale_in_headline: number;
  excluded_older_than_730_days: number;
  excluded_outside_status_snapshot: number;
  excluded_undated: number;
  pieces_by_tier: Record<string, number>;
}

export interface CountReport {
  definition: string;
  as_of: string;
  records: number;
  headline_pieces: number;
  accessibility_fact_pieces: number;
  other_pieces: number;
  accessibility_fact_gaps: number;
  accessibility_fact_field_definitions: number;
  gaps: number;
  derived_excluded: number;
  translations_not_counted: number;
  stale_in_headline: number;
  excluded_older_than_730_days: number;
  excluded_outside_status_snapshot: number;
  excluded_undated: number;
  examples_excluded_records: number;
  local_profiles_not_counted: number;
  provenance_registers_not_counted: number;
  by_record_type: Record<string, TypeSlice>;
  illustrative_section_5_6: {
    venue: number;
    path: number;
    transit: number;
    washroom: number;
    total: number;
    note: string;
  };
  reconciliation_table_t3_13_target: number;
  by_record_type_note: string;
}

interface Mutable {
  slice: TypeSlice;
}

function emptySlice(): TypeSlice {
  return {
    records: 0,
    headline_pieces: 0,
    accessibility_fact_pieces: 0,
    other_pieces: 0,
    gaps: 0,
    accessibility_fact_gaps: 0,
    derived_excluded: 0,
    translations_not_counted: 0,
    stale_in_headline: 0,
    excluded_older_than_730_days: 0,
    excluded_outside_status_snapshot: 0,
    excluded_undated: 0,
    pieces_by_tier: {},
  };
}

export function accessibilityFactFieldDefinitions(): number {
  return RECORDS.reduce(
    (sum, record) => sum + record.fields.filter((field) => field.factClass === "accessibility" && field.placement === "facts").length,
    0,
  );
}

export class RecordCounter {
  private readonly asOf: string;
  private readonly seen = new Map<string, Set<string>>();
  private readonly slices = new Map<string, TypeSlice>();
  private examplesExcluded = 0;
  private localProfiles = 0;
  private registers = 0;

  constructor(asOf: string) {
    this.asOf = asOf;
  }

  add(record: unknown): void {
    if (!record || typeof record !== "object") throw new Error("record is not an object");
    const row = record as Record<string, unknown>;
    if (row.example === true) {
      this.examplesExcluded += 1;
      return;
    }
    if (isImportRecord(row)) {
      this.addImport(row);
      return;
    }
    if (isSourceRegister(row)) {
      this.registers += 1;
      this.remember("source", String(row.id));
      return;
    }
    const recordType = typeof row.record_type === "string" ? row.record_type : "";
    if (recordType === "user_profile") {
      this.localProfiles += 1;
      this.remember(recordType, String(row.id ?? ""));
      return;
    }
    if (recordType === "journey") {
      this.remember(recordType, String(row.id ?? ""));
      const slice = this.slice(recordType);
      slice.records += 1;
      slice.derived_excluded += countJourneyLegs(row);
      return;
    }
    const definition = RECORDS.find((item) => item.recordType === recordType);
    if (definition) {
      this.addCanonical(row, definition);
      return;
    }
    if (recordType === "game_definition" || recordType === "city_skeleton" || recordType === "correction_report" || recordType === "game_session") {
      this.addFlat(row, recordType);
      return;
    }
    if (recordType === "licence") {
      this.registers += 1;
      this.remember(recordType, String(row.id ?? ""));
      return;
    }
    throw new Error(`cannot count record type ${recordType || "(missing)"}`);
  }

  finish(): CountReport {
    const by_record_type: Record<string, TypeSlice> = {};
    for (const [key, slice] of this.slices) by_record_type[key] = slice;
    const all = [...this.slices.values()];
    const sum = (pick: (slice: TypeSlice) => number) => all.reduce((total, slice) => total + pick(slice), 0);
    const headline = sum((slice) => slice.headline_pieces);
    const accessibility = sum((slice) => slice.accessibility_fact_pieces);
    return {
      definition: PIECE_DEFINITION,
      as_of: this.asOf,
      records: sum((slice) => slice.records),
      headline_pieces: headline,
      accessibility_fact_pieces: accessibility,
      other_pieces: headline - accessibility,
      accessibility_fact_gaps: sum((slice) => slice.accessibility_fact_gaps),
      accessibility_fact_field_definitions: accessibilityFactFieldDefinitions(),
      gaps: sum((slice) => slice.gaps),
      derived_excluded: sum((slice) => slice.derived_excluded),
      translations_not_counted: sum((slice) => slice.translations_not_counted),
      stale_in_headline: sum((slice) => slice.stale_in_headline),
      excluded_older_than_730_days: sum((slice) => slice.excluded_older_than_730_days),
      excluded_outside_status_snapshot: sum((slice) => slice.excluded_outside_status_snapshot),
      excluded_undated: sum((slice) => slice.excluded_undated),
      examples_excluded_records: this.examplesExcluded,
      local_profiles_not_counted: this.localProfiles,
      provenance_registers_not_counted: this.registers,
      by_record_type,
      illustrative_section_5_6: {
        ...ILLUSTRATIVE_TRANCHE_TARGETS,
        total: ILLUSTRATIVE_TOTAL,
        note: "Section 5.6 illustrative arithmetic (5,000 venues × 50, 10,000 segments × 10, 5,000 stops × 10, 5,000 washrooms × 20). Not an achievement and not a quota.",
      },
      reconciliation_table_t3_13_target: RECONCILIATION_TARGET,
      by_record_type_note:
        "Import tranches keep the access-maps names venue, washroom, path, and transit. Canonical records use place, entrance, washroom, segment, and transit_stop. The same fact is counted in only one of those.",
    };
  }

  private addImport(row: Record<string, unknown>): void {
    const tranche = String(row.tranche);
    const canonicalType = tranche === "venue" ? "place" : tranche === "path" ? "segment" : tranche === "transit" ? "transit_stop" : "washroom";
    this.remember(`import:${tranche}`, String(row.id));
    const slice = this.slice(`import:${tranche}`);
    slice.records += 1;
    const fields = row.fields as Record<string, FactLike>;
    const access = accessKeysFor(canonicalType === "place" ? "place" : canonicalType);
    for (const [name, field] of Object.entries(fields)) {
      this.addFact(slice, field, {
        recordType: canonicalType,
        counting: "canonical",
        factClass: access.has(name) ? "accessibility" : "identity",
        countRole: "piece",
        observedAt: field.retrieved_at,
      });
    }
  }

  private addCanonical(row: Record<string, unknown>, definition: RecordDef): void {
    this.remember(definition.recordType, String(row.id));
    const slice = this.slice(definition.recordType);
    slice.records += 1;
    const provenance = (row.provenance ?? {}) as Record<string, unknown>;
    const facts = (row.facts ?? {}) as Record<string, unknown>;
    const imported = (row.imported_facts ?? {}) as Record<string, unknown>;
    const translations = definition.fields.filter((field) => field.count === "translation" && field.translationOf);
    const suppressed = new Set<string>();
    for (const field of translations) {
      const primary = facts[field.translationOf ?? ""];
      if (isFactLike(primary) && countsAsPieceIgnoringFreshness(primary)) suppressed.add(field.property);
    }
    for (const field of definition.fields) {
      if (field.placement !== "facts") continue;
      const raw = facts[field.property];
      if (raw === undefined) continue;
      if (!isFactLike(raw)) continue;
      if (suppressed.has(field.property) && !raw.derived) {
        slice.translations_not_counted += 1;
        continue;
      }
      this.addFact(slice, raw, {
        recordType: definition.recordType,
        counting: definition.counting,
        factClass: field.factClass === "status" ? "accessibility" : field.factClass,
        countRole: field.count,
        observedAt: raw.observed_at ?? raw.retrieved_at ?? stringOrUndefined(provenance.record_date),
      });
    }
    const access = accessKeysFor(definition.recordType);
    for (const [name, raw] of Object.entries(imported)) {
      if (!isFactLike(raw)) continue;
      this.addFact(slice, raw, {
        recordType: definition.recordType,
        counting: definition.counting,
        factClass: access.has(name) || access.has(raw.source_key ?? "") ? "accessibility" : "identity",
        countRole: "piece",
        observedAt: raw.observed_at ?? raw.retrieved_at ?? stringOrUndefined(provenance.record_date),
      });
    }
  }

  private addFlat(row: Record<string, unknown>, recordType: string): void {
    this.remember(recordType, String(row.id ?? ""));
    const slice = this.slice(recordType);
    slice.records += 1;
    const provenance = (row.provenance ?? {}) as Record<string, unknown>;
    const observedAt = stringOrUndefined(provenance.record_date) ?? stringOrUndefined(provenance.retrieved_at);
    const tier = provenance.tier ?? 0;
    for (const [key, value] of Object.entries(row)) {
      if (SKIP_FLAT.has(key)) continue;
      if (key === "not_yet_seeded" || key === "free_text" || key === "note") {
        if (typeof value === "string" && value.trim()) slice.derived_excluded += 0;
        if (key === "free_text" || key === "note") continue;
      }
      if (isGapToken(value) || value === undefined) {
        slice.gaps += 1;
        continue;
      }
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || Array.isArray(value)) {
        if (Array.isArray(value) && value.length === 0) {
          slice.gaps += 1;
          continue;
        }
        const factClass: FactClass = recordType === "game_definition" || recordType === "game_session" ? "editorial" : "identity";
        this.addPlain(slice, {
          recordType,
          counting: "canonical",
          factClass,
          tier,
          observedAt,
        });
      }
    }
  }

  private addFact(
    slice: TypeSlice,
    fact: FactLike,
    meta: {
      recordType: string;
      counting: RecordDef["counting"];
      factClass: FactClass;
      countRole: "piece" | "system" | "translation" | "free_text" | "derived";
      observedAt?: string;
    },
  ): void {
    if (fact.derived === true) {
      if (!isGapToken(fact.value)) slice.derived_excluded += 1;
      return;
    }
    if (meta.countRole === "system" || meta.countRole === "free_text" || meta.countRole === "derived") {
      slice.derived_excluded += 1;
      return;
    }
    const gap = isGapToken(fact.value);
    if (gap && !observationComplete(fact)) {
      slice.gaps += 1;
      if (meta.factClass === "accessibility") slice.accessibility_fact_gaps += 1;
      return;
    }
    if (fact.value === "" || (Array.isArray(fact.value) && fact.value.length === 0)) {
      slice.gaps += 1;
      return;
    }
    const judgement = judgeFreshness({
      recordType: meta.recordType,
      counting: meta.counting === "status_snapshot" ? "status_snapshot" : "canonical",
      tier: fact.tier ?? 0,
      observedAt: meta.observedAt,
      asOf: this.asOf,
    });
    if (judgement.excludeFromHeadline) {
      if (judgement.reason === "older_than_730_days") slice.excluded_older_than_730_days += 1;
      else if (judgement.reason === "outside_status_snapshot") slice.excluded_outside_status_snapshot += 1;
      else slice.excluded_undated += 1;
      return;
    }
    slice.headline_pieces += 1;
    if (meta.factClass === "accessibility") slice.accessibility_fact_pieces += 1;
    else slice.other_pieces += 1;
    if (judgement.stale) slice.stale_in_headline += 1;
    const tierKey = String(fact.tier ?? "missing");
    slice.pieces_by_tier[tierKey] = (slice.pieces_by_tier[tierKey] ?? 0) + 1;
  }

  private addPlain(
    slice: TypeSlice,
    meta: { recordType: string; counting: "canonical"; factClass: FactClass; tier: unknown; observedAt?: string },
  ): void {
    const judgement = judgeFreshness({
      recordType: meta.recordType,
      counting: "canonical",
      tier: typeof meta.tier === "number" || meta.tier === "E" ? meta.tier : 0,
      observedAt: meta.observedAt,
      asOf: this.asOf,
    });
    if (judgement.excludeFromHeadline) {
      slice.excluded_undated += judgement.reason === "undated" ? 1 : 0;
      if (judgement.reason === "older_than_730_days") slice.excluded_older_than_730_days += 1;
      return;
    }
    slice.headline_pieces += 1;
    if (meta.factClass === "accessibility") slice.accessibility_fact_pieces += 1;
    else slice.other_pieces += 1;
  }

  private slice(recordType: string): TypeSlice {
    const existing = this.slices.get(recordType);
    if (existing) return existing;
    const created = emptySlice();
    this.slices.set(recordType, created);
    return created;
  }

  private remember(recordType: string, id: string): void {
    const ids = this.seen.get(recordType) ?? new Set<string>();
    if (id && ids.has(id)) throw new Error(`duplicate ${recordType} id ${id}`);
    if (id) ids.add(id);
    this.seen.set(recordType, ids);
  }
}

const SKIP_FLAT = new Set([
  "record_type",
  "schema_version",
  "id",
  "provenance",
  "publication_context",
  "example",
  "storage",
  "server_persistence",
  "record_status",
  "changes_published_record",
  "moderation_status",
  "realtime_claimed",
  "no_medical_claims_notice_id",
]);

function countsAsPieceIgnoringFreshness(fact: FactLike): boolean {
  if (fact.derived) return false;
  if (isGapToken(fact.value) && !observationComplete(fact)) return false;
  return true;
}

function countJourneyLegs(row: Record<string, unknown>): number {
  const legs = Array.isArray(row.legs) ? row.legs : [];
  let derived = 0;
  for (const leg of legs) {
    if (!leg || typeof leg !== "object") continue;
    for (const value of Object.values(leg as Record<string, unknown>)) {
      if (typeof value === "string" && !isGapToken(value)) derived += 1;
      else if (typeof value === "number") derived += 1;
    }
  }
  return derived;
}

function isImportRecord(row: Record<string, unknown>): boolean {
  return typeof row.tranche === "string" && typeof row.fields === "object" && row.fields !== null;
}

function isSourceRegister(row: Record<string, unknown>): boolean {
  return typeof row.licence_id === "string" && typeof row.kind === "string" && typeof row.retrieved_at === "string" && !row.record_type && !row.tranche;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function countRecords(records: unknown[], asOf: string): CountReport {
  const counter = new RecordCounter(asOf);
  for (const record of records) counter.add(record);
  return counter.finish();
}

export function loadFieldsFile(): { venue: string[]; washroom: string[]; path: string[]; transit: string[] } {
  return JSON.parse(readFileSync(schemaFile("import/fields.json"), "utf8")) as {
    venue: string[];
    washroom: string[];
    path: string[];
    transit: string[];
  };
}
