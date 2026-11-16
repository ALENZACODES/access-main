import { describe, expect, it } from 'vitest';
import { auditRegistry, auditedSourcesToCsv, csvCell, toCsv } from './index';

const NOW = new Date('2026-11-15T12:00:00Z');

describe('csvCell / toCsv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell('plain')).toBe('plain');
  });

  it('neutralises spreadsheet formulas', () => {
    for (const v of ['=SUM(A1)', '+1', '-1', '@x', '\tx']) expect(csvCell(v).startsWith("'") || csvCell(v).startsWith('"\'')).toBe(true);
  });

  it('uses CRLF and an optional BOM', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d\r\n');
    expect(toCsv([['a']], true).charCodeAt(0)).toBe(0xfeff);
  });
});

describe('auditedSourcesToCsv', () => {
  const audit = auditRegistry(
    [
      {
        id: 'd',
        name: 'Places, central',
        kind: 'places',
        sources: [
          { id: 'a', name: 'Alpha', source: 'Publisher A', licence: 'OGL-Ontario', retrievedAt: '2026-11-01', url: 'https://example.org/a' },
          { id: 'b' },
        ],
      },
    ],
    NOW,
  );

  it('writes EN rows with Unknown for gaps', () => {
    const lines = auditedSourcesToCsv(audit.sources, 'en', false).trim().split('\r\n');
    expect(lines[0]).toBe('Dataset,Source,Link,Licence,Open licence,Retrieved,Status');
    expect(lines[1]).toBe('"Places, central",Alpha,https://example.org/a,OGL-Ontario,Yes,2026-11-01,Within its review period');
    expect(lines[2]).toBe('"Places, central",Unknown,,Unknown,Unknown,Unknown,Update date unknown');
  });

  it('writes FR headers and values with a BOM by default', () => {
    const csv = auditedSourcesToCsv(audit.sources, 'fr');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Date de récupération');
    expect(csv).toContain('Dans sa période de révision');
    expect(csv).toContain('Inconnu');
  });
});
