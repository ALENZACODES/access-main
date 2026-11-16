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
  /**
   * On-device parts for a previously downloaded region, or null if this
   * device has no stored entry for the region. Raw bytes are included when
   * the client kept them, so a later integrity check can hash them.
   */
  storedRegionIntegrity(id: string): Promise<RegionIntegritySnapshot | null>;
  /** Fetches one part's bytes from the network. Does not read or write the store. */
  fetchRegionPartBytes(path: string): Promise<Uint8Array>;
  /**
   * Replaces the stored region only after every part passes size, digest,
   * parse and record-count checks. The previously stored pack is left in
   * place when a check fails.
   */
  commitCheckedRegion(id: string, parts: ReadonlyArray<{ sha256: string; data: Uint8Array }>): Promise<RegionStatus>;
}

/** Provenance copied from the independently supplied pack manifest. */
export interface IntegritySource {
  name: string;
  licence: string;
  date: string;
}

/** One expected pack part and whatever is currently stored for it. */
export interface RegionIntegrityPart {
  path: string;
  data: Uint8Array | null;
  expectedBytes: number;
  expectedSha256: string;
  expectedCount: number;
  /** Null when the part is missing from the store. */
  actualCount: number | null;
  structurallyValid: boolean;
  source: IntegritySource;
}

export interface RegionIntegritySnapshot {
  regionId: string;
  cellCount: number;
  parts: RegionIntegrityPart[];
}
