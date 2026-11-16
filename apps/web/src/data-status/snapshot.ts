/**
 * Offline saved copy of the registry. The checksum only detects accidental corruption
 * (it is not a security feature and does not vouch for the data's content).
 */
import { parseIsoDate } from './dataStatus';
import type { DatasetRecord } from './datasetRegistry';
import { isDatasetKind } from './freshnessPolicy';

export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_KEY = 'data-status:snapshot:v1';

export interface Snapshot {
  version: typeof SNAPSHOT_VERSION;
  savedAt: string;
  records: DatasetRecord[];
  checksum: string;
}

export type SnapshotFailure = 'not-json' | 'bad-shape' | 'bad-version' | 'bad-date' | 'checksum-mismatch';
export type ParseResult = { ok: true; snapshot: Snapshot } | { ok: false; reason: SnapshotFailure };

export function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .filter((k) => o[k] !== undefined)
        .map((k) => [k, canon(o[k])]),
    );
  }
  return v;
}

function checksumOf(records: unknown, savedAt: string): string {
  return fnv1a32(`${JSON.stringify(canon(records))}|${savedAt}`);
}

export function createSnapshot(records: readonly DatasetRecord[], savedAt: Date): Snapshot {
  const iso = savedAt.toISOString();
  const copy = JSON.parse(JSON.stringify(records)) as DatasetRecord[];
  return { version: SNAPSHOT_VERSION, savedAt: iso, records: copy, checksum: checksumOf(copy, iso) };
}

export function serializeSnapshot(s: Snapshot): string {
  return JSON.stringify(s);
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const optStr = (v: unknown) => v === undefined || v === null || typeof v === 'string';

function validSource(v: unknown): boolean {
  return (
    isObj(v) &&
    typeof v['id'] === 'string' &&
    optStr(v['name']) &&
    optStr(v['url']) &&
    optStr(v['source']) &&
    optStr(v['licence']) &&
    optStr(v['retrievedAt'])
  );
}

function validRecord(v: unknown): boolean {
  return (
    isObj(v) &&
    typeof v['id'] === 'string' &&
    typeof v['name'] === 'string' &&
    isDatasetKind(v['kind']) &&
    Array.isArray(v['sources']) &&
    v['sources'].every(validSource)
  );
}

export function parseSnapshot(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (!isObj(raw)) return { ok: false, reason: 'bad-shape' };
  if (raw['version'] !== SNAPSHOT_VERSION) return { ok: false, reason: 'bad-version' };
  if (typeof raw['savedAt'] !== 'string' || typeof raw['checksum'] !== 'string' || !Array.isArray(raw['records'])) {
    return { ok: false, reason: 'bad-shape' };
  }
  if (!raw['records'].every(validRecord)) return { ok: false, reason: 'bad-shape' };
  if (parseIsoDate(raw['savedAt']) === null) return { ok: false, reason: 'bad-date' };
  if (checksumOf(raw['records'], raw['savedAt']) !== raw['checksum']) return { ok: false, reason: 'checksum-mismatch' };
  return { ok: true, snapshot: raw as unknown as Snapshot };
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type LoadResult = ParseResult | { ok: false; reason: 'empty' | 'storage-unavailable' };

export interface SnapshotStore {
  load(): LoadResult;
  save(snapshot: Snapshot): boolean;
  clear(): void;
}

/** Browser storage can be missing, full or blocked; every call is guarded. */
export function createSnapshotStore(storage: StorageLike | null | undefined, key: string = SNAPSHOT_KEY): SnapshotStore {
  return {
    load() {
      if (!storage) return { ok: false, reason: 'storage-unavailable' };
      try {
        const text = storage.getItem(key);
        return text === null ? { ok: false, reason: 'empty' } : parseSnapshot(text);
      } catch {
        return { ok: false, reason: 'storage-unavailable' };
      }
    },
    save(snapshot) {
      if (!storage) return false;
      try {
        storage.setItem(key, serializeSnapshot(snapshot));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      try {
        storage?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}
