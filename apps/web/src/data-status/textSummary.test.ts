import { describe, expect, it } from 'vitest';
import { containsForbiddenOrg } from '../../../../packages/shared/test/forbiddenOrg.ts';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { buildSummaryFile } from './exportExtras';
import { lintFrench, scanCopy } from './index';
import { randomRegistry } from './round7Kit';
import { NOW, RECORDS } from './testkit';
import { buildTextSummary, buildTextSummaryLines, stateCounts } from './textSummary';

const lines = (records: readonly DatasetRecord[], locale: 'en' | 'fr' = 'en') => buildTextSummaryLines(records, auditRegistry(records, NOW, {}), NOW, locale);

describe('plain-text summary', () => {
  it('starts with the title and the date', () => {
    const l = lines(RECORDS);
    expect(l[0]).toBe('Data status summary');
    expect(l[1]).toMatch(/^As of .*2026/);
    expect(l[2]).toBe('');
  });
  it('counts each status, and the counts add up to the number of records', () => {
    const audit = auditRegistry(RECORDS, NOW, {});
    const c = stateCounts(audit);
    expect(c).toEqual({ fresh: 1, stale: 1, unknown: 1 });
    expect(c.fresh + c.stale + c.unknown).toBe(audit.sources.length);
    const l = lines(RECORDS);
    expect(l).toContain('- Within its review period: 1');
    expect(l).toContain('- May be out of date: 1');
    expect(l).toContain('- Update date UNKNOWN: 1');
  });
  it('lists licences with their type, and tiers in use', () => {
    const l = lines(RECORDS);
    expect(l).toContain('- Proprietary: 1 (Not on the reference list)');
    expect(l).toContain('- UNKNOWN: 1 (UNKNOWN)');
    expect(l).toContain('- Tier 0: 1');
    expect(l).toContain('- Tier E: 1');
    expect(l).toContain('Records that state a tier: 2 of 3.');
  });
  it('says how many records carry the four facts and where each is unknown', () => {
    const l = lines(RECORDS);
    expect(l).toContain('Records that carry all four: 2 of 3.');
    expect(l).toContain('- Source: UNKNOWN on 1');
    expect(l).toContain('- Tier: UNKNOWN on 1');
  });
  it('has its section headings in order', () => {
    const l = lines(RECORDS);
    const at = ['Status', 'Licences', 'Tiers', 'Source, licence, date and tier'].map((h) => l.indexOf(h));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it('is short and says so when there are no records', () => {
    expect(lines([])).toEqual(['Data status summary', expect.stringMatching(/^As of /), '', 'There are no records.']);
    expect(lines([], 'fr')[3]).toBe('Il n’y a aucun enregistrement.');
  });
  it('is written in French, with the right spacing before colons', () => {
    const text = buildTextSummary(RECORDS, auditRegistry(RECORDS, NOW, {}), NOW, 'fr');
    expect(text).toContain('Résumé de l’état des données\n');
    expect(text).toContain('- Niveau E\u00A0: 1\n');
    expect(text).toContain('- Licence\u00A0: UNKNOWN pour 1\n');
    expect(lintFrench(text)).toEqual([]);
  });
  it('ends every line with a line feed and keeps control characters out', () => {
    const records: DatasetRecord[] = [{ id: 'd', name: 'Set', kind: 'places', sources: [{ id: 's', licence: 'Odd\u0007\nLicence', tier: 0 }] }];
    const text = buildTextSummary(records, auditRegistry(records, NOW, {}), NOW, 'en');
    expect(text.endsWith('\n')).toBe(true);
    expect([...text].filter((ch) => ch !== '\n' && ch.charCodeAt(0) < 32)).toEqual([]);
    expect(text).toContain('- Odd Licence: 1');
  });
  it('passes the wording rules in both languages, on the sample and on random registries', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const records of [RECORDS, randomRegistry(3, NOW), randomRegistry(9, NOW)]) {
        const text = buildTextSummary(records, auditRegistry(records, NOW, {}), NOW, locale);
        expect(scanCopy(text)).toEqual([]);
        expect(containsForbiddenOrg(text)).toBe(false);
      }
    }
  });
  it('is offered as an export file built from the same records', () => {
    const f = buildSummaryFile(RECORDS, 'en', NOW);
    expect(f).toMatchObject({ id: 'summary', filename: 'data-status-summary.txt', mime: 'text/plain;charset=utf-8', label: 'Download a short summary (text)' });
    expect(f.text).toBe(buildTextSummary(RECORDS, auditRegistry(RECORDS, NOW, {}), NOW, 'en'));
    expect(buildSummaryFile(RECORDS, 'fr', NOW).label).toBe('Télécharger un court résumé (texte)');
  });
});
