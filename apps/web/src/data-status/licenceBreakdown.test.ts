import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { lintFrench } from './i18n';
import { buildLicenceBreakdown, kindLabel, licenceDisplay, licenceSummary, renderLicenceBreakdownHtml } from './licenceBreakdown';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW, RECORDS, structureProblems } from './testkit';

const mk = (licences: (string | null)[]): DatasetRecord => ({
  id: 'd',
  name: 'D',
  kind: 'places',
  sources: licences.map((licence, i) => ({ id: `s${i}`, name: `S${i}`, source: 'P', licence, retrievedAt: isoDayOffset(NOW, -1) })),
});

describe('buildLicenceBreakdown', () => {
  it('groups sources by licence, the most used first, with Unknown last', () => {
    const b = buildLicenceBreakdown(auditRegistry([mk(['OGL-Ontario', 'Proprietary', 'OGL-Ontario', null, 'Proprietary', 'OGL-Ontario'])], NOW));
    expect(b.rows.map((r) => [r.licence, r.count])).toEqual([['OGL-Ontario', 3], ['Proprietary', 2], [null, 1]]);
    expect(b.total).toBe(6);
  });
  it('gives each row its kind', () => {
    const b = buildLicenceBreakdown(auditRegistry([mk(['OGL-Ontario', 'Proprietary', null])], NOW));
    expect(Object.fromEntries(b.rows.map((r) => [r.licence, r.kind]))).toEqual({ 'OGL-Ontario': 'open', Proprietary: 'unrecognised', null: 'unknown' });
  });
  it('counts open licences and accepted terms as reusable', () => {
    const b = buildLicenceBreakdown(auditRegistry([mk(['OGL-Ontario', 'OGL-Ontario', 'Proprietary', null])], NOW));
    expect(b.reusable).toBe(2);
  });
  it('treats the word Unknown and blank text as no licence', () => {
    const b = buildLicenceBreakdown(auditRegistry([mk(['Unknown', '  ', null])], NOW));
    expect(b.rows).toEqual([{ licence: null, kind: 'unknown', count: 3 }]);
  });
  it('merges spellings that differ only in case or spacing, showing the first seen', () => {
    const b = buildLicenceBreakdown(auditRegistry([mk(['Custom Terms', 'custom terms', ' CUSTOM TERMS '])], NOW));
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]).toMatchObject({ licence: 'Custom Terms', count: 3 });
  });
  it('orders equal counts by name', () => {
    const b = buildLicenceBreakdown(auditRegistry([mk(['Beta', 'Alpha'])], NOW));
    expect(b.rows.map((r) => r.licence)).toEqual(['Alpha', 'Beta']);
  });
  it('is empty for an empty registry', () => {
    expect(buildLicenceBreakdown(auditRegistry([], NOW))).toEqual({ rows: [], total: 0, reusable: 0 });
  });
  it('counts every source exactly once in random registries', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const audit = auditRegistry(randomRegistry(seed, NOW), NOW);
      const b = buildLicenceBreakdown(audit);
      expect(b.rows.reduce((n, r) => n + r.count, 0), `seed ${seed}`).toBe(audit.sources.length);
      expect(b.reusable).toBeLessThanOrEqual(b.total);
      expect(b.rows.filter((r) => r.kind === 'unknown').length).toBeLessThanOrEqual(1);
    }
  });
});

describe('labels', () => {
  it('names each kind in both languages', () => {
    expect(kindLabel('open', 'en')).toBe('Open licence');
    expect(kindLabel('terms', 'fr')).toBe('Conditions du diffuseur acceptées');
    expect(kindLabel('unrecognised', 'en')).toBe('Not on the reference list');
    expect(kindLabel('unknown', 'fr')).toBe('Inconnue');
  });
  it('shows the full name of a listed licence and the text as recorded otherwise', () => {
    expect(licenceDisplay('OGL-Ontario', 'en')).toBe('Open Government Licence – Ontario');
    expect(licenceDisplay('OGL-Ontario', 'fr')).toBe('Licence du gouvernement ouvert – Ontario');
    expect(licenceDisplay('Proprietary', 'en')).toBe('Proprietary');
    expect(licenceDisplay(null, 'en')).toBe('Unknown');
    expect(licenceDisplay(null, 'fr')).toBe('Inconnu');
  });
  it('words the summary with the singular and plural', () => {
    expect(licenceSummary({ rows: [], total: 1, reusable: 1 }, 'en')).toBe('1 of 1 source is on an open licence or accepted terms.');
    expect(licenceSummary({ rows: [], total: 4, reusable: 3 }, 'en')).toBe('3 of 4 sources are on an open licence or accepted terms.');
    expect(licenceSummary({ rows: [], total: 4, reusable: 3 }, 'fr')).toBe('3 sources sur 4 sont sous une licence ouverte ou des conditions acceptées.');
  });
});

describe('renderLicenceBreakdownHtml', () => {
  const html = renderLicenceBreakdownHtml(buildLicenceBreakdown(auditRegistry(RECORDS, NOW)), 'en');
  it('has a captioned table with scoped headers and a row per licence', () => {
    expect(html).toContain('<caption>Sources by licence</caption>');
    expect(html.match(/<th scope="col">/g)).toHaveLength(3);
    expect(html.match(/<tr><th scope="row">/g)).toHaveLength(3);
    expect(html).toContain('<tr><th scope="row">Open Government Licence – Ontario</th><td>Open licence</td><td>1</td></tr>');
    expect(html).toContain('<tr><th scope="row">Unknown</th><td>Unknown</td><td>1</td></tr>');
  });
  it('explains that not listed does not mean closed', () => {
    expect(html).toContain('not that it is closed');
  });
  it('passes the markup audit in both languages', () => {
    expect(structureProblems(html)).toEqual([]);
    expect(structureProblems(renderLicenceBreakdownHtml(buildLicenceBreakdown(auditRegistry(RECORDS, NOW)), 'fr'))).toEqual([]);
  });
  it('has a plain message and no table for an empty registry', () => {
    const empty = renderLicenceBreakdownHtml(buildLicenceBreakdown(auditRegistry([], NOW)), 'fr');
    expect(empty).toContain('Il n’y a aucune source à regrouper.');
    expect(empty).not.toContain('<table');
  });
  it('escapes licence text', () => {
    const out = renderLicenceBreakdownHtml(buildLicenceBreakdown(auditRegistry([mk(['<script>alert(1)</script>'])], NOW)), 'en');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
  it('has no French typography problems in its own words', () => {
    const fr = renderLicenceBreakdownHtml(buildLicenceBreakdown(auditRegistry(RECORDS, NOW)), 'fr').replace(/<[^>]*>/g, ' ');
    expect(lintFrench(fr)).toEqual([]);
  });
});
