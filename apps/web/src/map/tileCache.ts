/**
 * Map tile files from the data pack's tile list. No tile service is contacted.
 *
 * The pack manifest lists every PMTiles file (`manifest.tiles`): one per
 * family ("open", "odbl") or, when a family is split to stay under the file
 * limit, one per latitude band ("odbl/n43") or band and longitude
 * ("odbl/n43-w080"). Each entry has a path, a size, a SHA-256, a licence and
 * the map bounds of its features. Only the files that cover the visible area
 * are loaded. A whole file is checked against its SHA-256 before it is used or
 * stored, the same rule packages/data-client applies to pack parts: a file
 * that fails is fetched once more without the HTTP cache; if it fails again,
 * that file is unavailable and the other files still work.
 */
import type { RangeResponse, Source } from "pmtiles";

export const TILE_CACHE_NAME = "map-tiles-v2";
/** Kept apart from the files, so evicting a file never drops the list. */
export const TILE_LIST_CACHE_NAME = "map-tile-list-v1";
const MAX_BYTES = 50 * 1024 * 1024;
const HEADER_SIZE = "x-map-cache-size";
const HEADER_TIME = "x-map-cache-last-used";
const MANIFEST_PATH = "pack/v1/manifest.json";
const TILE_LIST_KEY = "__map_tile_list";
const PATH = /^tiles\/(open|odbl)\/places(?:-[a-z0-9-]+)?\.pmtiles$/;
const KEY = /^(open|odbl)(?:\/([ns]\d{1,2})(?:-([ew]\d{3}))?)?$/;
const SHA = /^[0-9a-f]{64}$/;

export type TileFamily = "open" | "odbl";
export type BBox = [number, number, number, number];

export interface TileFile {
  key: string;
  family: TileFamily;
  /** Latitude band ("n43") and longitude band ("w080") from the key, when the family is split. */
  band: { lat: string | null; lon: string | null };
  path: string;
  url: string;
  bytes: number;
  sha256: string;
  licence: string;
  bbox: BBox;
}

export type TileProblem = "integrity" | "network";

export class TileFileUnavailable extends Error {
  constructor(readonly key: string, readonly reason: TileProblem) {
    super(`Tile file ${key} is unavailable (${reason})`);
    this.name = "TileFileUnavailable";
  }
}

