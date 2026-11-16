export type Tranche = "venue" | "washroom" | "transit" | "path";
export interface FieldValue {
  value: unknown | "UNKNOWN";
  source_id: string;
  licence: string;
  retrieved_at: string;
  tier: string | number;
  source_key?: string;
  raw?: unknown;
  derived?: unknown;
}
export interface PackRecord {
  id: string;
  tranche: Tranche;
  region: string;
  fields: Record<string, FieldValue>;
}
export interface PackSourceEntry {
  sourceId: string;
  name: string;
  licence: string;
  licenceUrl?: string;
  attribution?: string;
  retrieved: string;
  shareAlike?: boolean;
  inWebPack: boolean;
  heldReason?: string | null;
}
export interface PackPart {
  path: string;
  bytes: number;
  sha256: string;
  count: number;
  sourceId?: string;
}
export interface PackManifest {
  version: 1;
  builtAt: string;
  sourceCommit: string;
  sources: PackSourceEntry[];
  regions: Array<{ id: string; label: { en: string; fr: string }; bbox: [number, number, number, number]; cells: string[] }>;
  tranches: Partial<Record<Tranche, { cells: Record<string, { bbox: [number, number, number, number]; parts: PackPart[] }> }>>;
  search: Record<string, PackPart>;
  tiles: Record<string, { path: string; bytes: number; licence: string }>;
  counts: { records: number; byTranche: Record<string, number>; bySource: Record<string, number> };
}
export interface SearchHit {
  id: string;
  tranche: Tranche;
  name: string | null;
  nameNorm: string;
  lat: number;
  lon: number;
}
export interface RegionStatus {
  id: string;
  label: { en: string; fr: string };
  cells: string[];
  bytes: number;
  downloaded: boolean;
  verified: boolean;
  missingCells: string[];
  builtAt: string;
  count: number;
}
export interface PackSource {
  manifest(): Promise<PackManifest>;
  cellsFor(area: { bbox: [number, number, number, number] } | { lat: number; lon: number; radiusM: number }): Promise<string[]>;
  records(tranche: Tranche, cell: string, signal?: AbortSignal): AsyncIterable<PackRecord>;
  search(text: string, opts: { near?: { lat: number; lon: number }; tranches?: Tranche[]; limit?: number }): Promise<SearchHit[]>;
  get(id: string): Promise<PackRecord | null>;
  sourcesFor(record: PackRecord): PackSourceEntry[];
  regions(): Promise<RegionStatus[]>;
  downloadRegion(id: string, onProgress?: (done: number, total: number) => void): Promise<RegionStatus>;
  /** Download and commit one cell of a region; resolves with its byte count. */
  downloadCell?(regionId: string, cellId: string, onBytes?: (size: number) => void): Promise<number>;
  deleteRegion(id: string): Promise<void>;
}
