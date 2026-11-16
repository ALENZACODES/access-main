import Dexie, { type Table } from "dexie";
import type { FieldValue, PackManifest, PackPart, PackRecord, PackSource, PackSourceEntry, RegionStatus, SearchHit, Tranche } from "./types.ts";
export type { FieldValue, PackManifest, PackPart, PackRecord, PackSource, PackSourceEntry, RegionStatus, SearchHit, Tranche } from "./types.ts";

interface CachedPart { sha256: string; records: PackRecord[]; search: SearchHit[]; }
interface RegionEntry { id: string; hashes: string[]; }
interface MetaEntry { id: string; manifest: PackManifest; }
class PackDatabase extends Dexie {
  parts!: Table<CachedPart, string>;
  regions!: Table<RegionEntry, string>;
  metadata!: Table<MetaEntry, string>;
  constructor() {
    super("access-pack-v1");
    this.version(1).stores({ parts: "sha256", regions: "id", metadata: "id" });
  }
}

export class PackClientError extends Error {
  constructor(public readonly code: "network" | "bytes" | "sha256" | "content" | "quota" | "missing", public readonly part: string, public readonly required?: number, public readonly available?: number) {
    super(`${code}: ${part}${required === undefined ? "" : ` (${required} bytes needed, ${available} bytes available)`}`);
    this.name = "PackClientError";
  }
}
export function fieldValue(record: PackRecord, name: string): FieldValue | undefined { return record.fields[name]; }
const radians = Math.PI / 180;
function distance(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * radians;
  const dLon = (b.lon - a.lon) * radians;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(x)));
}
function norm(value: string): string { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function rank(name: string, text: string): number { return name.startsWith(text) ? 0 : name.split(" ").some((word) => word.startsWith(text)) ? 1 : name.includes(text) ? 2 : 3; }
function overlap(a: number[], b: number[]): boolean {
  const [a0, a1, a2, a3] = a;
  const [b0, b1, b2, b3] = b;
  if (a0 === undefined || a1 === undefined || a2 === undefined || a3 === undefined || b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) return false;
  return a0 <= b2 && a2 >= b0 && a1 <= b3 && a3 >= b1;
}
function bounds(area: { bbox: [number, number, number, number] } | { lat: number; lon: number; radiusM: number }): number[] {
  if ("bbox" in area) return area.bbox;
  const latitude = area.radiusM / 111320;
  const longitude = area.radiusM / Math.max(1, 111320 * Math.cos(area.lat * radians));
  return [area.lon - longitude, area.lat - latitude, area.lon + longitude, area.lat + latitude];
}
function partsIn(manifest: PackManifest, cells: string[]): PackPart[] {
  const result = new Map<string, PackPart>();
  for (const cell of cells) {
    const search = manifest.search[cell];
    if (search) result.set(search.sha256, search);
    for (const tranche of Object.values(manifest.tranches)) for (const part of tranche?.cells[cell]?.parts ?? []) {
      if (manifest.sources.some((source) => source.sourceId === part.sourceId && source.inWebPack)) result.set(part.sha256, part);
    }
  }
  return [...result.values()];
}
function validateRecord(value: unknown): value is PackRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PackRecord>;
  return typeof record.id === "string" && typeof record.region === "string" && ["venue", "washroom", "transit", "path"].includes(record.tranche ?? "") && !!record.fields && typeof record.fields === "object";
}
function validateHit(value: unknown): value is SearchHit {
  if (!value || typeof value !== "object") return false;
  const hit = value as Partial<SearchHit>;
  return typeof hit.id === "string" && typeof hit.nameNorm === "string" && typeof hit.lat === "number" && typeof hit.lon === "number" && (hit.name === null || typeof hit.name === "string") && ["venue", "washroom", "transit", "path"].includes(hit.tranche ?? "");
}
async function parseGzip(bytes: Uint8Array, isSearch: boolean, part: string): Promise<CachedPart> {
  if (typeof DecompressionStream === "undefined") throw new PackClientError("content", part);
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  const records: PackRecord[] = [];
  const search: SearchHit[] = [];
  let pending = "";
  const consume = (line: string) => {
    if (!line.trim()) return;
    const item: unknown = JSON.parse(line);
    if (!validateRecord(item)) throw new PackClientError("content", part);
    records.push(item);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += value;
      if (!isSearch) {
        let newline = pending.indexOf("\n");
        while (newline >= 0) { consume(pending.slice(0, newline)); pending = pending.slice(newline + 1); newline = pending.indexOf("\n"); }
      }
    }
    if (isSearch) {
      const parsed: unknown = JSON.parse(pending);
      if (!Array.isArray(parsed) || !parsed.every(validateHit)) throw new PackClientError("content", part);
      search.push(...parsed);
    } else consume(pending);
  } catch (error) { if (error instanceof PackClientError) throw error; throw new PackClientError("content", part); }
  return { sha256: "", records, search };
}
async function digest(bytes: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function createPackSource(opts: { baseUrl: string; fetch?: typeof fetch; db?: "indexeddb" | "memory" }): PackSource {
  const fetcher = opts.fetch ?? fetch;
  const url = opts.baseUrl.endsWith("/") ? opts.baseUrl : `${opts.baseUrl}/`;
  const db = opts.db === "memory" ? null : new PackDatabase();
  const memoryParts = new Map<string, CachedPart>();
  const memoryRegions = new Map<string, RegionEntry>();
  let manifestPromise: Promise<PackManifest> | undefined;
  let lastManifest: PackManifest | undefined;
  const readPart = async (hash: string) => db ? db.parts.get(hash) : memoryParts.get(hash);
  const readRegion = async (id: string) => db ? db.regions.get(id) : memoryRegions.get(id);
  async function manifest(): Promise<PackManifest> {
    if (!manifestPromise) manifestPromise = (async () => {
      const saved = await db?.metadata.get("manifest");
      try {
        const response = await fetcher(`${url}pack/v1/manifest.json`);
        if (!response.ok) throw new Error("manifest response");
        const result = await response.json() as PackManifest;
        if (result.version !== 1 || !Array.isArray(result.regions) || !result.tranches || !result.search || !Array.isArray(result.sources)) throw new Error("manifest schema");
        lastManifest = result;
        await db?.metadata.put({ id: "manifest", manifest: result });
        return result;
      } catch {
        if (saved) { lastManifest = saved.manifest; return saved.manifest; }
        throw new PackClientError("network", "pack/v1/manifest.json");
      }
    })();
    return manifestPromise;
  }
  async function cellsFor(area: { bbox: [number, number, number, number] } | { lat: number; lon: number; radiusM: number }) {
    const pack = await manifest();
    const cellBounds = new Map<string, number[]>();
    for (const tranche of Object.values(pack.tranches)) for (const [cell, entry] of Object.entries(tranche?.cells ?? {})) cellBounds.set(cell, entry.bbox);
    for (const region of pack.regions) for (const cell of region.cells) if (!cellBounds.has(cell)) {
      const match = /^([ns])(\d+(?:\.\d+)?)_([ew])(\d+(?:\.\d+)?)$/.exec(cell);
      if (match) { const lat = Number(match[2]) * (match[1] === "s" ? -1 : 1); const lon = Number(match[4]) * (match[3] === "w" ? -1 : 1); cellBounds.set(cell, [lon, lat, lon + .5, lat + .5]); }
    }
    return [...cellBounds].filter(([, bbox]) => overlap(bbox, bounds(area))).map(([cell]) => cell).sort();
  }
  async function fetchPart(part: PackPart, isSearch: boolean, onBytes?: (size: number) => void): Promise<CachedPart> {
    const existing = await readPart(part.sha256);
    if (existing) return existing;
    let response: Response;
    try { response = await fetcher(`${url}${part.path}`); if (!response.ok) throw new Error("response"); }
    catch { throw new PackClientError("network", part.path); }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      if (reader) for (;;) {
        const next = await reader.read();
        if (next.done) break;
        chunks.push(next.value); received += next.value.byteLength; onBytes?.(next.value.byteLength);
      }
      else { const chunk = new Uint8Array(await response.arrayBuffer()); chunks.push(chunk); received = chunk.byteLength; onBytes?.(chunk.byteLength); }
    } catch { throw new PackClientError("network", part.path); }
    if (received !== part.bytes) throw new PackClientError("bytes", part.path, part.bytes, received);
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if ((await digest(bytes)) !== part.sha256.toLowerCase()) throw new PackClientError("sha256", part.path);
    const parsed = await parseGzip(bytes, isSearch, part.path);
    if ((isSearch ? parsed.search.length : parsed.records.length) !== part.count) throw new PackClientError("content", part.path);
    parsed.sha256 = part.sha256;
    return parsed;
  }
  async function storedCells(pack: PackManifest): Promise<string[]> {
    const entries = db ? await db.regions.toArray() : [...memoryRegions.values()];
    return [...new Set(entries.flatMap((entry) => pack.regions.find((region) => region.id === entry.id)?.cells ?? []))];
  }
  async function regions(): Promise<RegionStatus[]> {
    const pack = await manifest();
    return Promise.all(pack.regions.map(async (region) => {
      const parts = partsIn(pack, region.cells);
      const stored = await readRegion(region.id);
      const missingHashes: string[] = [];
      for (const part of parts) if (!(await readPart(part.sha256))) missingHashes.push(part.sha256);
      return {
        id: region.id, label: region.label, cells: region.cells, bytes: parts.reduce((n, p) => n + p.bytes, 0),
        downloaded: !!stored && missingHashes.length === 0, verified: !!stored && missingHashes.length === 0,
        missingCells: region.cells.filter((cell) => partsIn(pack, [cell]).some((part) => missingHashes.includes(part.sha256))),
        builtAt: pack.builtAt, count: parts.filter((part) => part.sourceId).reduce((n, p) => n + p.count, 0),
      };
    }));
  }
  async function downloadRegion(id: string, onProgress?: (done: number, total: number) => void): Promise<RegionStatus> {
    const pack = await manifest();
    const region = pack.regions.find((item) => item.id === id);
    if (!region) throw new PackClientError("missing", id);
    const parts = partsIn(pack, region.cells);
    const total = parts.reduce((sum, part) => sum + part.bytes, 0);
    const pending = new Map<string, CachedPart>();
    let outstanding = 0;
    for (const part of parts) if (!(await readPart(part.sha256))) outstanding += part.bytes;
    const estimate = await globalThis.navigator?.storage?.estimate?.();
    if (estimate?.quota !== undefined && estimate.usage !== undefined && outstanding > estimate.quota - estimate.usage) {
      throw new PackClientError("quota", id, outstanding, Math.max(0, estimate.quota - estimate.usage));
    }
    let done = total - outstanding;
    onProgress?.(done, total);
    for (const part of parts) {
      if (await readPart(part.sha256)) continue;
      const parsed = await fetchPart(part, !part.sourceId, (size) => { done += size; onProgress?.(Math.min(done, total), total); });
      pending.set(part.sha256, parsed);
    }
    // All parts must pass byte, digest, parse, and count validation before any write.
    const entry = { id, hashes: parts.map((part) => part.sha256) };
    if (db) await db.transaction("rw", db.parts, db.regions, async () => {
      await db.parts.bulkPut([...pending.values()]);
      await db.regions.put(entry);
    });
    else { for (const [key, value] of pending) memoryParts.set(key, value); memoryRegions.set(id, entry); }
    return (await regions()).find((value) => value.id === id)!;
  }
  /**
   * Download one cell of a region. Every part is checked for size, digest and
   * record count before anything is written; the parts and the region entry are
   * then written together, so a failed cell leaves earlier cells untouched.
   * Resolves with the cell's byte count.
   */
  async function downloadCell(regionId: string, cellId: string, onBytes?: (size: number) => void): Promise<number> {
    const pack = await manifest();
    const region = pack.regions.find((item) => item.id === regionId);
    if (!region || !region.cells.includes(cellId)) throw new PackClientError("missing", `${regionId}/${cellId}`);
    const parts = partsIn(pack, [cellId]);
    const pending = new Map<string, CachedPart>();
    let received = 0;
    for (const part of parts) {
      if (await readPart(part.sha256)) { received += part.bytes; onBytes?.(part.bytes); continue; }
      pending.set(part.sha256, await fetchPart(part, !part.sourceId, onBytes));
      received += part.bytes;
    }
    const previous = await readRegion(regionId);
    const entry = { id: regionId, hashes: [...new Set([...(previous?.hashes ?? []), ...parts.map((part) => part.sha256)])] };
    if (db) await db.transaction("rw", db.parts, db.regions, async () => {
      await db.parts.bulkPut([...pending.values()]);
      await db.regions.put(entry);
    });
    else { for (const [key, value] of pending) memoryParts.set(key, value); memoryRegions.set(regionId, entry); }
    return received;
  }
  async function deleteRegion(id: string): Promise<void> {
    const pack = await manifest();
    const region = pack.regions.find((item) => item.id === id);
    if (!region) throw new PackClientError("missing", id);
    // Older copies from a previous build are listed in the region entry; delete them too.
    if (db) await db.transaction("rw", db.parts, db.regions, async () => {
      const owned = new Set([...partsIn(pack, region.cells).map((part) => part.sha256), ...((await db.regions.get(id))?.hashes ?? [])]);
      await db.regions.delete(id);
      const remaining = new Set((await db.regions.toArray()).flatMap((entry) => entry.hashes));
      for (const hash of owned) if (!remaining.has(hash)) await db.parts.delete(hash);
    });
    else {
      const owned = new Set([...partsIn(pack, region.cells).map((part) => part.sha256), ...(memoryRegions.get(id)?.hashes ?? [])]);
      memoryRegions.delete(id);
      const remaining = new Set([...memoryRegions.values()].flatMap((entry) => entry.hashes));
      for (const hash of owned) if (!remaining.has(hash)) memoryParts.delete(hash);
    }
  }
  async function* records(tranche: Tranche, cell: string, signal?: AbortSignal): AsyncIterable<PackRecord> {
    const pack = await manifest();
    for (const part of pack.tranches[tranche]?.cells[cell]?.parts ?? []) {
      if (signal?.aborted) return;
      if (!pack.sources.some((source) => source.sourceId === part.sourceId && source.inWebPack)) continue;
      const cached = await readPart(part.sha256);
      if (!cached) continue;
      for (const record of cached.records) { if (signal?.aborted) return; yield record; }
    }
  }
  async function search(text: string, opts: { near?: { lat: number; lon: number }; tranches?: Tranche[]; limit?: number }): Promise<SearchHit[]> {
    const pack = await manifest();
    const query = norm(text);
    if (!query) return [];
    const selected = opts.near ? await cellsFor({ ...opts.near, radiusM: 25000 }) : await storedCells(pack);
    const cells = selected.length ? selected : pack.regions.find((region) => region.id === "toronto")?.cells ?? [];
    const hits: SearchHit[] = [];
    for (const cell of cells) {
      const part = pack.search[cell];
      if (!part) continue;
      const cached = await readPart(part.sha256);
      if (!cached) continue;
      for (const hit of cached.search) if (hit.name && rank(norm(hit.nameNorm), query) < 3 && (!opts.tranches || opts.tranches.includes(hit.tranche))) hits.push(hit);
    }
    const unique = new Map(hits.map((hit) => [hit.id, hit]));
    return [...unique.values()].sort((a, b) => rank(norm(a.nameNorm), query) - rank(norm(b.nameNorm), query) || (opts.near ? distance(a, opts.near) - distance(b, opts.near) : 0) || a.id.localeCompare(b.id)).slice(0, Math.max(0, opts.limit ?? 50));
  }
  async function get(id: string): Promise<PackRecord | null> {
    const pack = await manifest();
    const active = await storedCells(pack);
    for (const cell of active) for (const tranche of Object.keys(pack.tranches) as Tranche[]) {
      for await (const record of records(tranche, cell)) if (record.id === id) return record;
    }
    return null;
  }
  function sourcesFor(record: PackRecord): PackSourceEntry[] {
    const ids = new Set(Object.values(record.fields).map((field) => field.source_id));
    return (lastManifest?.sources ?? []).filter((source) => ids.has(source.sourceId) && source.inWebPack);
  }
  return { manifest, cellsFor, records, search, get, sourcesFor, regions, downloadRegion, downloadCell, deleteRegion };
}

