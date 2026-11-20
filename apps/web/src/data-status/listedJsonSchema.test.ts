import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { GAP_FIELDS, NO_FILTERS, type Filters } from './filters';
import { handleDataStatus } from './http';
import { buildListedJson, listedJsonText, type ListedJson, type ListedJsonSource } from './listedJson';
import {
  isRealIsoDay,
  LISTED_DOC_KEYS,
  LISTED_JSON_SCHEMA,
  LISTED_SCHEMA_ROUTE,
  LISTED_SOURCE_KEYS,
  listedJsonSchemaText,
  readListedJson,
  validateListedJson,
} from './listedJsonSchema';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { parseSort } from './sorting';
import { NOW } from './testkit';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', url: `https://example.org/${id}`, licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const RECORDS: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [src('a'), src('b', { tier: 'E', retrievedAt: isoDayOffset(NOW, -400), licence: 'Proprietary' }), src('bare', { name: null, source: null, url: null, licence: null, retrievedAt: null, tier: null }), src('future', { retrievedAt: isoDayOffset(NOW, 30) })],
  },
];
const audit = auditRegistry(RECORDS, NOW, {});
const good = (f: Filters = NO_FILTERS): ListedJson => buildListedJson(audit, f, NOW, 'en');
/** A deep copy with one change made to it. */
const changed = (edit: (doc: { [k: string]: unknown; sources: { [k: string]: unknown }[] }) => void): unknown => {
  const doc = JSON.parse(JSON.stringify(good())) as { [k: string]: unknown; sources: { [k: string]: unknown }[] };
  edit(doc);
  return doc;
};
const fresh = (doc: { sources: { [k: string]: unknown }[] }) => doc.sources.find((s) => s['sourceId'] === 'a')!;
const bare = (doc: { sources: { [k: string]: unknown }[] }) => doc.sources.find((s) => s['sourceId'] === 'bare')!;

describe('what the panel writes passes its own check', () => {
  it('for the whole list, a filtered list and an empty list, in both languages and any order', () => {
    for (const f of [NO_FILTERS, { ...NO_FILTERS, state: 'stale' as const }, { ...NO_FILTERS, tier: 'unknown' as const }, { ...NO_FILTERS, query: 'no such name' }]) {
      for (const locale of ['en', 'fr'] as const) {
        for (const sort of [null, parseSort('?sort=tier&dir=desc')]) expect(validateListedJson(buildListedJson(audit, f, NOW, locale, sort)), JSON.stringify(f)).toEqual([]);
      }
    }
  });
  it('on random registries', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const doc = buildListedJson(a, NO_FILTERS, NOW, seed % 2 === 0 ? 'en' : 'fr');
      expect(validateListedJson(doc), `seed ${seed}`).toEqual([]);
      expect(readListedJson(listedJsonText(doc)), `seed ${seed}`).toMatchObject({ ok: true, problems: [] });
    }
  });
  it('and what the server sends does too', async () => {
    const res = await handleDataStatus({ method: 'GET', url: '/fr/data-status/listed-sources.json?gap=tier&sort=source', headers: {} }, { getRecords: () => RECORDS, now: () => NOW });
    expect(readListedJson(res!.body)).toMatchObject({ ok: true, problems: [] });
  });
});

