import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../schema/source-register.schema.json" with { type: "json" };
import type { SourceEntry } from "./types.ts";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const check = ajv.compile(schema);

/** Reject invalid and inconsistent inventories before presenting counts. */
export function validateSourceRegister(value: unknown): value is SourceEntry[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const entry of value) {
    if (!check(entry)) return false;
    const source = entry as unknown as SourceEntry;
    if (ids.has(source.id)) return false;
    ids.add(source.id);
    if (source.provenance.licence !== source.licence) return false;
    if (source.as_of !== "Unknown" && source.provenance.source_date !== source.as_of) return false;
    if (source.provenance.source_date !== "Unknown" && source.as_of === "Unknown") return false;
    if (source.provenance.prototype_label === "SEEDED-OPEN-DATA" && source.provenance.tier !== 0) return false;
    const counted = source.tier_histogram.reduce((sum, item) => sum + item.count, 0);
    if (source.record_count !== "Unknown" && counted !== source.record_count) return false;
    const keys = source.tier_histogram.map((item) => `${item.tier}:${item.prototype_label}`);
    if (new Set(keys).size !== keys.length) return false;
    if (source.unknown_field_count !== "Unknown" && source.record_count === 0 && source.unknown_field_count !== 0) return false;
  }
  return true;
}

export function assertSourceRegister(value: unknown): asserts value is SourceEntry[] {
  if (!validateSourceRegister(value)) throw new Error("Invalid source register");
}
