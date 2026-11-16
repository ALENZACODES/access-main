// Offline storage beyond localStorage: Cache Storage, IndexedDB and cookies.
// Only names are read, never contents. A browser that does not answer gives
// null (Unknown), never an empty list.

export interface DeviceHost {
  caches?: { keys(): Promise<string[]>; delete(name: string): Promise<boolean> };
  indexedDB?: {
    databases?: () => Promise<Array<{ name?: string }>>;
    deleteDatabase(name: string): {
      onsuccess: ((e?: unknown) => void) | null;
      onerror: ((e?: unknown) => void) | null;
      onblocked: ((e?: unknown) => void) | null;
    };
  };
  document?: { cookie: string };
}

export interface DeviceScan {
  /** ISO date and time of the check */
  at: string;
  caches: string[] | null;
  databases: string[] | null;
  /** Names of cookies a page can read. Cookies the browser hides from pages are not listed. */
  cookies: string[] | null;
}

async function list<T>(f: (() => Promise<T[]>) | undefined): Promise<T[] | null> {
  if (f === undefined) return null;
  try {
    return await f();
  } catch {
    return null;
  }
}

export function cookieNames(raw: string): string[] {
  const names = raw
    .split(";")
    .map((p) => p.split("=")[0]?.trim() ?? "")
    .filter((n) => n !== "");
  return [...new Set(names)].sort();
}

export async function scanDevice(host: DeviceHost, now: Date): Promise<DeviceScan> {
  const caches = await list(host.caches === undefined ? undefined : () => host.caches!.keys());
  const dbs = await list(host.indexedDB?.databases === undefined ? undefined : () => host.indexedDB!.databases!());
  let cookies: string[] | null = null;
  try {
    if (host.document !== undefined && typeof host.document.cookie === "string") cookies = cookieNames(host.document.cookie);
  } catch {
    cookies = null;
  }
  return {
    at: now.toISOString(),
    caches: caches === null ? null : [...caches].sort(),
    databases: dbs === null ? null : [...new Set(dbs.map((d) => d.name ?? "").filter((n) => n !== ""))].sort(),
    cookies,
  };
}

export interface ClearOptions {
  /** Only caches whose name starts with this are removed. Required: there is no "remove everything". */
  cachePrefix?: string;
  /** Only databases whose name starts with this are removed. */
  dbPrefix?: string;
}

export interface ClearResult {
  caches: number;
  databases: number;
  failed: string[];
}

function deleteDb(host: DeviceHost, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const req = host.indexedDB!.deleteDatabase(name);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** An empty prefix would match everything, so it is refused like a missing one. */
export async function clearDevice(host: DeviceHost, scan: DeviceScan, o: ClearOptions): Promise<ClearResult> {
  const out: ClearResult = { caches: 0, databases: 0, failed: [] };
  if (o.cachePrefix !== undefined && o.cachePrefix !== "" && host.caches !== undefined) {
    for (const name of scan.caches ?? []) {
      if (!name.startsWith(o.cachePrefix)) continue;
      let ok = false;
      try {
        ok = await host.caches.delete(name);
      } catch {
        ok = false;
      }
      if (ok) out.caches += 1;
      else out.failed.push(`cache:${name}`);
    }
  }
  if (o.dbPrefix !== undefined && o.dbPrefix !== "" && host.indexedDB !== undefined) {
    for (const name of scan.databases ?? []) {
      if (!name.startsWith(o.dbPrefix)) continue;
      if (await deleteDb(host, name)) out.databases += 1;
      else out.failed.push(`db:${name}`);
    }
  }
  return out;
}

/** Names that would be removed, for the confirmation text. */
export function removable(scan: DeviceScan, o: ClearOptions): { caches: string[]; databases: string[] } {
  const pick = (names: string[] | null, prefix: string | undefined): string[] =>
    prefix === undefined || prefix === "" ? [] : (names ?? []).filter((n) => n.startsWith(prefix));
  return { caches: pick(scan.caches, o.cachePrefix), databases: pick(scan.databases, o.dbPrefix) };
}
