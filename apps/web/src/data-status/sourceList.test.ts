import { describe, expect, it } from 'vitest';
import { buildSourceList, dataBadge, renderSourceListHtml, type SourceInput } from './index.ts';

const NOW = new Date('2026-11-15T12:00:00Z');
const src: SourceInput[] = [
  { id: 'b', name: 'Zeta Open Data', licence: 'OGL-Ontario', retrievedAt: '2026-10-01', url: 'https://example.org/z' },
  { id: 'a', name: 'Alpha <Registry>', licence: 'Proprietary', retrievedAt: '2024-01-01', url: 'javascript:alert(1)' },
  { id: 'c', name: '  ' },
];

describe('buildSourceList', () => {
  it('sorts by name and keeps unknowns UNKNOWN', () => {
    const rows = buildSourceList(src, 'en', NOW);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c'].sort((x, y) => rows.find((r) => r.id === x)!.name.localeCompare(rows.find((r) => r.id === y)!.name, 'en')));
    const c = rows.find((r) => r.id === 'c')!;
    expect(c).toMatchObject({ name: 'Source UNKNOWN', licence: 'UNKNOWN', retrieved: 'UNKNOWN', licenceOpen: null, state: 'unknown' });
  });

  it('flags non-open licences, stale dates, and drops unsafe urls', () => {
    const a = buildSourceList(src, 'en', NOW).find((r) => r.id === 'a')!;
    expect(a).toMatchObject({ licenceOpen: false, state: 'stale', url: null });
    expect(a.issues).toContain('licence-unrecognised');
  });

  it('does not flag accepted provider terms for review', () => {
    const rows = buildSourceList([
      { id: 'm', name: 'Metrolinx', licence: 'Metrolinx Access and Use Agreement (accepted 2026-11-15)', retrievedAt: '2026-11-10' },
      { id: 'l', name: 'London Transit', licence: 'LTC Open Data Terms of Use', retrievedAt: '2026-11-10' },
    ], 'en', NOW);
    expect(rows.map((r) => r.licenceOpen)).toEqual([true, true]);
    expect(renderSourceListHtml(rows, 'en')).not.toContain('Licence needs review');
  });

  it('treats the string UNKNOWN, in any case, as a licence that is not known, never as an open one', () => {
    const sources: SourceInput[] = [
      { id: 'u', name: 'Unspecified feed', licence: 'UNKNOWN', retrievedAt: '2026-11-10' },
      { id: 'u2', name: 'Also unknown', licence: 'unknown', retrievedAt: '2026-11-10' },
    ];
    const en = buildSourceList(sources, 'en', NOW);
    expect(en.every((r) => r.licenceOpen === null)).toBe(true);
    expect(en.every((r) => r.licence === 'UNKNOWN')).toBe(true);
    const enHtml = renderSourceListHtml(en, 'en');
    // Both rows show the token, whatever case the record used.
    expect(enHtml.match(/<td>UNKNOWN<\/td>/g)).toHaveLength(2);
    expect(enHtml).not.toContain('<td>unknown</td>');
    // Not flagged as open, and not the unrecognised-licence review line.
    expect(enHtml).not.toContain('Licence needs review');

    const fr = buildSourceList(sources, 'fr', NOW);
    expect(fr.every((r) => r.licenceOpen === null)).toBe(true);
    expect(fr.every((r) => r.licence === 'UNKNOWN')).toBe(true);
    const frHtml = renderSourceListHtml(fr, 'fr');
    expect(frHtml.match(/<td>UNKNOWN<\/td>/g)).toHaveLength(2);
    expect(frHtml).not.toContain('<td>unknown</td>');
    expect(frHtml).not.toContain('Licence à examiner');
    expect(frHtml).not.toContain("'");
  });

  it('status label agrees with dataBadge (provenance consistency)', () => {
    for (const s of src) {
      const row = buildSourceList([s], 'fr', NOW)[0]!;
      expect(row.statusLabel).toBe(dataBadge(s, 'fr', NOW).label);
    }
  });

  it('marks duplicate ids', () => {
    const rows = buildSourceList([{ id: 'x', name: 'A' }, { id: 'x', name: 'B' }], 'en', NOW);
    expect(rows.every((r) => r.duplicateId)).toBe(true);
  });
});

describe('renderSourceListHtml', () => {
  it('renders an escaped, semantic table with 44px links', () => {
    const html = renderSourceListHtml(buildSourceList(src, 'en', NOW), 'en');
    expect(html).toContain('<caption>Data sources</caption>');
    expect(html).toContain('Alpha &lt;Registry&gt;');
    expect(html).not.toContain('<Registry>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('min-height:44px');
    expect(html).toContain('<time datetime="2026-10-01">2026-10-01</time>');
    expect(html).toContain('Licence needs review');
  });

  it('FR uses typographic apostrophes, no ASCII apostrophe in its own strings', () => {
    const html = renderSourceListHtml(buildSourceList([{ id: 'q' }], 'fr', NOW), 'fr');
    expect(html).toContain('Sources de données');
    expect(html).toContain('Source UNKNOWN');
    expect(html).toContain('Date de récupération UNKNOWN');
    expect(html).not.toContain("'");
  });

  it('empty list has a message', () => {
    expect(renderSourceListHtml([], 'fr')).toContain('Aucune source de données listée.');
  });
});
