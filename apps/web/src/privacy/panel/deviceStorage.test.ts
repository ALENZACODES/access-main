import { describe, expect, it } from "vitest";
import { clearDevice, cookieNames, removable, scanDevice, type DeviceHost, type DeviceScan } from "./deviceStorage";

const NOW = new Date("2026-11-15T20:00:00Z");

interface Fake {
  host: DeviceHost;
  caches: Set<string>;
  dbs: Set<string>;
  deleted: string[];
}

function fake(over: Partial<{ caches: string[]; dbs: string[]; cookie: string; blockDb: string[]; failCache: string[] }> = {}): Fake {
  const caches = new Set(over.caches ?? ["app-v1", "app-tiles", "other-lib"]);
  const dbs = new Set(over.dbs ?? ["app-maps", "third-party"]);
  const deleted: string[] = [];
  const host: DeviceHost = {
    caches: {
      keys: () => Promise.resolve([...caches]),
      delete: (n) => {
        if (over.failCache?.includes(n)) return Promise.resolve(false);
        deleted.push(`cache:${n}`);
        return Promise.resolve(caches.delete(n));
      },
    },
    indexedDB: {
      databases: () => Promise.resolve([...dbs].map((name) => ({ name }))),
      deleteDatabase: (name) => {
        const req = { onsuccess: null as null | (() => void), onerror: null as null | (() => void), onblocked: null as null | (() => void) };
        queueMicrotask(() => {
          if (over.blockDb?.includes(name)) req.onblocked?.();
          else {
            deleted.push(`db:${name}`);
            dbs.delete(name);
            req.onsuccess?.();
          }
        });
        return req;
      },
    },
    document: { cookie: over.cookie ?? "a=1; b=2; a=3" },
  };
  return { host, caches, dbs, deleted };
}

describe("cookieNames", () => {
  it("lists distinct names only, never values", () => {
    expect(cookieNames("session=SECRET; theme=dark; session=OTHER")).toEqual(["session", "theme"]);
    expect(JSON.stringify(cookieNames("token=abc123"))).not.toContain("abc123");
  });
  it("handles empty and odd input", () => {
    expect(cookieNames("")).toEqual([]);
    expect(cookieNames(" ; ;=x; flag")).toEqual(["flag"]);
  });
});

describe("scanDevice", () => {
  it("lists sorted names", async () => {
    const s = await scanDevice(fake().host, NOW);
    expect(s).toEqual({ at: NOW.toISOString(), caches: ["app-tiles", "app-v1", "other-lib"], databases: ["app-maps", "third-party"], cookies: ["a", "b"] });
  });
  it("keeps Unknown as null, not an empty list", async () => {
    const s = await scanDevice({}, NOW);
    expect([s.caches, s.databases, s.cookies]).toEqual([null, null, null]);
  });
  it("an empty browser gives empty lists, which is different from Unknown", async () => {
    const s = await scanDevice(fake({ caches: [], dbs: [], cookie: "" }).host, NOW);
    expect([s.caches, s.databases, s.cookies]).toEqual([[], [], []]);
  });
  it("a browser without indexedDB.databases() is Unknown for databases", async () => {
    const f = fake();
    delete f.host.indexedDB!.databases;
    expect((await scanDevice(f.host, NOW)).databases).toBeNull();
  });
  it("a failing call is Unknown", async () => {
    const host: DeviceHost = { caches: { keys: () => Promise.reject(new Error("no")), delete: () => Promise.resolve(false) } };
    expect((await scanDevice(host, NOW)).caches).toBeNull();
  });
  it("a throwing cookie getter is Unknown", async () => {
    const host: DeviceHost = {
      document: Object.defineProperty({}, "cookie", {
        get() {
          throw new Error("sandboxed");
        },
      }) as { cookie: string },
    };
    expect((await scanDevice(host, NOW)).cookies).toBeNull();
  });
});

describe("clearDevice", () => {
  it("removes only names with the given prefixes", async () => {
    const f = fake();
    const scan = await scanDevice(f.host, NOW);
    const r = await clearDevice(f.host, scan, { cachePrefix: "app-", dbPrefix: "app-" });
    expect(r).toEqual({ caches: 2, databases: 1, failed: [] });
    expect([...f.caches]).toEqual(["other-lib"]);
    expect([...f.dbs]).toEqual(["third-party"]);
  });
  it("an empty or missing prefix removes nothing", async () => {
    const f = fake();
    const scan = await scanDevice(f.host, NOW);
    expect(await clearDevice(f.host, scan, {})).toEqual({ caches: 0, databases: 0, failed: [] });
    expect(await clearDevice(f.host, scan, { cachePrefix: "", dbPrefix: "" })).toEqual({ caches: 0, databases: 0, failed: [] });
    expect(f.deleted).toEqual([]);
  });
  it("only removes names that were in the scan", async () => {
    const f = fake();
    const scan = await scanDevice(f.host, NOW);
    f.caches.add("app-new");
    await clearDevice(f.host, scan, { cachePrefix: "app-" });
    expect(f.caches.has("app-new")).toBe(true);
  });
  it("reports failures by kind and name, and carries on", async () => {
    const f = fake({ failCache: ["app-v1"], blockDb: ["app-maps"] });
    const scan = await scanDevice(f.host, NOW);
    const r = await clearDevice(f.host, scan, { cachePrefix: "app-", dbPrefix: "app-" });
    expect(r.caches).toBe(1);
    expect(r.databases).toBe(0);
    expect(r.failed.sort()).toEqual(["cache:app-v1", "db:app-maps"]);
  });
  it("a throwing delete counts as a failure", async () => {
    const host: DeviceHost = { caches: { keys: () => Promise.resolve(["app-x"]), delete: () => Promise.reject(new Error("no")) } };
    const scan = await scanDevice(host, NOW);
    expect((await clearDevice(host, scan, { cachePrefix: "app-" })).failed).toEqual(["cache:app-x"]);
  });
  it("does nothing for an Unknown scan", async () => {
    const scan: DeviceScan = { at: NOW.toISOString(), caches: null, databases: null, cookies: null };
    expect(await clearDevice(fake().host, scan, { cachePrefix: "app-", dbPrefix: "app-" })).toEqual({ caches: 0, databases: 0, failed: [] });
  });
  it("never touches cookies", async () => {
    const f = fake();
    await clearDevice(f.host, await scanDevice(f.host, NOW), { cachePrefix: "app-", dbPrefix: "app-" });
    expect(f.host.document?.cookie).toBe("a=1; b=2; a=3");
  });
});

describe("removable", () => {
  it("matches what clearDevice would remove", async () => {
    const scan = await scanDevice(fake().host, NOW);
    expect(removable(scan, { cachePrefix: "app-" })).toEqual({ caches: ["app-tiles", "app-v1"], databases: [] });
    expect(removable(scan, {})).toEqual({ caches: [], databases: [] });
  });
});
