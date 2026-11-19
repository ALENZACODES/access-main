import { describe, expect, it } from 'vitest';
import type { DatasetRecord } from './datasetRegistry';
import { auditHtml, buildCacheRecords, describeProblems, lintFrench, mountDataStatusPanel, parseRegistry, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { buildTierBreakdown } from './tiers';
import { FakeHost, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';

const sv = { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' };

describe('panel: tier of each record, the four facts, and the glossary', () => {
  for (const locale of ['en', 'fr'] as const) {
    const html = renderDataStatusPanel({ records: RECORDS, locale, now: NOW });
    it(`${locale}: has each new section once`, () => {
      for (const id of ['ds-tiers-title', 'ds-facts-title', 'ds-glossary-title']) expect(html.match(new RegExp(`id="${id}"`, 'g')), id).toHaveLength(1);
    });
    it(`${locale}: puts tiers after licences, facts after tiers, and the glossary after the self-check`, () => {
      const at = (id: string) => html.indexOf(`<h2 id="${id}"`);
      expect(at('ds-licences-title')).toBeGreaterThan(-1);
      expect(at('ds-tiers-title')).toBeGreaterThan(at('ds-licences-title'));
      expect(at('ds-facts-title')).toBeGreaterThan(at('ds-tiers-title'));
      expect(at('ds-glossary-title')).toBeGreaterThan(at('ds-selfcheck-title'));
    });
    it(`${locale}: links to the new sections from the contents list`, () => {
      for (const id of ['ds-tiers-title', 'ds-facts-title', 'ds-glossary-title']) expect(html).toContain(`href="#${id}"`);
    });
    it(`${locale}: passes the audits, with unique ids and large targets`, () => {
      expect(scanHtml(html)).toEqual([]);
      expect(describeProblems(auditHtml(html))).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      expect(targetsBelow44(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
    });
    it(`${locale}: the static view has the sections too, without the download button`, () => {
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW, staticView: sv });
      expect(page).toContain('id="ds-tiers-title"');
      expect(page).toContain('id="ds-facts-title"');
      expect(page).not.toContain('data-action="export-facts"');
      expect(scanHtml(page)).toEqual([]);
    });
    it(`${locale}: plain tables keep the sections`, () => {
      const plain = renderDataStatusPanel({ records: RECORDS, locale, now: NOW, plainTables: true });
      expect(plain).toContain('id="ds-tiers-title"');
      expect(describeProblems(auditHtml(plain))).toEqual([]);
    });
  }

  it('shows the counts from the records', () => {
    const html = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    expect(html).toContain('Records that state a tier: 2 of 3.');
    expect(html).toContain('Records that carry all four: 2 of 3.');
  });
  it('renders with no records', () => {
    const html = renderDataStatusPanel({ records: [], locale: 'en', now: NOW });
    expect(html).toContain('There are no records to count.');
    expect(html).toContain('There are no records to check.');
    expect(describeProblems(auditHtml(html))).toEqual([]);
  });
  it('clicking the facts button hands the CSV file to the page, in the current language', () => {
    const host = new FakeHost();
    const files: { text: string; filename: string; mime: string }[] = [];
    let locale: 'en' | 'fr' = 'en';
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => locale, now: () => NOW, onExportFile: (f) => files.push(f) });
    expect(host.innerHTML).toContain('data-action="export-facts"');
    host.click('export-facts');
    locale = 'fr';
    host.click('export-facts');
    expect(files.map((f) => f.filename)).toEqual(['record-facts.csv', 'record-facts.csv']);
    expect(files[0]?.text).toContain('Dataset,Record ID');
    expect(files[1]?.text).toContain('Jeu de données,Identifiant');
    expect(files[0]?.mime).toBe('text/csv;charset=utf-8');
  });
  it('clicking the summary button hands the text file to the page', () => {
    const host = new FakeHost();
    const files: { text: string; filename: string; mime: string }[] = [];
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onExportFile: (f) => files.push(f) });
    host.click('export-summary');
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ filename: 'data-status-summary.txt', mime: 'text/plain;charset=utf-8' });
    expect(files[0]?.text.startsWith('Data status summary\n')).toBe(true);
    expect(renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, staticView: sv })).not.toContain('data-action="export-summary"');
  });
  it('does nothing on the facts button when the page takes no files', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW });
    expect(() => host.click('export-facts')).not.toThrow();
  });
});

describe('tier is carried from the saved records and from a registry file', () => {
  const entry = (id: string, tier: unknown) => ({ id, kind: 'place', provenance: { source_name: 'S', licence: 'OGL-Ontario', retrieved_at: '2026-11-01', tier: tier as never } });
  it('keeps the tier of each cached record', () => {
    const records = buildCacheRecords([entry('a', 0), entry('b', 'E'), entry('c', null), { id: 'd', kind: 'place', provenance: {} }], 'en');
    expect(records[0]?.sources.map((s) => s.tier)).toEqual([0, 'E', null, null]);
    expect(buildTierBreakdown(records)).toMatchObject({ known: 2, unknown: 2, total: 4 });
  });
  it('reads a tier from a registry file, as a number or as text', () => {
    const out = parseRegistry([{ id: 'd', name: 'Set', kind: 'places', sources: [{ id: 'a', tier: 1 }, { id: 'b', tier: 'E' }, { id: 'c' }, { id: 'e', tier: null }] }]);
    expect(out.usable).toBe(true);
    expect(out.issues).toEqual([]);
    expect(out.records[0]?.sources.map((s) => s.tier)).toEqual([1, 'E', undefined, undefined]);
  });
  it('reports a tier of the wrong type and leaves it out', () => {
    const out = parseRegistry([{ id: 'd', name: 'Set', kind: 'places', sources: [{ id: 'a', tier: { n: 1 } }, { id: 'b', tier: true }, { id: 'c', tier: NaN }] }]);
    expect(out.issues.map((i) => `${i.code} ${i.path}`)).toEqual(['bad-field datasets[0].sources[0].tier', 'bad-field datasets[0].sources[1].tier', 'bad-field datasets[0].sources[2].tier']);
    const records: DatasetRecord[] = out.records;
    expect(records[0]?.sources.every((s) => s.tier === undefined)).toBe(true);
  });
});
