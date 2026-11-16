import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_KEY,
  createSnapshot,
  createSnapshotStore,
  fnv1a32,
  parseSnapshot,
  serializeSnapshot,
  type DatasetRecord,
  type StorageLike,
} from './index';

const SAVED = new Date('2026-11-15T12:00:00Z');
const records: DatasetRecord[] = [
  { id: 'd', name: 'D', kind: 'places', sources: [{ id: 's', licence: 'CC0-1.0', retrievedAt: '2026-11-01' }] },
];

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('fnv1a32', () => {
  it('matches known vectors', () => {
    expect(fnv1a32('')).toBe('811c9dc5');
    expect(fnv1a32('a')).toBe('e40c292c');
    expect(fnv1a32('foobar')).toBe('bf9cf968');
  });
});

describe('snapshot round trip', () => {
  it('serialises and parses back identical records', () => {
    const snap = createSnapshot(records, SAVED);
    const parsed = parseSnapshot(serializeSnapshot(snap));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.snapshot.records).toEqual(records);
      expect(parsed.snapshot.savedAt).toBe('2026-11-15T12:00:00.000Z');
    }
  });

  it('does not alias the caller’s records', () => {
    const snap = createSnapshot(records, SAVED);
    expect(snap.records).not.toBe(records);
  });

  it('is independent of key order', () => {
    const snap = createSnapshot(records, SAVED);
    const reordered = JSON.stringify({ checksum: snap.checksum, records: snap.records, savedAt: snap.savedAt, version: 1 });
    expect(parseSnapshot(reordered).ok).toBe(true);
  });
});

interface SnapshotJson {
  records: { kind: string; name: string; sources: { licence: unknown }[] }[];
  [key: string]: unknown;
}

describe('parseSnapshot failures', () => {
  const good = () => JSON.parse(serializeSnapshot(createSnapshot(records, SAVED))) as SnapshotJson;

  it('rejects non-JSON, wrong shapes and versions', () => {
    expect(parseSnapshot('{')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseSnapshot('[]')).toEqual({ ok: false, reason: 'bad-shape' });
    expect(parseSnapshot('null')).toEqual({ ok: false, reason: 'bad-shape' });
    expect(parseSnapshot(JSON.stringify({ ...good(), version: 2 }))).toEqual({ ok: false, reason: 'bad-version' });
    expect(parseSnapshot(JSON.stringify({ ...good(), records: 'x' }))).toEqual({ ok: false, reason: 'bad-shape' });
  });

  it('rejects invalid records', () => {
    const g = good();
    g.records[0]!.kind = 'medical';
    expect(parseSnapshot(JSON.stringify(g))).toEqual({ ok: false, reason: 'bad-shape' });
    const h = good();
    h.records[0]!.sources[0]!.licence = 42;
    expect(parseSnapshot(JSON.stringify(h))).toEqual({ ok: false, reason: 'bad-shape' });
  });

  it('rejects bad dates and tampered content', () => {
    expect(parseSnapshot(JSON.stringify({ ...good(), savedAt: 'yesterday' }))).toEqual({ ok: false, reason: 'bad-date' });
    const g = good();
    g.records[0]!.name = 'Changed';
    expect(parseSnapshot(JSON.stringify(g))).toEqual({ ok: false, reason: 'checksum-mismatch' });
  });
});

describe('createSnapshotStore', () => {
  it('saves, loads and clears', () => {
    const storage = memoryStorage();
    const store = createSnapshotStore(storage);
    expect(store.load()).toEqual({ ok: false, reason: 'empty' });
    expect(store.save(createSnapshot(records, SAVED))).toBe(true);
    expect(storage.map.has(SNAPSHOT_KEY)).toBe(true);
    expect(store.load().ok).toBe(true);
    store.clear();
    expect(store.load()).toEqual({ ok: false, reason: 'empty' });
  });

  it('reports a corrupted saved copy instead of throwing', () => {
    const storage = memoryStorage();
    storage.setItem(SNAPSHOT_KEY, '{"version":1');
    expect(createSnapshotStore(storage).load()).toEqual({ ok: false, reason: 'not-json' });
  });

  it('survives missing or throwing storage', () => {
    const none = createSnapshotStore(null);
    expect(none.load()).toEqual({ ok: false, reason: 'storage-unavailable' });
    expect(none.save(createSnapshot(records, SAVED))).toBe(false);
    const boom: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createSnapshotStore(boom);
    expect(store.load()).toEqual({ ok: false, reason: 'storage-unavailable' });
    expect(store.save(createSnapshot(records, SAVED))).toBe(false);
    expect(() => store.clear()).not.toThrow();
  });
});
