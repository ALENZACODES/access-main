import { classifyRecoveryError } from "./classify.ts";
import type { RecoveryReason, RecoverySource } from "./index.ts";

/** Explicitly provided, locally prepared export. No automatic submission. */
export interface RecoveryExportRecord {
  readonly id: string;
  readonly packId: string;
  readonly state: "ready" | "corrupt" | "unknown" | "absent";
  readonly source?: RecoverySource;
  readonly checkedAt?: string;
  readonly reason?: string;
}

export interface RecoveryExportEnvelope {
  readonly format: "local-pack-recovery-v1";
  readonly createdAt: string;
  readonly records: readonly RecoveryExportRecord[];
}

export type ExportFailureReason = RecoveryReason | "unsafe-input";

export type RecoveryExportResult =
  | { readonly ok: true; readonly filename: string; readonly content: string }
  | { readonly ok: false; readonly reason: ExportFailureReason };

const OPEN_LICENCES = new Set([
  "CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0",
]);

const MAX_RECORDS = 2000;
const MAX_FIELD_LENGTH = 256;
const MAX_EXPORT_BYTES = 1024 * 1024;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTimestamp(value: string): boolean {
  return UTC_DATE_TIME.test(value) && !Number.isNaN(Date.parse(value));
}

function hasControlChars(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f) || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function shortText(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 && value.length <= MAX_FIELD_LENGTH &&
    !hasControlChars(value);
}

function sourceIsComplete(source: RecoverySource): boolean {
  return shortText(source.name) && source.name.trim().length > 0 &&
    shortText(source.licence) && OPEN_LICENCES.has(source.licence) &&
    isValidDate(source.date);
}

function safeRecord(record: RecoveryExportRecord): RecoveryExportRecord | null {
  if (!shortText(record.id) || !shortText(record.packId)) return null;
  if (!(["ready", "corrupt", "unknown", "absent"] as const).includes(record.state)) {
    return null;
  }
  if (record.checkedAt !== undefined && !isValidTimestamp(record.checkedAt)) return null;
  if (record.reason !== undefined && !shortText(record.reason)) return null;
  if (record.source !== undefined && !sourceIsComplete(record.source)) return null;
  // A ready record without traceable source metadata must become UNKNOWN.
  const state = record.state === "ready" && record.source === undefined
    ? "unknown" : record.state;
  return {
    id: record.id,
    packId: record.packId,
    state,
    ...(record.reason === undefined ? {} : { reason: record.reason }),
    ...(record.checkedAt === undefined ? {} : { checkedAt: record.checkedAt }),
    ...(record.source === undefined ? {} : {
      source: {
        name: record.source.name,
        licence: record.source.licence,
        date: record.source.date,
      },
    }),
  };
}

/**
 * Export is deliberately limited to pack status and provenance. It never
 * exports precise locations, private photos, device IDs or raw file contents.
 */
export function createRecoveryExport(
  records: readonly RecoveryExportRecord[],
  createdAt: string,
): RecoveryExportResult {
  if (!isValidTimestamp(createdAt) || records.length > MAX_RECORDS) {
    return { ok: false, reason: "unsafe-input" };
  }
  const output: RecoveryExportRecord[] = [];
  const ids = new Set<string>();
  for (const record of records) {
    const safe = safeRecord(record);
    if (safe === null || ids.has(safe.id)) {
      return { ok: false, reason: "unsafe-input" };
    }
    ids.add(safe.id);
    output.push(safe);
  }
  output.sort((a, b) => a.id.localeCompare(b.id, "en"));
  const envelope: RecoveryExportEnvelope = {
    format: "local-pack-recovery-v1",
    createdAt,
    records: output,
  };
  const content = `${JSON.stringify(envelope, null, 2)}\n`;
  if (new TextEncoder().encode(content).byteLength > MAX_EXPORT_BYTES) {
    return { ok: false, reason: "unsafe-input" };
  }
  return {
    ok: true,
    filename: `pack-recovery-${createdAt.slice(0, 10)}.json`,
    content,
  };
}

export interface SaveTextFile {
  (filename: string, content: string): Promise<void>;
}

/** Save is caller-supplied; no hidden network request or automatic retry. */
export async function saveRecoveryExport(
  records: readonly RecoveryExportRecord[],
  createdAt: string,
  save: SaveTextFile,
): Promise<RecoveryExportResult> {
  const result = createRecoveryExport(records, createdAt);
  if (!result.ok) return result;
  try {
    await save(result.filename, result.content);
    return result;
  } catch (error: unknown) {
    return { ok: false, reason: classifyRecoveryError("export", error).reason };
  }
}

export interface ExportCopy {
  readonly heading: string;
  readonly description: string;
  readonly action: string;
  readonly done: string;
  readonly failed: string;
  readonly invalid: string;
}

const EN: ExportCopy = {
  heading: "Export local pack report",
  description: "Export pack status and supplied source information as a JSON file. No files are uploaded.",
  action: "Export report",
  done: "Export saved",
  failed: "Could not save the export. You can try again.",
  invalid: "The report information is incomplete or unsupported.",
};

const FR: ExportCopy = {
  heading: "Exporter le rapport local des ensembles",
  description: "Exportez les états des ensembles et les renseignements sur leurs sources dans un fichier JSON. Aucun fichier n’est téléversé.",
  action: "Exporter le rapport",
  done: "Exportation enregistrée",
  failed: "L’exportation n’a pas pu être enregistrée. Vous pouvez réessayer.",
  invalid: "Les renseignements du rapport sont incomplets ou non pris en charge.",
};

export function exportCopy(locale: "en" | "fr"): ExportCopy {
  return locale === "fr" ? FR : EN;
}
