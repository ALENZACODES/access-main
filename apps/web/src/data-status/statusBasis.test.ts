import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { basisCode, daysText, explainSource, explainStatus, limitsInUse, renderBasisHtml, ruleText } from './statusBasis';
import { lintFrench, t, type MessageKey } from './i18n';
import { visibleText } from './copyLint';
import { randomRecords } from './fuzzKit';

const NOW = new Date('2026-11-16T12:00:00Z');
const base = { id: 's', name: 'Src', source: 'Pub', licence: 'OGL-Ontario', url: 'https://example.org' };

function one(retrievedAt: string | null, kind: DatasetRecord['kind'] = 'places') {
  const audit = auditRegistry([{ id: 'd', name: 'D', kind, sources: [{ ...base, retrievedAt }] }], NOW);
  return audit.sources[0]!;
}

describe('daysText', () => {
  it.each([
    ['en', 0, '0 days'],
    ['en', 1, '1 day'],
    ['en', 2, '2 days'],
    ['en', 180, '180 days'],
    ['fr', 0, '0 jour'],
    ['fr', 1, '1 jour'],
    ['fr', 2, '2 jours'],
  ] as const)('%s %i', (l, n, text) => expect(daysText(l, n)).toBe(text));
});

describe('explainSource: every status states its reason', () => {
  it('fresh names the date, the age, the limit and the type', () => {
    const e = explainSource(one('2026-11-01'), 'en');
    expect(e.code).toBe('fresh');
    expect(e.text).toBe('Retrieved November 1, 2026, 15 days ago. Within the 180 days limit for Places.');
  });

  it('stale says it is past the limit and by what limit', () => {
    const e = explainSource(one('2026-05-01'), 'en');
    expect(e.code).toBe('stale');
    expect(e.text).toBe('Retrieved May 1, 2026, 199 days ago. Past the 180 days limit for Places.');
  });

  it('uses the limit of the dataset type, not a fixed number', () => {
    expect(explainSource(one('2026-09-01', 'transit'), 'en').text).toContain('Past the 60 days limit for Transit');
    expect(explainSource(one('2026-09-01', 'boundaries'), 'en').text).toContain('Within the 730 days limit for Boundaries');
  });

  it('is exactly at the limit when the age equals it, and past it one day later', () => {
    expect(explainSource(one('2026-05-20'), 'en').code).toBe('fresh');
    expect(explainSource(one('2026-05-19'), 'en').code).toBe('stale');
  });

  it('uses the singular for one day', () => {
    expect(explainSource(one('2026-11-15'), 'en').text).toContain('1 day ago');
    expect(explainSource(one('2026-11-16'), 'en').text).toContain('0 days ago');
  });

  it('explains a missing date', () => {
    for (const v of [null, '', 'N/A', 'TBD']) expect(explainSource(one(v), 'en')).toEqual({ code: 'missing-date', text: 'No retrieved date is recorded, so the status is unknown.' });
  });

  it('explains an unreadable date', () => {
    for (const v of ['2026-02-31', 'soon', '2026-05-01T10:00:00']) expect(explainSource(one(v), 'en').code).toBe('invalid-date');
  });

  it('explains a date in the future and shows that date', () => {
    const e = explainSource(one('2026-12-25'), 'en');
    expect(e.code).toBe('future-date');
    expect(e.text).toBe('The retrieved date (December 25, 2026) is after today, so the status is unknown.');
  });

  it('never calls an unknown status fresh or stale', () => {
    for (const v of [null, 'x', '2027-01-01']) {
      const e = explainSource(one(v), 'en');
      expect(e.text).toMatch(/unknown/);
      expect(e.text).not.toMatch(/Within|Past/);
    }
  });

  it('is in French with correct typography', () => {
    const texts = [one('2026-11-01'), one('2026-05-01'), one(null), one('x'), one('2026-12-25')].map((s) => explainSource(s, 'fr').text);
    expect(texts[0]).toBe('Récupérée le 1 novembre 2026, il y a 15 jours. Dans la limite de 180 jours pour Lieux.');
    expect(texts[1]).toBe('Récupérée le 1 mai 2026, il y a 199 jours. Au-delà de la limite de 180 jours pour Lieux.');
    for (const text of texts) {
      expect(lintFrench(text), text).toEqual([]);
      expect(text).not.toMatch(/\{\w+\}/);
    }
  });

  it('has an English and a French reason for every code', () => {
    for (const code of ['fresh', 'stale', 'missing-date', 'invalid-date', 'future-date']) {
      for (const l of ['en', 'fr'] as const) expect(t(l, `basis.${code}` as MessageKey).length).toBeGreaterThan(10);
    }
  });
});

describe('basisCode agrees with the audit for random registries', () => {
  it('fresh and stale map 1:1; unknown always gets one of the three date reasons', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const s of auditRegistry(randomRecords(seed, NOW), NOW).sources) {
        const code = basisCode(s);
        if (s.state === 'unknown') expect(['missing-date', 'invalid-date', 'future-date']).toContain(code);
        else expect(code).toBe(s.state);
        for (const l of ['en', 'fr'] as const) expect(explainSource(s, l).text).not.toMatch(/\{\w+\}|undefined|NaN/);
      }
    }
  });
});