/** In-memory source for deterministic consumer tests, never used as production data. */
export function createFixtureSource(records: PackRecord[], sources: PackSourceEntry[]): PackSource {
  const cells = ["fixture"];
  const manifest: PackManifest = { version: 1, builtAt: "1970-01-01T00:00:00Z", sourceCommit: "fixture", sources, regions: [{ id: "fixture", label: { en: "Fixture", fr: "Exemple" }, bbox: [-180, -90, 180, 90], cells }], tranches: {}, search: {}, tiles: {}, counts: { records: records.length, byTranche: {}, bySource: {} } };
  let downloaded = true;
  return {
    manifest: async () => manifest,
    cellsFor: async () => cells,
    async *records(tranche, cell) { if (downloaded && cell === "fixture") yield* records.filter((record) => record.tranche === tranche && Object.values(record.fields).some((field) => sources.some((source) => source.inWebPack && source.sourceId === field.source_id))); },
    async search(text, opts) { if (!downloaded) return []; const q = norm(text); return records.filter((record) => !opts.tranches || opts.tranches.includes(record.tranche)).map((record) => ({ record, name: record.fields.name?.value })).filter(({ record, name }) => typeof name === "string" && name !== "UNKNOWN" && sources.some((source) => source.inWebPack && Object.values(record.fields).some((field) => field.source_id === source.sourceId))).map(({ record, name }) => ({ id: record.id, tranche: record.tranche, name: String(name), nameNorm: norm(String(name)), lat: Number(record.fields.lat?.value ?? 0), lon: Number(record.fields.lon?.value ?? 0) })).filter((hit) => rank(hit.nameNorm, q) < 3).sort((a, b) => rank(a.nameNorm, q) - rank(b.nameNorm, q) || (opts.near ? distance(a, opts.near) - distance(b, opts.near) : 0)).slice(0, opts.limit ?? 50); },
    async get(id) { return downloaded ? records.find((record) => record.id === id) ?? null : null; },
    sourcesFor(record) { return sources.filter((source) => source.inWebPack && Object.values(record.fields).some((field) => field.source_id === source.sourceId)); },
    async regions() { return [{ id: "fixture", label: { en: "Fixture", fr: "Exemple" }, cells, bytes: 0, downloaded, verified: downloaded, missingCells: downloaded ? [] : cells, builtAt: manifest.builtAt, count: records.length }]; },
    async downloadRegion() {
      downloaded = true;
      const status = (await this.regions())[0];
      if (!status) throw new Error("fixture region missing");
      return status;
    },
    async deleteRegion() { downloaded = false; },
  };
}
