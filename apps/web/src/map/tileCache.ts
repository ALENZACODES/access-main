/** Same-origin, byte-range cache for PMTiles. No tile service is contacted. */
import type { RangeResponse, Source } from "pmtiles";

export const TILE_CACHE_NAME = "map-tiles-v1";
const MAX_BYTES = 50 * 1024 * 1024;
const HEADER_SIZE = "x-map-cache-size";
const HEADER_TIME = "x-map-cache-last-used";

function sameOrigin(url: string): void {
  if (new URL(url, location.href).origin !== location.origin) {
    throw new Error("Cross-origin tile requests are prohibited");
  }
}

function rangeKey(url: string, offset: number, length: number): Request {
  const key = new URL(url, location.href);
  key.searchParams.set("__pmtiles_offset", String(offset));
  key.searchParams.set("__pmtiles_length", String(length));
  return new Request(key.href);
}

/** A Promise chain serializes eviction across simultaneous MapLibre workers. */
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

export class CachedPMTilesSource implements Source {
  constructor(private readonly url: string) {
    sameOrigin(url);
  }

  getKey(): string {
    return this.url;
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    const request = rangeKey(this.url, offset, length);
    const cache = typeof caches !== "undefined" ? await caches.open(TILE_CACHE_NAME) : null;
    const hit = await cache?.match(request);
    if (hit) {
      // The stored bytes survive a reload, including an offline reload.
      const bytes = await hit.arrayBuffer();
      if (cache) await putBounded(cache, request, bytes).catch(() => {});
      return { data: bytes, etag };
    }
    const headers: HeadersInit = { Range: `bytes=${offset}-${offset + length - 1}` };
    if (etag) headers["If-Match"] = etag;
    const response = await fetch(this.url, { headers, signal });
    if (!response.ok || (response.status !== 206 && response.status !== 200)) {
      throw new Error(`PMTiles request failed (${response.status})`);
    }
    const received = await response.arrayBuffer();
    const bytes = response.status === 200 ? received.slice(offset, offset + length) : received;
    if (bytes.byteLength === 0 || bytes.byteLength > length) throw new Error("Unexpected PMTiles byte range");
    if (cache) await putBounded(cache, request, bytes).catch(() => {});
    return { data: bytes, etag: response.headers.get("ETag") ?? undefined };
  }
}

export function tileArchiveUrl(): string {
  const base = new URL(import.meta.env.BASE_URL, location.origin);
  const url = new URL("data/tiles/odbl/places.pmtiles", base);
  sameOrigin(url.href);
  return url.href;
}

/** Prime the header and all byte ranges touched by tiles in the downloaded region. */
export async function warmRegionTiles(
  archive: import("pmtiles").PMTiles,
  bbox: [number, number, number, number],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const coordinates: Array<[number, number, number]> = [];
  const clamp = (lat: number) => Math.max(-85.0511, Math.min(85.0511, lat));
  for (let z = 10; z <= 15; z += 1) {
    const size = 2 ** z;
    const x = (lon: number) => Math.max(0, Math.min(size - 1, Math.floor(((lon + 180) / 360) * size)));
    const y = (lat: number) => Math.max(0, Math.min(size - 1, Math.floor(((1 - Math.asinh(Math.tan(clamp(lat) * Math.PI / 180)) / Math.PI) / 2) * size)));
    for (let xx = x(bbox[0]); xx <= x(bbox[2]); xx += 1) {
      for (let yy = y(bbox[3]); yy <= y(bbox[1]); yy += 1) coordinates.push([z, xx, yy]);
    }
  }
  let done = 0;
  // Bounded concurrency prevents a large region exhausting network resources.
  let next = 0;
  const worker = async () => {
    while (next < coordinates.length) {
      const tile = coordinates[next++];
      if (!tile) break;
      try { await archive.getZxy(tile[0], tile[1], tile[2]); } catch { /* Retry after reconnection. */ }
      onProgress?.(++done, coordinates.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, coordinates.length) }, worker));
}
