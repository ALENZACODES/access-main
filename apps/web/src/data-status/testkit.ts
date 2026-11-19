/** Test helpers shared by the panel, page and bootstrap tests (not exported from index.ts). */
import { auditHtml, describeProblems, type CacheLike, type CacheStorageLike, type DatasetRecord, type HeadersLike, type PanelHost, type ResponseLike, type StorageLike } from './index';

export class FakeHost implements PanelHost {
  innerHTML = '';
  attrs: Record<string, string> = {};
  listeners: Record<'click' | 'change' | 'input', ((ev: unknown) => void)[]> = { click: [], change: [], input: [] };
  region = { innerHTML: '' };
  announce = { innerHTML: '' };
  constructor(private readonly withRegion = true) {}

  setAttribute(n: string, v: string) {
    this.attrs[n] = v;
  }
  addEventListener(type: 'click' | 'change' | 'input', l: (ev: unknown) => void) {
    this.listeners[type].push(l);
  }
  removeEventListener(type: 'click' | 'change' | 'input', l: (ev: unknown) => void) {
    this.listeners[type] = this.listeners[type].filter((x) => x !== l);
  }
  querySelector(sel: string) {
    if (!this.withRegion) return null;
    if (sel === '[data-region="sources"]') return this.region;
    if (sel === '[data-region="announce"]') return this.announce;
    return null;
  }
  fire(type: 'click' | 'change' | 'input', ev: unknown) {
    for (const l of [...this.listeners[type]]) l(ev);
  }
  click(action: string) {
    this.fire('click', { target: { closest: () => ({ getAttribute: () => action }) } });
  }
  filter(type: 'change' | 'input', key: string, value: string, checked = false) {
    this.fire(type, { target: { getAttribute: (n: string) => (n === 'data-filter' ? key : null), value, checked } });
  }
  get listenerCount() {
    return this.listeners.click.length + this.listeners.change.length + this.listeners.input.length;
  }
}

export function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

export const NOW = new Date('2026-11-15T12:00:00Z');

export const RECORDS: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places <A>',
    kind: 'places',
    sources: [
      { id: 'a', name: 'Alpha', source: 'Publisher A', licence: 'OGL-Ontario', retrievedAt: '2026-11-01', url: 'https://example.org/a', tier: 0 },
      { id: 'b', name: 'Beta', source: 'Publisher B', licence: 'Proprietary', retrievedAt: '2024-01-01', tier: 'E' },
    ],
  },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [{ id: 'c' }] },
];

/** 44px target problems only (see htmlAudit for the full rule set). */
export function targetsBelow44(html: string): string[] {
  return auditHtml(html).filter((p) => p.code === 'small-target').map((p) => p.detail);
}

/** Every other markup problem: ids, labels, captions, headers, scroll regions, time elements. */
export function structureProblems(html: string): string[] {
  return describeProblems(auditHtml(html).filter((p) => p.code !== 'small-target'));
}

export class FakeHeaders implements HeadersLike {
  private readonly map = new Map<string, string>();
  constructor(init: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(init)) this.map.set(k.toLowerCase(), v);
  }
  get(name: string): string | null {
    return this.map.get(name.toLowerCase()) ?? null;
  }
}

export class FakeResponse implements ResponseLike {
  readonly headers: FakeHeaders;
  constructor(
    readonly body: string,
    readonly status = 200,
    headers: Record<string, string> = {},
  ) {
    this.headers = new FakeHeaders(headers);
  }
  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }
  clone(): FakeResponse {
    return this;
  }
}

export class FakeCache implements CacheLike {
  readonly entries = new Map<string, ResponseLike>();
  failPut = false;
  async match(key: string) {
    return this.entries.get(key);
  }
  async put(key: string, res: ResponseLike) {
    if (this.failPut) throw new Error('quota');
    this.entries.set(key, res);
  }
}

export class FakeCacheStorage implements CacheStorageLike {
  readonly caches = new Map<string, FakeCache>();
  async open(name: string) {
    let c = this.caches.get(name);
    if (!c) this.caches.set(name, (c = new FakeCache()));
    return c;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
}
