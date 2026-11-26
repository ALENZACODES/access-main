import type { PackRecord, PackSourceEntry } from "@access/shared";

export type { PackRecord, PackSourceEntry };

/** Where a record probably is: its cell (from the search index) and its tranche. */
export type PlaceLookupHint = { cells?: string[]; tranche?: string };
/** One entry of a cell's search index. */
export type SearchHit = { id: string; tranche: string; name: string | null; nameNorm: string; lat: number; lon: number };
export type SearchOptions = { near?: { lat: number; lon: number }; tranches?: string[]; limit?: number; region?: string };

/** Local stand-in for @access-main/data-client until that package is pinned on this branch. */
export type PackSource = {
  manifest: () => Promise<unknown>;
  cellsFor: (area: unknown) => Promise<string[]>;
  records: (tranche: string, cell: string, signal?: AbortSignal) => AsyncGenerator<PackRecord> | AsyncIterable<PackRecord>;
  search: (text: string, opts: SearchOptions) => Promise<SearchHit[]>;
  get: (id: string, hint?: PlaceLookupHint) => Promise<PackRecord | null>;
  nearby?: (point: { lat: number; lon: number }, opts: { tranches: string[]; radiusM: number; limit: number }) => Promise<Array<{ record: PackRecord; distanceM: number }>>;
  sourcesFor: (record: PackRecord) => PackSourceEntry[];
  regions: () => Promise<unknown[]>;
  downloadRegion: (id: string) => Promise<unknown>;
  deleteRegion: (id: string) => Promise<void>;
  storedRegionIntegrity: (id: string) => Promise<null>;
  fetchRegionPartBytes: (path: string) => Promise<Uint8Array>;
  commitCheckedRegion: (id: string, parts: ReadonlyArray<{ sha256: string; data: Uint8Array }>) => Promise<unknown>;
};

export function fieldValue(record: PackRecord, key: string) {
  return record.fields[key];
}

export function createPackSource(options: { baseUrl?: string; fetchOnDemand?: boolean } = {}): PackSource {
  void options;
  return {
    manifest: async () => ({ version: 1, regions: [], sources: [], search: {}, tranches: {}, tiles: {}, counts: { records: 0 } }),
    cellsFor: async () => [],
    async *records() {},
    search: async () => [],
    get: async () => null,
    sourcesFor: () => [],
    regions: async () => [],
    downloadRegion: async () => {
      throw new Error("data-client is not pinned on this branch");
    },
    deleteRegion: async () => {},
    storedRegionIntegrity: async () => null,
    fetchRegionPartBytes: async (path) => {
      throw new Error(`data-client is not pinned on this branch (${path})`);
    },
    commitCheckedRegion: async () => {
      throw new Error("data-client is not pinned on this branch");
    },
  };
}

export function createFixtureSource(records: PackRecord[], sources: PackSourceEntry[]): PackSource {
  const pack = createPackSource();
  return {
    ...pack,
    get: async (id) => records.find((record) => record.id === id) ?? null,
    search: async (text) =>
      records
        .filter((record) => String(record.fields.name?.value ?? "").toLowerCase().includes(text.toLowerCase()))
        .map((record) => {
          const name = String(record.fields.name?.value ?? "");
          return { id: record.id, tranche: record.tranche, name, nameNorm: name.toLowerCase(), lat: Number(record.fields.lat?.value), lon: Number(record.fields.lon?.value) };
        }),
    sourcesFor: (record) => sources.filter((source) => Object.values(record.fields).some((field) => field?.source_id === source.sourceId)),
    async *records(tranche) {
      yield* records.filter((record) => record.tranche === tranche);
    },
  };
}
