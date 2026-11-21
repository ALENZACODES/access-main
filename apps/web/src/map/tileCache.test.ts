/** @vitest-environment jsdom */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { filesForView, loadVerifiedTile, parseTileList, readTileList, TileFileUnavailable, VerifiedPMTilesSource, type TileFile, type TileLoadDeps } from "./tileCache.ts";

/** Test bytes only; they are not real map tiles. */
const BASE = `${location.origin}/data/`;
const good = new TextEncoder().encode("fixture tile bytes n43");
const text = (bytes: ArrayBuffer) => new TextDecoder().decode(bytes);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function entry(path: string, bytes: Uint8Array, licence: string, bbox: [number, number, number, number]) {
  return { path, bytes: bytes.byteLength, sha256: sha(bytes), licence, bbox };
}

const manifest = {
  tiles: {
    open: entry("tiles/open/places.pmtiles", good, "OGL-Ontario", [-95, 41.6, -74.3, 56.9]),
    "odbl/n43": entry("tiles/odbl/places-n43.pmtiles", good, "ODbL-1.0", [-83, 43, -76, 44]),
    "odbl/n44-w080": entry("tiles/odbl/places-n44-w080.pmtiles", good, "ODbL-1.0", [-80, 44, -79, 45]),
    // Rejected: ODbL outside the odbl family, a path outside tiles/, a bad digest, no bounds, a key the builder never writes.
    "open/n45": entry("tiles/open/places-n45.pmtiles", good, "ODbL-1.0", [-80, 45, -79, 46]),
    "odbl/n46": entry("../secret.pmtiles", good, "ODbL-1.0", [-80, 46, -79, 47]),
    "odbl/n47": { ...entry("tiles/odbl/places-n47.pmtiles", good, "ODbL-1.0", [-80, 47, -79, 48]), sha256: "abc" },
    "odbl/n48": { ...entry("tiles/odbl/places-n48.pmtiles", good, "ODbL-1.0", [-80, 48, -79, 49]), bbox: null },
    places: entry("tiles/odbl/places.pmtiles", good, "ODbL-1.0", [-80, 43, -79, 44]),
  },
};

function memoryCache(): Cache {
  const store = new Map<string, Response>();
  return {
    match: async (key: RequestInfo | URL) => store.get(String(key instanceof Request ? key.url : key))?.clone(),
    put: async (key: RequestInfo | URL, response: Response) => { store.set(String(key instanceof Request ? key.url : key), response.clone()); },
    delete: async (key: RequestInfo | URL) => store.delete(String(key instanceof Request ? key.url : key)),
    keys: async () => [...store.keys()].map((url) => new Request(url)),
  } as unknown as Cache;
}

function deps(responses: Array<Uint8Array | Error>, cache: Cache | null = memoryCache()): TileLoadDeps & { fetch: ReturnType<typeof vi.fn> } {
  const fetch = vi.fn(async () => {
    const next = responses.shift();
    if (!next || next instanceof Error) throw next ?? new Error("no response");
    return new Response(next.slice());
  });
  return { fetch, cache: async () => cache, listCache: async () => cache };
}

function file(key = "odbl/n43"): TileFile {
  const found = parseTileList(manifest, BASE).files.find((item) => item.key === key);
  if (!found) throw new Error(`fixture ${key} missing`);
  return found;
}

