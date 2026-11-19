import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, csvCell, csvRow, parseCsv, renderCsv } from './csv.js';
import { emptyReport, entry, sampleReport } from './outputs-testkit.js';
import { buildRouteAudit, makeReport } from './report.js';

describe('csvCell', () => {
  it('leaves plain text and numbers alone', () => {
    expect(csvCell('Opening hours')).toBe('Opening hours');
    expect(csvCell(320)).toBe('320');
    expect(csvCell(0)).toBe('0');
  });
  it('writes nothing for a missing value or a number that is not finite', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell('')).toBe('');
  });
  it('quotes a cell with a comma, a quote or a line break, and doubles the quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
    expect(csvCell('a\r\nb')).toBe('"a\r\nb"');
  });
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '=HYPERLINK("https://x","y")'])('guards "%s" against being run as a formula', (value) => {
    const cell = csvCell(value);
    const inner = cell.startsWith('"') ? cell.slice(1) : cell;
    expect(inner.startsWith("'")).toBe(true);
  });
  it('does not guard text that only holds those characters later on', () => {
    expect(csvCell('a=b')).toBe('a=b');
    expect(csvCell('e-mail')).toBe('e-mail');
    expect(csvCell('user@example.org')).toBe('user@example.org');
  });
});

describe('csvRow', () => {
  it('joins cells with commas', () => {
    expect(csvRow(['a', 1, null, 'b,c'])).toBe('a,1,,"b,c"');
    expect(csvRow([])).toBe('');
  });
});

describe('renderCsv', () => {
  it('writes a header row and one row per finding, ending each line in CR LF', () => {
    const csv = renderCsv(sampleReport());
    expect(csv.endsWith('\r\n')).toBe(true);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    expect(rows).toHaveLength(1 + 6);
    for (const r of rows) expect(r).toHaveLength(CSV_COLUMNS.length);
  });
  it('fills the route, the check, the criterion with its level, the rule, the status and both messages', () => {
    const rows = parseCsv(renderCsv(sampleReport()));
    expect(rows[1]).toEqual(['/', '320', 'reflow', '1.4.10', 'AA', 'overflow', 'fail', 'div#map', 'English text for overflow.', 'Texte français pour overflow.']);
    expect(rows[4]?.slice(0, 7)).toEqual(['/', '320', 'contrast', '1.4.3', 'AA', 'image', 'unknown']);
    expect(rows[6]?.slice(2, 5)).toEqual(['typography', '1.4.8', 'AAA']);
  });
  it('leaves the criterion and level empty for a check outside WCAG, and the viewport empty when there is none', () => {
    const report = makeReport([buildRouteAudit('strings', null, { copy: { checked: 1, entries: [entry('copy', 'claim-live', 'fail', 'hero.title')] } })], new Date('2026-11-19T10:00:00Z'));
    expect(parseCsv(renderCsv(report))[1]?.slice(0, 6)).toEqual(['strings', '', 'copy', '', '', 'claim-live']);
  });
  it('writes only the header for a report with no finding', () => {
    expect(renderCsv(emptyReport())).toBe(`${CSV_COLUMNS.join(',')}\r\n`);
  });
  it('keeps page text that looks like a formula or holds quotes and commas inside one cell', () => {
    const nasty = '=cmd|\' /C calc\'!A0, "quoted"\nsecond line';
    const report = makeReport([buildRouteAudit('/x', 320, { contrast: { checked: 1, entries: [entry('contrast', 'low', 'fail', '=id', nasty, nasty)] } })], new Date('2026-11-19T10:00:00Z'));
    const rows = parseCsv(renderCsv(report));
    expect(rows).toHaveLength(2);
    expect(rows[1]?.[7]).toBe("'=id");
    expect(rows[1]?.[8]).toBe(`'${nasty}`);
    expect(rows[1]?.[9]).toBe(`'${nasty}`);
  });
});

describe('parseCsv', () => {
  it('reads plain rows with LF or CR LF', () => {
    expect(parseCsv('a,b\nc,d\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('reads quoted cells, doubled quotes and line breaks inside quotes', () => {
    expect(parseCsv('"a,b","say ""hi""","one\ntwo"\n')).toEqual([['a,b', 'say "hi"', 'one\ntwo']]);
  });
  it('keeps empty cells and an empty last cell', () => {
    expect(parseCsv('a,,c\n,,\n')).toEqual([['a', '', 'c'], ['', '', '']]);
  });
  it('returns nothing for empty text', () => {
    expect(parseCsv('')).toEqual([]);
  });
  it('round-trips every cell it can write', () => {
    const cells = ['plain', 'a,b', 'q"q', 'two\nlines', 'cr\r\nlf', '', ' spaced ', 'é ü 日本', '"', ',,,'];
    expect(parseCsv(csvRow(cells) + '\r\n')).toEqual([cells]);
  });
  it('does not throw on text that is not well formed', () => {
    for (const text of ['"never closed', 'a"b,c', '"a"b', '\r', ',\n,']) expect(() => parseCsv(text)).not.toThrow();
  });
});