describe('ruleText and limitsInUse', () => {
  it('states the rule with the limit and the type', () => {
    expect(ruleText('routes', 120, 'en')).toBe('A source is marked “May be out of date” when it was retrieved more than 120 days before today (Routes). A source with no usable retrieved date is never counted as within the limit or past it.');
  });

  it('lists one limit per type in use, in the standard type order', () => {
    const recs: DatasetRecord[] = [
      { id: 'a', name: 'A', kind: 'transit', sources: [] },
      { id: 'b', name: 'B', kind: 'places', sources: [] },
      { id: 'c', name: 'C', kind: 'transit', sources: [] },
    ];
    expect(limitsInUse(auditRegistry(recs, NOW, { transit: 90 }))).toEqual([
      { kind: 'places', days: 180 },
      { kind: 'transit', days: 90 },
    ]);
  });
});

describe('renderBasisHtml', () => {
  const recs: DatasetRecord[] = [
    { id: 'd', name: 'Data <set>', kind: 'places', sources: [{ ...base, id: 'a', retrievedAt: '2026-11-10' }, { ...base, id: 'b', name: 'Old & stale', retrievedAt: '2026-01-01' }, { ...base, id: 'c', name: null, source: null, retrievedAt: null }] },
  ];
  const audit = auditRegistry(recs, NOW);

  it('lists only the sources that are not within the limit, each with its reason', () => {
    const text = visibleText(renderBasisHtml(audit, 'en'));
    expect(text).toMatch(/Old & stale\s*: Retrieved January 1, 2026, 319 days ago/);
    expect(text).toMatch(/Unknown name\s*: No retrieved date is recorded/);
    expect(text).not.toContain('November 10');
  });

  it('escapes data in the heading of each reason', () => {
    expect(renderBasisHtml(audit, 'en')).not.toContain('Old & stale');
    expect(renderBasisHtml(audit, 'en')).toContain('Old &amp; stale');
  });

  it('says so when every source is within its limit', () => {
    const ok = auditRegistry([{ id: 'd', name: 'D', kind: 'places', sources: [{ ...base, retrievedAt: '2026-11-10' }] }], NOW);
    expect(visibleText(renderBasisHtml(ok, 'en'))).toContain('Every source is within its limit.');
    expect(visibleText(renderBasisHtml(ok, 'fr'))).toContain('Toutes les sources sont dans leur limite.');
  });

  it('puts the French colon after a non-breaking space', () => {
    const html = renderBasisHtml(audit, 'fr');
    expect(html).toContain('</strong> : ');
    expect(lintFrench(visibleText(html))).toEqual([]);
  });

  it('is a labelled section with one heading', () => {
    const html = renderBasisHtml(audit, 'en');
    expect(html).toContain('aria-labelledby="ds-basis-title"');
    expect((html.match(/<h2/g) ?? []).length).toBe(1);
  });
});

describe('explainStatus without a dataset type (the live cache)', () => {
  const fresh = { state: 'fresh' as const, ageDays: 15, retrievedIso: '2026-11-01', limitDays: 180, issues: [] };

  it('says the limit without naming a type', () => {
    expect(explainStatus(fresh, 'en').text).toBe('Retrieved November 1, 2026, 15 days ago. Within the 180 days limit.');
    expect(explainStatus({ ...fresh, state: 'stale', ageDays: 200 }, 'en').text).toBe('Retrieved November 1, 2026, 200 days ago. Past the 180 days limit.');
  });

  it('says the same in French', () => {
    expect(explainStatus(fresh, 'fr').text).toBe('Récupérée le 1 novembre 2026, il y a 15 jours. Dans la limite de 180 jours.');
    expect(lintFrench(explainStatus({ ...fresh, state: 'stale' }, 'fr').text)).toEqual([]);
  });

  it('names the type when one is given', () => {
    expect(explainStatus({ ...fresh, kind: 'transit', limitDays: 60 }, 'en').text).toContain('limit for Transit');
  });

  it('explains Unknown the same way with or without a type', () => {
    for (const [issues, code] of [[['missing-date'], 'missing-date'], [['invalid-date'], 'invalid-date'], [['future-date'], 'future-date']] as const) {
      const input = { state: 'unknown' as const, ageDays: null, retrievedIso: code === 'future-date' ? '2027-01-01' : null, limitDays: 180, issues };
      expect(explainStatus(input, 'en').code).toBe(code);
      expect(explainStatus({ ...input, kind: 'places' }, 'en').text).toBe(explainStatus(input, 'en').text);
    }
  });

  it('every message has both languages, and none is left unfilled', () => {
    for (const l of ['en', 'fr'] as const) {
      for (const text of [explainStatus(fresh, l).text, explainStatus({ ...fresh, state: 'stale', ageDays: 999 }, l).text]) expect(text).not.toMatch(/\{\w+\}/);
    }
  });
});
