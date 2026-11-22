// Checks the manifest of a pack against its content and the other way. It is given the numbers that were measured
// (the size and the sha256 of the content file); it measures nothing itself.

import { isRecord } from "./pkWalk";

export type PkIntegrityCode =
  | "pk-manifest-unreadable"
  | "pk-content-unreadable"
  | "pk-schema-mismatch"
  | "pk-pack-id-mismatch"
  | "pk-size-mismatch"
  | "pk-sha-mismatch"
  | "pk-count-mismatch"
  | "pk-source-not-listed"
  | "pk-source-unused"
  | "pk-source-licence-differs"
  | "pk-licence-invented"
  | "pk-wheelchair-value"
  | "pk-date-bad"
  | "pk-date-after-build"
  | "pk-id-duplicate"
  | "pk-id-missing";

export interface PkIntegrityProblem {
  code: PkIntegrityCode;
  path: string;
  detail: string;
}

export interface PkMeasured {
  /** The size in bytes of the content file as it is on disk. */
  bytes: number;
  /** The sha256 of the content file, as 64 lowercase hex digits. */
  sha256: string;
}

/** What the file may say about wheelchair access. Anything else, including "unknown" in lower case, is a finding. */
export const WHEELCHAIR_VALUES: readonly string[] = ["yes", "no", "limited", "designated", "UNKNOWN"];

/** A licence written by someone who did not know it. The pack says UNKNOWN, never a guess. */
export const GUESSED_LICENCES = /^(?:n\/?a|none|null|tbd|unspecified|public domain|free|open|ok|\?+|-+|)$/i;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (s: unknown): s is string => {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

const LISTS = ["places", "help_numbers", "elevator_status", "journeys"] as const;

interface SourceKey {
  name: string;
  licence: string;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** The sources a content file names, as the pairs of name and licence it writes. */
export function contentSources(content: Record<string, unknown>): Array<SourceKey & { path: string }> {
  const out: Array<SourceKey & { path: string }> = [];
  for (const list of LISTS) {
    const rows = content[list];
    if (!Array.isArray(rows)) continue;
    rows.forEach((r, i) => {
      if (!isRecord(r)) return;
      const prov = isRecord(r["provenance"]) ? r["provenance"] : r;
      const name = str(prov["source_name"]);
      if (name !== null) out.push({ name, licence: str(prov["licence"]) ?? "", path: `${list}[${i}]` });
    });
  }
  return out;
}

export function checkIntegrity(manifest: unknown, content: unknown, measured: PkMeasured | null): PkIntegrityProblem[] {
  const out: PkIntegrityProblem[] = [];
  const add = (code: PkIntegrityCode, path: string, detail: string): void => void out.push({ code, path, detail });
  if (!isRecord(manifest)) add("pk-manifest-unreadable", "manifest", "the manifest is not a JSON object");
  if (!isRecord(content)) add("pk-content-unreadable", "content", "the content is not a JSON object");
  if (!isRecord(manifest) || !isRecord(content)) return out;

  if (manifest["schema_version"] !== content["schema_version"]) add("pk-schema-mismatch", "schema_version", `manifest ${String(manifest["schema_version"])}, content ${String(content["schema_version"])}`);
  if (manifest["pack_id"] !== content["pack_id"]) add("pk-pack-id-mismatch", "pack_id", `manifest ${String(manifest["pack_id"])}, content ${String(content["pack_id"])}`);
  if (measured) {
    if (manifest["size_bytes"] !== measured.bytes) add("pk-size-mismatch", "size_bytes", `manifest ${String(manifest["size_bytes"])}, file ${measured.bytes}`);
    if (manifest["sha256"] !== measured.sha256) add("pk-sha-mismatch", "sha256", "the manifest and the file have different sha256 values");
  }
  const counts = isRecord(manifest["counts"]) ? manifest["counts"] : {};
  for (const list of LISTS) {
    const rows = content[list];
    const n = Array.isArray(rows) ? rows.length : 0;
    if (counts[list] !== n) add("pk-count-mismatch", `counts.${list}`, `manifest ${String(counts[list])}, content ${n}`);
  }

  const built = manifest["built_at"];
  if (!isIsoDate(built)) add("pk-date-bad", "built_at", "not a date written year-month-day");
  const listed = Array.isArray(manifest["source_dates"]) ? manifest["source_dates"] : [];
  const listedKeys = new Map<string, string>();
  listed.forEach((s, i) => {
    if (!isRecord(s)) return;
    const name = str(s["source_name"]);
    const licence = str(s["licence"]) ?? "";
    if (name !== null) listedKeys.set(name, licence);
    if (GUESSED_LICENCES.test(licence)) add("pk-licence-invented", `source_dates[${i}].licence`, `"${licence}" is written where UNKNOWN belongs`);
    const got = s["retrieved_at"];
    if (!isIsoDate(got)) add("pk-date-bad", `source_dates[${i}].retrieved_at`, "not a date written year-month-day");
    else if (isIsoDate(built) && got > built) add("pk-date-after-build", `source_dates[${i}].retrieved_at`, `${got} is after the build on ${built}`);
  });
  const used = new Set<string>();
  for (const s of contentSources(content)) {
    used.add(s.name);
    const l = listedKeys.get(s.name);
    if (l === undefined) add("pk-source-not-listed", s.path, `${s.name} is not in source_dates`);
    else if (l !== s.licence) add("pk-source-licence-differs", s.path, `${s.name}: manifest ${l}, record ${s.licence}`);
    if (GUESSED_LICENCES.test(s.licence)) add("pk-licence-invented", `${s.path}.licence`, `"${s.licence}" is written where UNKNOWN belongs`);
  }
  for (const name of listedKeys.keys()) if (!used.has(name)) add("pk-source-unused", "source_dates", `${name} is listed and no record uses it`);

  const seen = new Set<string>();
  for (const list of LISTS) {
    const rows = content[list];
    if (!Array.isArray(rows)) continue;
    rows.forEach((r, i) => {
      if (!isRecord(r)) return;
      const id = r["id"];
      const where = `${list}[${i}]`;
      if (typeof id !== "string" || id === "") add("pk-id-missing", where, "no id");
      else if (seen.has(`${list}/${id}`)) add("pk-id-duplicate", where, id);
      else seen.add(`${list}/${id}`);
      if (list === "places" && !WHEELCHAIR_VALUES.includes(String(r["wheelchair"]))) add("pk-wheelchair-value", `${where}.wheelchair`, String(r["wheelchair"]));
    });
  }
  return out;
}
