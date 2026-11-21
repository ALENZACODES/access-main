import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { SAMPLE_TABLE_MARKUP_HTML } from './samples.js';
import { auditTableMarkup, MAX_SPAN, SCOPES, TABLE_MARKUP_RULES, validSpan } from './tablemarkup.js';

const table = (rows: string, attrs = ''): string => `<table${attrs}>${rows}</table>`;
const found = (html: string): string[] => auditTableMarkup(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('validSpan', () => {
  it.each([['colspan', '1'], ['colspan', '2'], ['colspan', ' 3 '], ['colspan', String(MAX_SPAN)], ['rowspan', '0'], ['rowspan', '12']] as const)('%s="%s" is accepted', (name, value) => {
    expect(validSpan(name, value)).toBe(true);
  });
  it.each([['colspan', '0'], ['colspan', 'two'], ['colspan', '-1'], ['colspan', '1.5'], ['colspan', ''], ['colspan', '100%'], ['colspan', String(MAX_SPAN + 1)], ['rowspan', 'all'], ['rowspan', '2px']] as const)(
    '%s="%s" is not',
    (name, value) => {
      expect(validSpan(name, value)).toBe(false);
    },
  );
});

describe('scope', () => {
  it.each([...SCOPES, 'ROW', ' col '])('passes scope="%s" on a header', (scope) => {
    expect(found(table(`<tr><th scope="${scope}">Day</th></tr>`))).toEqual([]);
  });
  it.each(['column', 'rows', 'both', 'true', ''])('fails scope="%s"', (scope) => {
    const e = auditTableMarkup(table(`<tr><th scope="${scope}">Day</th></tr>`)).entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['scope-invalid', 'fail', 'th@L1']]);
    expect(e[0]?.message.en).toContain('Use row, col, rowgroup or colgroup');
  });
  it('asks about a valid scope on a data cell, and fails an invalid one there too', () => {
    expect(found(table('<tr><td scope="row">Monday</td><td>9 to 5</td></tr>'))).toEqual(['scope-on-td:unknown']);
    expect(found(table('<tr><td scope="line">Monday</td></tr>'))).toEqual(['scope-invalid:fail']);
  });
});

describe('spans', () => {
  it('fails a span that is not a number and shows it', () => {
    const e = auditTableMarkup(table('<tr><th colspan="two">Hours</th></tr>')).entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['span-invalid:fail']);
    expect(e[0]?.message.en).toContain('colspan set to “two”');
    expect(e[0]?.message.en).toContain('whole number from 1 up to 1000');
    expect(e[0]?.message.fr).toContain('à partir de 1, jusqu’à 1000');
  });
  it('reports each bad span on a cell', () => {
    expect(found(table('<tr><td colspan="0" rowspan="x">a</td></tr>'))).toEqual(['span-invalid:fail', 'span-invalid:fail']);
  });
  it('allows rowspan 0 and does not say "from 1" for a row span', () => {
    expect(found(table('<tr><td rowspan="0">a</td></tr>'))).toEqual([]);
    expect(auditTableMarkup(table('<tr><td rowspan="x">a</td></tr>')).entries[0]?.message.en).toContain('whole number up to 1000');
  });
  it('passes ordinary spans', () => {
    expect(found(table('<tr><th colspan="2" scope="colgroup">Hours</th></tr><tr><td rowspan="2">a</td><td>b</td></tr>'))).toEqual([]);
  });
});

describe('caption and summary', () => {
  it('asks about a caption that is not first, on the caption', () => {
    const e = auditTableMarkup('<table>\n<tr><th>Day</th></tr>\n<caption>Hours</caption></table>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['caption-not-first', 'unknown', 'caption@L3']]);
    expect(e[0]?.message.en).toContain('comes after a tr');
  });
  it('passes a caption that is first', () => {
    expect(found(table('<caption>Hours</caption><thead><tr><th>Day</th></tr></thead>'))).toEqual([]);
  });
  it('asks about a summary attribute and shows it', () => {
    const e = auditTableMarkup(table('<tr><th>Day</th></tr>', ' summary="Opening hours by day"')).entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['summary-attribute:unknown']);
    expect(e[0]?.message.en).toContain('“Opening hours by day”');
    expect(found(table('<tr><th>Day</th></tr>', ' summary=""'))).toEqual([]);
  });
  it('leaves a layout table alone, and still reads its cells', () => {
    expect(found(table('<tr><td>a</td></tr><caption>x</caption>', ' role="presentation" summary="layout"'))).toEqual([]);
    expect(found(table('<tr><td colspan="x">a</td></tr>', ' role="none"'))).toEqual(['span-invalid:fail']);
  });
});

describe('the result', () => {
  it('counts tables and the cells that carry a scope or a span, and skips hidden ones', () => {
    const r = auditTableMarkup(`${table('<tr><th scope="col">a</th><th>b</th></tr><tr><td colspan="2">c</td><td>d</td></tr>')}<div hidden>${table('<tr><th scope="x">a</th></tr>')}</div>`);
    expect(r).toEqual({ checked: 3, entries: [] });
  });
  it('keeps the order of the file', () => {
    const e = auditTableMarkup('<table summary="s">\n<tr><th scope="x">a</th>\n<td colspan="y">b</td></tr></table>').entries;
    expect(e.map((x) => x.id)).toEqual(['table@L1', 'th@L2', 'td@L3']);
  });
  it('has a sample for every rule, in clean French', () => {
    const e = auditTableMarkup(SAMPLE_TABLE_MARKUP_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...TABLE_MARKUP_RULES].sort());
    noFrIssues(e);
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<table', '<td scope=', '<table><table><table>', '<th colspan>']) expect(() => auditTableMarkup(html)).not.toThrow();
  });
});
