import type { Answer, Storage, TripDraft } from "./types";

export const EXPORT_SCHEMA = "access-main.trip-check/1";

export interface ExportRecord extends Omit<TripDraft, "tier" | "state"> {
  /** Community-reported, unreviewed. This lane never writes tier 2 or 3. */
  tier: 1;
  state: "exported";
}

export interface ExportFile {
  schema: typeof EXPORT_SCHEMA;
  exported_at: string;
  records: ExportRecord[];
}

export function buildExport(drafts: readonly TripDraft[], now: Date = new Date()): ExportFile {
  const at = now.toISOString();
  return {
    schema: EXPORT_SCHEMA,
    exported_at: at,
    records: drafts.map((d) => ({ ...d, tier: 1 as const, state: "exported" as const, exported_at: at })),
  };
}

export interface ExportResult {
  file: ExportFile;
  blob: Blob;
  filename: string;
}

/**
 * Packages every local draft as a JSON Blob and marks them exported.
 * Returns null when there is nothing to export. No URL, token or upload:
 * the caller hands the Blob to a browser download and the person sends it.
 */
export async function exportDrafts(storage: Storage, now: Date = new Date()): Promise<ExportResult | null> {
  const local = (await storage.list()).filter((d) => d.state === "local");
  if (local.length === 0) return null;
  const file = buildExport(local, now);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  for (const r of file.records) await storage.put(r);
  return { file, blob, filename: `trip-check-${file.exported_at.slice(0, 10)}.json` };
}

/** Proposed shape for I9's general contribute export. I9 owns the real one. */
export interface ContributeDraft {
  kind: "trip-check";
  field_id: string;
  place_ref?: string;
  value: Answer;
  source_id: string;
  source_key: string;
  licence: string;
  retrieved_at: string;
  tier: 1;
}

/** Maps one exported record to the proposed I9 shape. Pure; no I/O. */
export function toContributeDraft(r: ExportRecord): ContributeDraft {
  const out: ContributeDraft = {
    kind: "trip-check",
    field_id: r.field_id,
    value: r.value,
    source_id: r.source_id,
    source_key: r.source_key,
    licence: r.licence,
    retrieved_at: r.retrieved_at,
    tier: 1,
  };
  if (r.place_ref) out.place_ref = r.place_ref;
  return out;
}

/** Browser-only: starts a download of the Blob. Nothing leaves the device. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
