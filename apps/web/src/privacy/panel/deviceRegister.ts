// What the App's code keeps in Cache Storage and IndexedDB, name by name. localStorage has its own list in
// storageRegister.ts; this one covers the other two places a page can keep files and records. The scan in
// audit/deviceStorageScan.ts fails CI when the source names a cache or a database that has no row here, and
// when a row names something the source no longer does. The panel reads the same rows to say, in plain words,
// what each name found on this device is, and to say plainly when a name is not in the list. Nothing here is
// read from a person's device, and a name that matches no row is shown as unknown, never guessed.

import type { Bilingual } from "./inventory";
import type { ClearOptions } from "./deviceStorage";

export type DeviceKind = "cache" | "database";

export interface DeviceRow {
  kind: DeviceKind;
  /** The whole name, or the start of every name the code builds with this prefix */
  name: string;
  /** "exact": the code uses this one name. "prefix": the code adds a version after `name`, for example `data-status-v3`. */
  match: "exact" | "prefix";
  /** Repo-relative path of the file that names it */
  path: string;
  /** What it holds, in plain words */
  holds: Bilingual;
  /** Where the statement came from */
  source: string;
  /** YYYY-MM-DD */
  recordedOn: string;
}

const REVIEWED = "2026-11-19";
const SOURCE = "Read from the source file named in the row";

export const DEVICE_REGISTER: readonly DeviceRow[] = [
  { kind: "cache", name: "map-tiles-v2", match: "exact", path: "apps/web/src/map/tileCache.ts", holds: { en: "Map tiles saved for offline use", fr: "Des tuiles de carte enregistrées pour l’usage hors ligne" }, source: SOURCE, recordedOn: REVIEWED },
  { kind: "cache", name: "map-tile-list-v1", match: "exact", path: "apps/web/src/map/tileCache.ts", holds: { en: "The list of map tiles saved for offline use", fr: "La liste des tuiles de carte enregistrées pour l’usage hors ligne" }, source: SOURCE, recordedOn: REVIEWED },
  { kind: "cache", name: "data-status-", match: "prefix", path: "apps/web/src/data-status/offline.ts", holds: { en: "Copies of data status pages and files, kept so they open without a connection", fr: "Des copies des pages et des fichiers sur l’état des données, gardées pour s’ouvrir sans connexion" }, source: SOURCE, recordedOn: REVIEWED },
  { kind: "cache", name: "app-shell-", match: "prefix", path: "apps/web/src/states/serviceWorker.ts", holds: { en: "Copies of App pages, kept so they open without a connection", fr: "Des copies des pages de l’App, gardées pour s’ouvrir sans connexion" }, source: SOURCE, recordedOn: REVIEWED },
  { kind: "database", name: "app-offline-regions", match: "exact", path: "apps/web/src/offline/robust/indexedCellStore.ts", holds: { en: "Offline region data you downloaded", fr: "Les données de région hors ligne que vous avez téléchargées" }, source: SOURCE, recordedOn: REVIEWED },
];

export function rowMatches(row: DeviceRow, kind: DeviceKind, name: string): boolean {
  if (row.kind !== kind) return false;
  return row.match === "exact" ? name === row.name : name.length > row.name.length && name.startsWith(row.name);
}

/** The row that describes a name found on a device, or null when none does. An exact row wins over a prefix row. */
export function findRow(register: readonly DeviceRow[], kind: DeviceKind, name: string): DeviceRow | null {
  const hits = register.filter((r) => rowMatches(r, kind, name));
  return hits.find((r) => r.match === "exact") ?? hits[0] ?? null;
}

export interface DescribedName {
  name: string;
  /** null: the name is not in the register, so what it holds is unknown */
  row: DeviceRow | null;
  /** True when the clear button, with the prefixes it was given, would remove this name */
  clearable: boolean;
}

export interface DescribedDevice {
  /** null when the browser did not answer (Unknown), never an empty list */
  caches: DescribedName[] | null;
  databases: DescribedName[] | null;
}

function clears(kind: DeviceKind, name: string, o: ClearOptions): boolean {
  const prefix = kind === "cache" ? o.cachePrefix : o.dbPrefix;
  return prefix !== undefined && prefix !== "" && name.startsWith(prefix);
}

function describe(kind: DeviceKind, names: readonly string[] | null, register: readonly DeviceRow[], o: ClearOptions): DescribedName[] | null {
  if (names === null) return null;
  return names.map((name) => ({ name, row: findRow(register, kind, name), clearable: clears(kind, name, o) }));
}

/** Pairs each cache and database name found on the device with its register row. The scan's order is kept. */
export function describeDevice(scan: { caches: readonly string[] | null; databases: readonly string[] | null }, register: readonly DeviceRow[], o: ClearOptions = {}): DescribedDevice {
  return { caches: describe("cache", scan.caches, register, o), databases: describe("database", scan.databases, register, o) };
}

/**
 * Rows whose names the clear button would not remove. A row is reached only when every name it can
 * produce starts with the prefix the button was given, so a longer or shorter prefix is not guessed at.
 */
export function notReached(register: readonly DeviceRow[], o: ClearOptions): DeviceRow[] {
  return register.filter((r) => {
    const prefix = r.kind === "cache" ? o.cachePrefix : o.dbPrefix;
    return prefix === undefined || prefix === "" || !r.name.startsWith(prefix);
  });
}

/** Problems that do not depend on the source: repeated rows, bad dates, blank text, names that could match too much. */
export function checkDeviceRegister(register: readonly DeviceRow[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const r of register) {
    const id = `${r.kind}:${r.name}`;
    if (seen.has(id)) problems.push(`${id}: listed twice`);
    seen.add(id);
    if (!/^[a-z][a-z0-9-]{2,63}$/.test(r.name)) problems.push(`${id}: not a plain lower-case name`);
    if (r.match === "prefix" && !r.name.endsWith("-")) problems.push(`${id}: a prefix row must end with a hyphen, so it cannot match a longer unrelated name`);
    if (r.match === "exact" && r.name.endsWith("-")) problems.push(`${id}: an exact row cannot end with a hyphen`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.recordedOn)) problems.push(`${id}: recordedOn is not YYYY-MM-DD`);
    if (r.holds.en.trim() === "" || r.holds.fr.trim() === "") problems.push(`${id}: holds is empty in one language`);
    if (r.source.trim() === "") problems.push(`${id}: source is empty`);
    if (r.path.trim() === "") problems.push(`${id}: path is empty`);
  }
  for (const a of register) {
    for (const b of register) {
      if (a !== b && a.kind === b.kind && a.match === "prefix" && b.name !== a.name && b.name.startsWith(a.name)) {
        problems.push(`${a.kind}:${b.name}: starts with the prefix row ${a.name}, so a name could match both`);
      }
    }
  }
  return problems;
}