describe("tile list from the pack manifest", () => {
  it("reads the family, band, path, size, digest, licence and bounds of each file", () => {
    const { files, rejected } = parseTileList(manifest, BASE);
    expect(files.map((item) => [item.key, item.family, item.band.lat, item.band.lon])).toEqual([
      ["odbl/n43", "odbl", "n43", null],
      ["odbl/n44-w080", "odbl", "n44", "w080"],
      ["open", "open", null, null],
    ]);
    expect(files[0]?.url).toBe(`${location.origin}/data/tiles/odbl/places-n43.pmtiles`);
    expect(rejected.sort()).toEqual(["odbl/n46", "odbl/n47", "odbl/n48", "open/n45", "places"]);
  });

  it("loads only the files that cover the view", () => {
    const { files } = parseTileList(manifest, BASE);
    expect(filesForView(files, [-79.5, 43.6, -79.3, 43.7]).map((item) => item.key)).toEqual(["odbl/n43", "open"]);
    expect(filesForView(files, [-79.9, 44.2, -79.1, 44.4]).map((item) => item.key)).toEqual(["odbl/n44-w080", "open"]);
    expect(filesForView(files, [-70, 30, -69, 31])).toEqual([]);
  });

  it("keeps the last list read, for an offline visit", async () => {
    const cache = memoryCache();
    const online: TileLoadDeps = { fetch: async () => new Response(JSON.stringify(manifest)), cache: async () => cache, listCache: async () => cache };
    expect((await readTileList(BASE, online)).files).toHaveLength(3);
    const offline: TileLoadDeps = { fetch: async () => { throw new TypeError("offline"); }, cache: async () => cache, listCache: async () => cache };
    expect((await readTileList(BASE, offline)).files.map((item) => item.key)).toEqual(["odbl/n43", "odbl/n44-w080", "open"]);
    const empty: TileLoadDeps = { ...offline, listCache: async () => memoryCache() };
    await expect(readTileList(BASE, empty)).rejects.toThrow();
  });
});

describe("checked tile files", () => {
  it("uses a file only after its SHA-256 matches, and stores it", async () => {
    const cache = memoryCache();
    const first = deps([good], cache);
    expect(text(await loadVerifiedTile(file(), first))).toBe("fixture tile bytes n43");
    expect(first.fetch).toHaveBeenCalledTimes(1);
    // The stored copy is checked again and used without the network.
    const second = deps([], cache);
    expect(text(await loadVerifiedTile(file(), second))).toBe("fixture tile bytes n43");
    expect(second.fetch).not.toHaveBeenCalled();
  });

  it("fetches a file that fails its check once more without the HTTP cache", async () => {
    const bad = new TextEncoder().encode("fixture tile bytes n4X");
    const once = deps([bad, good]);
    expect(text(await loadVerifiedTile(file(), once))).toBe("fixture tile bytes n43");
    expect(once.fetch).toHaveBeenCalledTimes(2);
    expect(once.fetch.mock.calls[1]?.[1]).toEqual({ cache: "no-store" });
  });

  it("reports a file that fails twice as unavailable for integrity, and stores nothing", async () => {
    const cache = memoryCache();
    const bad = new TextEncoder().encode("fixture tile bytes n4X");
    const twice = deps([bad, bad], cache);
    const failure = await loadVerifiedTile(file(), twice).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TileFileUnavailable);
    expect(failure).toMatchObject({ key: "odbl/n43", reason: "integrity" });
    expect(await cache.keys()).toHaveLength(0);
  });

  it("reports a file that cannot be fetched and is not stored as unavailable for the network", async () => {
    await expect(loadVerifiedTile(file(), deps([new TypeError("offline")]))).rejects.toMatchObject({ reason: "network" });
  });

  it("drops a stored copy that no longer matches and fetches the file again", async () => {
    const cache = memoryCache();
    await loadVerifiedTile(file(), deps([good], cache));
    const [key] = await cache.keys();
    await cache.put(key!, new Response(new TextEncoder().encode("fixture tile bytes zz")));
    const again = deps([good], cache);
    expect(text(await loadVerifiedTile(file(), again))).toBe("fixture tile bytes n43");
    expect(again.fetch).toHaveBeenCalledTimes(1);
  });

  it("serves byte ranges from the checked file and never from an unchecked one", async () => {
    const load = vi.fn(async () => good.buffer.slice(0));
    const source = new VerifiedPMTilesSource(file(), load);
    expect(new TextDecoder().decode((await source.getBytes(0, 7)).data)).toBe("fixture");
    expect(new TextDecoder().decode((await source.getBytes(8, 4)).data)).toBe("tile");
    expect(load).toHaveBeenCalledTimes(1);
    const failing = new VerifiedPMTilesSource(file(), async () => { throw new TileFileUnavailable("odbl/n43", "integrity"); });
    await expect(failing.getBytes(0, 7)).rejects.toBeInstanceOf(TileFileUnavailable);
  });
});
