/** Test helpers shared by the panel, page and bootstrap tests (not exported from index.ts). */
import type { DatasetRecord, PanelHost, StorageLike } from './index';

export class FakeHost implements PanelHost {
  innerHTML = '';
  attrs: Record<string, string> = {};
  listeners: Record<'click' | 'change' | 'input', ((ev: unknown) => void)[]> = { click: [], change: [], input: [] };
  region = { innerHTML: '' };
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
    return this.withRegion && sel === '[data-region="sources"]' ? this.region : null;
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
      { id: 'a', name: 'Alpha', source: 'Publisher A', licence: 'OGL-Ontario', retrievedAt: '2026-11-01', url: 'https://example.org/a' },
      { id: 'b', name: 'Beta', source: 'Publisher B', licence: 'Proprietary', retrievedAt: '2024-01-01' },
    ],
  },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [{ id: 'c' }] },
];

/** Tags a keyboard or touch user can operate; each needs a 44px target (checkbox is sized by its label). */
export function targetsBelow44(html: string): string[] {
  const bad: string[] = [];
  for (const m of html.matchAll(/<(a|button|select|input)\b[^>]*>/g)) {
    const tag = m[0];
    if (tag.includes('class="ds-skip"') || tag.includes('type="checkbox"')) continue;
    if (!tag.includes('min-height:44px')) bad.push(tag);
  }
  return bad;
}

/** Duplicate ids, unlabeled form controls, captionless tables, unscoped headers. */
export function structureProblems(html: string): string[] {
  const out: string[] = [];
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1] as string);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) out.push(`duplicate id: ${id}`);
    seen.add(id);
  }
  for (const m of html.matchAll(/<(select|input)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const id = m[2] as string;
    const labelled = html.includes(`for="${id}"`) || new RegExp(`<label[^>]*>\\s*<input[^>]*id="${id}"`).test(html);
    if (!labelled) out.push(`unlabelled control: ${id}`);
  }
  const tables = (html.match(/<table\b/g) ?? []).length;
  const captions = (html.match(/<caption>/g) ?? []).length;
  if (tables !== captions) out.push(`tables without caption: ${tables - captions}`);
  for (const m of html.matchAll(/<th(?=[\s>])(?![^>]*scope=)[^>]*>/g)) out.push(`th without scope: ${m[0]}`);
  for (const m of html.matchAll(/<div class="ds-scroll"[^>]*>/g)) {
    if (!m[0].includes('tabindex="0"') || !m[0].includes('aria-label=') || !m[0].includes('role="region"')) out.push(`scroll region not operable: ${m[0]}`);
  }
  for (const m of html.matchAll(/<time\b[^>]*>/g)) {
    if (!/datetime="\d{4}-\d{2}-\d{2}"/.test(m[0])) out.push(`bad time element: ${m[0]}`);
  }
  return out;
}
