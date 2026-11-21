import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { buildFactsFile } from './exportExtras';
import { buildFactsCsv, buildFactsRows, FACTS_CSV_COLUMNS } from './factsCsv';
import { randomRegistry } from './round7Kit';
import { NOW, RECORDS } from './testkit';

const rows = (records: readonly DatasetRecord[], locale: 'en' | 'fr' = 'en') => buildFactsRows(records, auditRegistry(records, NOW, {}), locale);

describe('record facts CSV', () => {
  it('has a header and one row per record, each with the same number of cells', () => {
    const r = rows(RECORDS);
    expect(r).toHaveLength(4);
    for (const row of r) expect(row).toHaveLength(FACTS_CSV_COLUMNS.length);
    expect(r[0]).toEqual(['Dataset', 'Record ID', 'Record', 'Source', 'Source page', 'Licence', 'Retrieved (YYYY-MM-DD)', 'Status', 'Tier', 'Facts that are UNKNOWN']);
  });
  it('writes values as recorded', () => {
    expect(rows(RECORDS)[1]).toEqual(['Places <A>', 'a', 'Alpha', 'Publisher A', 'https://example.org/a', 'OGL-Ontario', '2026-11-01', 'Within its review period', '0', '0']);
    expect(rows(RECORDS)[2]?.slice(7)).toEqual(['May be out of date', 'E', '0']);
  });
  it('writes Unknown for every missing value, never an empty cell', () => {
    const r = rows(RECORDS)[3] ?? [];
    expect(r).toEqual(['Routes', 'c', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'Update date UNKNOWN', 'UNKNOWN', '4']);
    for (const all of rows(RECORDS)) for (const cell of all) expect(cell).not.toBe('');
  });
  it('writes a future date as Unknown, as the panel does', () => {
    const r = rows([{ id: 'd', name: 'Set', kind: 'places', sources: [{ id: 's', source: 'P', licence: 'OGL-Ontario', retrievedAt: '2031-01-01', tier: 1 }] }]);
    expect(r[1]?.[6]).toBe('UNKNOWN');
    expect(r[1]?.[9]).toBe('1');
  });
  it('uses French headings and words in French', () => {
    const r = rows(RECORDS, 'fr');
    expect(r[0]?.[0]).toBe('Jeu de données');
    expect(r[0]?.[8]).toBe('Niveau');
    expect(r[3]?.[8]).toBe('UNKNOWN');
  });
  it('guards cells a spreadsheet would run as a formula', () => {
    const csv = buildFactsCsv([{ id: 'd', name: '=SUM(A1)', kind: 'places', sources: [{ id: 's' }] }], auditRegistry([{ id: 'd', name: '=SUM(A1)', kind: 'places', sources: [{ id: 's' }] }], NOW, {}), 'en', false);
    expect(csv).toContain("'=SUM(A1)");
  });
  it('starts with a byte-order mark by default', () => {
    const audit = auditRegistry(RECORDS, NOW, {});
    expect(buildFactsCsv(RECORDS, audit, 'en').charCodeAt(0)).toBe(0xfeff);
    expect(buildFactsCsv(RECORDS, audit, 'en', false).startsWith('Dataset,')).toBe(true);
  });
  it('is offered as an export file built from the same records', () => {
    const f = buildFactsFile(RECORDS, 'en', NOW);
    expect(f).toMatchObject({ id: 'facts', filename: 'record-facts.csv', mime: 'text/csv;charset=utf-8' });
    expect(f.text).toBe(buildFactsCsv(RECORDS, auditRegistry(RECORDS, NOW, {}), 'en'));
  });
  it('has one row per audited source on random registries', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const records = randomRegistry(seed, NOW);
      const audit = auditRegistry(records, NOW, {});
      expect(buildFactsRows(records, audit, 'fr')).toHaveLength(audit.sources.length + 1);
    }
  });
});