function sameOrigin(url: string): void {
  if (new URL(url, location.href).origin !== location.origin) {
    throw new Error("Cross-origin tile requests are prohibited");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBbox(value: unknown): value is BBox {
  return Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

/** `${BASE_URL}data/` as an absolute same-origin URL. */
export function dataBaseUrl(): string {
  const url = new URL("data/", new URL(import.meta.env.BASE_URL, location.origin));
  sameOrigin(url.href);
  return url.href;
}

/**
 * Reads `manifest.tiles`. An entry whose key, path, size, digest, licence or
 * bounds is not what the pack builder writes is listed in `rejected` and never
 * loaded. ODbL data is accepted only in the "odbl" family.
 */
export function parseTileList(manifest: unknown, baseUrl: string): { files: TileFile[]; rejected: string[] } {
  const files: TileFile[] = [];
  const rejected: string[] = [];
  const tiles = isRecord(manifest) && isRecord(manifest.tiles) ? manifest.tiles : {};
  for (const [key, entry] of Object.entries(tiles).sort(([a], [b]) => a.localeCompare(b))) {
    const keyMatch = KEY.exec(key);
    if (!keyMatch || !isRecord(entry)) { rejected.push(key); continue; }
    const { path, bytes, sha256, licence, bbox } = entry;
    const family = keyMatch[1] as TileFamily;
    const pathMatch = typeof path === "string" ? PATH.exec(path) : null;
    const odbl = typeof licence === "string" && /odbl/i.test(licence);
    if (!pathMatch || pathMatch[1] !== family || typeof bytes !== "number" || !Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_BYTES
      || typeof sha256 !== "string" || !SHA.test(sha256.toLowerCase()) || typeof licence !== "string" || !licence.trim()
      || odbl !== (family === "odbl") || !isBbox(bbox)) {
      rejected.push(key);
      continue;
    }
    const url = new URL(path as string, baseUrl).href;
    sameOrigin(url);
    files.push({
      key, family, band: { lat: keyMatch[2] ?? null, lon: keyMatch[3] ?? null },
      path: path as string, url, bytes, sha256: sha256.toLowerCase(), licence, bbox,
    });
  }
  return { files, rejected };
}

function overlaps(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** The files whose features can fall inside the view. */
export function filesForView(files: readonly TileFile[], view: BBox): TileFile[] {
  return files.filter((file) => overlaps(file.bbox, view));
}

async function digest(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function openCache(name = TILE_CACHE_NAME): Promise<Cache | null> {
  try {
    return typeof caches !== "undefined" ? await caches.open(name) : null;
  } catch {
    return null;
  }
}

/** A Promise chain serializes eviction across simultaneous loads. */
let pending: Promise<void> = Promise.resolve();

async function putBounded(cache: Cache, request: Request, bytes: ArrayBuffer): Promise<void> {
  const copy = bytes.slice(0);
  pending = pending.catch(() => {}).then(async () => {
    if (copy.byteLength > MAX_BYTES) return;
    const keys = await cache.keys();
    const entries: Array<{ key: Request; size: number; time: number }> = [];
    let total = 0;
    for (const key of keys) {
      const entry = await cache.match(key);
      if (!entry) continue;
      const size = Number(entry.headers.get(HEADER_SIZE)) || (await entry.clone().arrayBuffer()).byteLength;
      entries.push({ key, size, time: Number(entry.headers.get(HEADER_TIME)) || 0 });
      total += size;
    }
    const previous = entries.find((entry) => entry.key.url === request.url);
    if (previous) total -= previous.size;
    entries.sort((a, b) => a.time - b.time);
    for (const entry of entries) {
      if (total + copy.byteLength <= MAX_BYTES) break;
      if (entry.key.url === request.url) continue;
      await cache.delete(entry.key);
      total -= entry.size;
    }
    await cache.put(request, new Response(copy, {
      headers: { [HEADER_SIZE]: String(copy.byteLength), [HEADER_TIME]: String(Date.now()) },
    }));
  });
  await pending;
}

/** The stored copy is keyed by path and digest, so a rebuilt file never reuses an older copy. */
function fileKey(file: TileFile): Request {
  const key = new URL(file.url);
  key.searchParams.set("__sha256", file.sha256);
  return new Request(key.href);
}

export interface TileLoadDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  cache: () => Promise<Cache | null>;
  listCache?: () => Promise<Cache | null>;
}

const defaultDeps: TileLoadDeps = { fetch: (url, init) => fetch(url, init), cache: () => openCache(), listCache: () => openCache(TILE_LIST_CACHE_NAME) };

/**
 * The whole file, checked against the size and SHA-256 its manifest entry
 * lists. A stored copy is checked again before use. Network failure without a
 * stored copy: "network". Two downloads that do not match: "integrity".
 */
export async function loadVerifiedTile(file: TileFile, deps: TileLoadDeps = defaultDeps): Promise<ArrayBuffer> {
  sameOrigin(file.url);
  const cache = await deps.cache();
  const key = fileKey(file);
  const stored = await cache?.match(key);
  if (stored) {
    const bytes = await stored.arrayBuffer();
    if (bytes.byteLength === file.bytes && (await digest(bytes)) === file.sha256) {
      if (cache) await putBounded(cache, key, bytes).catch(() => {});
      return bytes;
    }
    await cache?.delete(key);
  }
  const attempt = async (init?: RequestInit): Promise<ArrayBuffer | null> => {
    let response: Response;
    try {
      response = await deps.fetch(file.url, init);
    } catch {
      throw new TileFileUnavailable(file.key, "network");
    }
    if (!response.ok) throw new TileFileUnavailable(file.key, "network");
    const bytes = await response.arrayBuffer();
    return bytes.byteLength === file.bytes && (await digest(bytes)) === file.sha256 ? bytes : null;
  };
  const bytes = (await attempt()) ?? (await attempt({ cache: "no-store" }));
  if (!bytes) throw new TileFileUnavailable(file.key, "integrity");
  if (cache) await putBounded(cache, key, bytes).catch(() => {});
  return bytes;
}

/** A PMTiles source over one checked file. Nothing is read from it until the file has passed its check. */
export class VerifiedPMTilesSource implements Source {
  private loading: Promise<ArrayBuffer> | null = null;

  constructor(private readonly file: TileFile, private readonly load: (file: TileFile) => Promise<ArrayBuffer> = loadVerifiedTile) {
    sameOrigin(file.url);
  }

  getKey(): string {
    return this.file.url;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    this.loading ??= this.load(this.file);
    const bytes = await this.loading;
    if (offset < 0 || offset >= bytes.byteLength) throw new Error("Unexpected PMTiles byte range");
    return { data: bytes.slice(offset, Math.min(bytes.byteLength, offset + length)) };
  }
}

/**
 * The tile list from the pack manifest. The last list read is kept in the
 * tile cache, so a later offline visit still finds the files it stored.
 */
export type SourceInfo = { name: string; licence: string; retrieved: string; attribution: string };

/** The tile list, and the pack's source list read from the same manifest (empty when only the saved tile list is available). */
export async function readTileList(baseUrl = dataBaseUrl(), deps: TileLoadDeps = defaultDeps): Promise<{ files: TileFile[]; rejected: string[]; sources?: Map<string, SourceInfo> }> {
  const cache = await (deps.listCache ?? deps.cache)();
  const listKey = new Request(new URL(TILE_LIST_KEY, baseUrl).href);
  try {
    const response = await deps.fetch(new URL(MANIFEST_PATH, baseUrl).href);
    if (!response.ok) throw new Error("manifest response");
    const manifest = await response.json() as unknown;
    if (!isRecord(manifest) || !isRecord(manifest.tiles)) throw new Error("manifest has no tile list");
    const list = parseTileList(manifest, baseUrl);
    await cache?.put(listKey, new Response(JSON.stringify({ tiles: manifest.tiles, sources: manifest.sources }))).catch(() => {});
    return { ...list, sources: parseSourceList(manifest) };
  } catch {
    const saved = await cache?.match(listKey);
    if (!saved) throw new Error("No tile list could be read");
    const savedList = await saved.json() as unknown;
    return { ...parseTileList(savedList, baseUrl), sources: parseSourceList(savedList) };
  }
}

/**
 * Each data source's own name, licence, date and credit, from the pack's list of sources,
 * so the map can say "City of Toronto, OGL-Toronto, 2026-11-13" instead of a raw id.
 */
export function parseSourceList(manifest: unknown): Map<string, SourceInfo> {
  const out = new Map<string, SourceInfo>();
  if (!isRecord(manifest) || !Array.isArray(manifest.sources)) return out;
  for (const entry of manifest.sources) {
    if (!isRecord(entry) || typeof entry.sourceId !== "string") continue;
    out.set(entry.sourceId, {
      name: typeof entry.name === "string" ? entry.name : entry.sourceId,
      licence: typeof entry.licence === "string" ? entry.licence : "",
      retrieved: typeof entry.retrieved === "string" ? entry.retrieved : "",
      attribution: typeof entry.attribution === "string" ? entry.attribution : "",
    });
  }
  return out;
}

/** Load and store the checked files that cover a downloaded region. A file that fails is skipped. */
export async function warmRegionTiles(files: readonly TileFile[], bbox: BBox): Promise<void> {
  for (const file of filesForView(files, bbox)) {
    await loadVerifiedTile(file).catch(() => undefined);
  }
}
