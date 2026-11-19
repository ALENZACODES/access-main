import { describe, expect, it } from 'vitest';
import { auditRegistry } from './datasetRegistry';
import { buildTablesCsv, buildTablesRows } from './tablesCsv';
import { buildTablesFile } from './exportExtras';
import { NOW, RECORDS } from './testkit';
import { randomRegistry } from './round7Kit';

describe('planning tables CSV', () => {
  const audit = auditRegistry(RECORDS, NOW, {});
  it('starts with a header row and has four cells on every row', () => {
    const rows = buildTablesRows(audit, NOW, 'en');
    expect(rows[0]).toEqual(['Section', 'Item', 'Sources', 'Detail']);
    for (const r of rows) expect(r).toHaveLength(4);
  });
  it('covers the three tables', () => {
    const sections = new Set(buildTablesRows(audit, NOW, 'en').slice(1).map((r) => r[0]));
    expect(sections.size).toBe(3);
  });
  it('counts are whole numbers', () => {
    for (const r of buildTablesRows(audit, NOW, 'en').slice(1)) expect(r[2]).toMatch(/^\d+$/);
  });
  it('age-band counts add up to the number of sources', () => {
    const rows = buildTablesRows(audit, NOW, 'en').slice(1);
    const sections = [...new Set(rows.map((r) => r[0]))];
    const ageRows = rows.filter((r) => r[0] === sections[1]);
    expect(ageRows.reduce((n, r) => n + Number(r[2]), 0)).toBe(audit.sources.length);
  });
  it('writes with a byte-order mark by default and can leave it off', () => {
    expect(buildTablesCsv(audit, NOW, 'en').charCodeAt(0)).toBe(0xfeff);
    expect(buildTablesCsv(audit, NOW, 'en', undefined, false).charCodeAt(0)).not.toBe(0xfeff);
  });
  it('uses French headings in French', () => {
    expect(buildTablesRows(audit, NOW, 'fr')[0]).toEqual(['Section', 'Élément', 'Sources', 'Détail']);
  });
  it('builds the same text through the export file helper', () => {
    const f = buildTablesFile(RECORDS, 'en', NOW);
    expect(f.id).toBe('tables');
    expect(f.filename).toBe('planning-tables.csv');
    expect(f.mime).toBe('text/csv;charset=utf-8');
    expect(f.text).toBe(buildTablesCsv(audit, NOW, 'en'));
  });
  it('works on random registries', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const rows = buildTablesRows(a, NOW, 'fr');
      for (const r of rows) expect(r).toHaveLength(4);
    }
  });
});