describe('the schema and the checker describe the same file', () => {
  it('lists the same properties, all required, and allows no other', () => {
    expect(Object.keys(LISTED_JSON_SCHEMA.properties)).toEqual([...LISTED_DOC_KEYS]);
    expect([...LISTED_JSON_SCHEMA.required]).toEqual([...LISTED_DOC_KEYS]);
    const item = LISTED_JSON_SCHEMA.properties.sources.items;
    expect(Object.keys(item.properties).sort()).toEqual([...LISTED_SOURCE_KEYS].sort());
    expect([...item.required].sort()).toEqual([...LISTED_SOURCE_KEYS].sort());
    expect(LISTED_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(item.additionalProperties).toBe(false);
  });
  it('matches the keys the panel really writes', () => {
    const doc = good();
    expect(Object.keys(doc)).toEqual([...LISTED_DOC_KEYS]);
    for (const s of doc.sources) expect(Object.keys(s).sort()).toEqual([...LISTED_SOURCE_KEYS].sort());
  });
  it('names the token and the facts it allows', () => {
    const item = LISTED_JSON_SCHEMA.properties.sources.items.properties;
    expect(LISTED_JSON_SCHEMA.properties.unknownToken.const).toBe('UNKNOWN');
    expect([...item.unknownFacts.items.enum]).toEqual([...GAP_FIELDS]);
    expect(item.tier.enum).toContain('UNKNOWN');
    expect(item.tier.enum).toContain('E');
    expect(item.status.enum).not.toContain('unknown');
  });
  it('is served as JSON, the same in both languages, and is itself valid JSON with a final new line', async () => {
    const ctx = { getRecords: () => RECORDS, now: () => NOW };
    const en = await handleDataStatus({ method: 'GET', url: `/en/data-status${LISTED_SCHEMA_ROUTE}`, headers: {} }, ctx);
    const fr = await handleDataStatus({ method: 'GET', url: `/fr/data-status${LISTED_SCHEMA_ROUTE}?state=stale`, headers: {} }, ctx);
    expect(en?.status).toBe(200);
    expect(en?.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(en?.body).toBe(listedJsonSchemaText());
    expect(fr?.body).toBe(en?.body);
    expect(JSON.parse(listedJsonSchemaText())).toEqual(JSON.parse(JSON.stringify(LISTED_JSON_SCHEMA)));
    expect(listedJsonSchemaText().endsWith('}\n')).toBe(true);
  });
});

describe('isRealIsoDay', () => {
  it('accepts days of the calendar only', () => {
    for (const ok of ['2026-11-15', '2024-02-29', '1999-12-31']) expect(isRealIsoDay(ok), ok).toBe(true);
    for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-1-1', '2026-11-15T00:00:00Z', '', 'UNKNOWN', null, 20261115]) expect(isRealIsoDay(bad), String(bad)).toBe(false);
  });
});

describe('what the checker catches', () => {
  const problems = (edit: Parameters<typeof changed>[0]) => validateListedJson(changed(edit));
  it('something that is not a file at all', () => {
    for (const v of [null, undefined, 3, 'text', [], true]) expect(validateListedJson(v)).toEqual(['file: not an object']);
    expect(validateListedJson({})).toEqual(expect.arrayContaining(['file: "version" is missing', 'file: "sources" is missing', 'file.sources: not a list']));
    expect(readListedJson('{not json')).toEqual({ ok: false, problems: ['file: not JSON'] });
    expect(readListedJson(`\uFEFF${listedJsonText(good())}`).ok).toBe(true);
  });
  it('a missing or an extra property', () => {
    expect(problems((d) => delete d['locale'])).toEqual(expect.arrayContaining(['file: "locale" is missing']));
    expect(problems((d) => (d['extra'] = 1))).toEqual(['file: "extra" is not part of the file']);
    expect(problems((d) => delete fresh(d)['tier'])).toEqual(expect.arrayContaining([expect.stringMatching(/^sources\[\d\]: "tier" is missing$/)]));
    expect(problems((d) => (fresh(d)['note'] = 'x'))).toEqual([expect.stringMatching(/^sources\[\d\]: "note" is not part of the file$/)]);
  });
  it('a header that does not describe the list', () => {
    expect(problems((d) => (d['version'] = 2))).toEqual(['file.version: expected 1']);
    expect(problems((d) => (d['generatedAt'] = '2026-11-15'))).toEqual(['file.generatedAt: not a time in ISO form']);
    expect(problems((d) => (d['locale'] = 'de'))).toEqual(['file.locale: not en or fr']);
    expect(problems((d) => (d['unknownToken'] = 'Unknown'))).toEqual(['file.unknownToken: expected UNKNOWN']);
    expect(problems((d) => (d['filters'] = 'state=stale'))).toEqual(['file.filters: not a query string']);
    expect(problems((d) => (d['filters'] = '?'))).toEqual(['file.filters: not a query string']);
    expect(problems((d) => (d['listed'] = 3))).toEqual(['file: "listed" says 3 but the list holds 4']);
    expect(problems((d) => (d['total'] = 2))).toEqual(['file: more sources listed than there are in all']);
    expect(problems((d) => (d['total'] = -1))).toEqual(expect.arrayContaining(['file.total: not a count']));
    expect(problems((d) => (d['sources'] = {} as never))).toEqual(['file.sources: not a list']);
    expect(problems((d) => (d.sources[0] = 'x' as never))).toEqual(['sources[0]: not an object']);
  });
  it('a missing value written any other way than the token', () => {
    for (const word of ['Unknown', 'unknown', 'Inconnu', 'inconnue', 'N/A', 'n/a', 'TBD', 'null', ' unknown ']) {
      const out = problems((d) => (bare(d)['licence'] = word));
      expect(out, word).toEqual([expect.stringMatching(/\.licence: a missing value must be written UNKNOWN, not "/)]);
    }
    expect(problems((d) => (bare(d)['licence'] = ''))).toEqual([expect.stringMatching(/\.licence: empty$/)]);
    expect(problems((d) => (bare(d)['page'] = '   '))).toEqual([expect.stringMatching(/\.page: empty$/)]);
    expect(problems((d) => (fresh(d)['source'] = 'Unknown Heights Transit'))).toEqual([]);
  });
  it('a value of the wrong kind', () => {
    expect(problems((d) => (fresh(d)['tier'] = 0))).toEqual(expect.arrayContaining([expect.stringMatching(/\.tier: not text$/)]));
    expect(problems((d) => (fresh(d)['tier'] = '9'))).toEqual([expect.stringMatching(/\.tier: not a tier$/)]);
    expect(problems((d) => (fresh(d)['licenceType'] = 'closed'))).toEqual([expect.stringMatching(/\.licenceType: not a licence type$/)]);
    expect(problems((d) => (fresh(d)['status'] = 'ok'))).toEqual([expect.stringMatching(/\.status: not a status$/)]);
    expect(problems((d) => (fresh(d)['retrieved'] = '2026-02-30'))).toEqual([expect.stringMatching(/\.retrieved: not a day of the calendar/)]);
    expect(problems((d) => (fresh(d)['ageDays'] = 1.5))).toEqual([expect.stringMatching(/\.ageDays: not a whole number of days, and not null$/)]);
    expect(problems((d) => (fresh(d)['ageDays'] = -1))).toEqual([expect.stringMatching(/\.ageDays: /)]);
    expect(problems((d) => (fresh(d)['daysUntilReview'] = '177'))).toEqual(expect.arrayContaining([expect.stringMatching(/\.daysUntilReview: not a whole number/)]));
    expect(problems((d) => (fresh(d)['unknownFacts'] = 'tier'))).toEqual([expect.stringMatching(/\.unknownFacts: not a list$/)]);
    expect(problems((d) => (fresh(d)['unknownFacts'] = ['name']))).toEqual([expect.stringMatching(/\.unknownFacts: holds something that is not one of/)]);
    expect(problems((d) => (bare(d)['unknownFacts'] = [...(bare(d)['unknownFacts'] as string[]), 'tier']))).toEqual([expect.stringMatching(/\.unknownFacts: the same fact twice$/)]);
  });
  it('facts of one source that disagree with each other', () => {
    expect(problems((d) => (fresh(d)['tier'] = 'UNKNOWN'))).toEqual([expect.stringMatching(/: the tier and the list of unknown facts disagree$/)]);
    expect(problems((d) => (fresh(d)['unknownFacts'] = ['tier']))).toEqual([expect.stringMatching(/: the tier and the list of unknown facts disagree$/)]);
    expect(problems((d) => (fresh(d)['reviewDate'] = 'UNKNOWN'))).toEqual([expect.stringMatching(/: the review date and the days until review disagree$/)]);
    expect(problems((d) => (fresh(d)['daysUntilReview'] = null))).toEqual([expect.stringMatching(/: the review date and the days until review disagree$/)]);
    expect(problems((d) => (bare(d)['retrieved'] = '2026-11-01'))).toEqual([expect.stringMatching(/: the status is UNKNOWN but a retrieved date or an age is given$/)]);
    expect(problems((d) => (bare(d)['ageDays'] = 4))).toEqual([expect.stringMatching(/: the status is UNKNOWN but a retrieved date or an age is given$/)]);
    expect(problems((d) => (fresh(d)['ageDays'] = null))).toEqual([expect.stringMatching(/: the status is known but the retrieved date or the age is not$/)]);
    expect(problems((d) => (fresh(d)['status'] = 'stale'))).toEqual([expect.stringMatching(/: marked possibly out of date but the review date has not passed$/)]);
    expect(problems((d) => (fresh(d)['daysUntilReview'] = -3))).toEqual([expect.stringMatching(/: marked within its review period but the review date has passed$/)]);
  });
  it('several problems at once, each said once, and never by throwing', () => {
    const out = problems((d) => {
      d['version'] = 7;
      fresh(d)['tier'] = '9';
      bare(d)['licence'] = 'Unknown';
    });
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
    const hostile = { version: 1, generatedAt: {}, locale: [], unknownToken: null, filters: 5, total: '4', listed: NaN, sources: [null, 3, [], { tier: {}, unknownFacts: [{}], ageDays: 'x' }] };
    expect(() => validateListedJson(hostile)).not.toThrow();
    expect(validateListedJson(hostile).length).toBeGreaterThan(8);
  });
  it('does not change what it is given', () => {
    const doc = good();
    const before = JSON.stringify(doc);
    validateListedJson(doc);
    expect(JSON.stringify(doc)).toBe(before);
    const source: ListedJsonSource = doc.sources[0]!;
    expect(Object.isFrozen(source)).toBe(false);
  });
});
