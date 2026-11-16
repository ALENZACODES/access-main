import { describe, expect, it } from 'vitest';
import {
  auditRegistry,
  buildAttributions,
  creditText,
  lintFrench,
  renderAttributionHtml,
  renderAttributionText,
  scanHtml,
  type DatasetRecord,
} from './index';

const NOW = new Date('2026-11-15T12:00:00Z');
const records: DatasetRecord[] = [
  {
    id: 'd',
    name: 'Places',
    kind: 'places',
    sources: [
      { id: 'a', name: 'Alpha', source: 'A', licence: 'OGL-Ontario', retrievedAt: '2026-11-01' },
      { id: 'b', name: 'Beta <b>', source: 'B', licence: 'CC-BY-SA-4.0', retrievedAt: '2026-10-01' },
      { id: 'c', name: 'Gamma', source: 'C', licence: 'CC0-1.0', retrievedAt: '2026-09-01' },
      { id: 'd', name: 'Delta', source: 'D', licence: 'Custom terms', retrievedAt: '2026-08-01' },
      { id: 'e', name: 'Epsilon' },
    ],
  },
];
const sources = auditRegistry(records, NOW).sources;

describe('buildAttributions', () => {
  const en = buildAttributions(sources, 'en');
  const by = (label: string) => en.find((e) => e.sourceLabel.endsWith(label))!;

  it('maps recognised licences to names, links and credit rules', () => {
    expect(by('Alpha')).toMatchObject({ licenceId: 'OGL-Ontario', credit: true, shareAlike: false });
    expect(by('Alpha').licenceUrl).toMatch(/^https:\/\//);
    expect(by('Gamma')).toMatchObject({ credit: false });
    expect(by('Beta <b>')).toMatchObject({ credit: true, shareAlike: true });
  });

  it('keeps unrecognised licence text and never assumes a credit rule', () => {
    expect(by('Delta')).toMatchObject({ licenceId: null, licenceName: 'Custom terms', licenceUrl: null, credit: null, shareAlike: null });
    expect(by('Epsilon')).toMatchObject({ licenceName: 'Unknown', credit: null, retrievedIso: null });
  });

  it('sorts by label and localizes names', () => {
    expect(en.map((e) => e.sourceLabel.split(' / ')[1])).toEqual(['Alpha', 'Beta <b>', 'Delta', 'Epsilon', 'Gamma']);
    const fr = buildAttributions(sources, 'fr');
    expect(fr.find((e) => e.licenceId === 'OGL-Ontario')?.licenceName).toBe('Licence du gouvernement ouvert – Ontario');
    expect(fr.find((e) => e.sourceLabel.endsWith('Epsilon'))?.licenceName).toBe('Inconnu');
  });
});

describe('creditText', () => {
  it('states required, not required, unknown and share-alike', () => {
    const e = buildAttributions(sources, 'en');
    expect(creditText(e.find((x) => x.licenceId === 'OGL-Ontario')!, 'en')).toBe('Credit required');
    expect(creditText(e.find((x) => x.licenceId === 'CC0-1.0')!, 'en')).toBe('No credit required');
    expect(creditText(e.find((x) => x.licenceId === 'CC-BY-SA-4.0')!, 'en')).toBe('Credit required · Share-alike applies');
    expect(creditText(e.find((x) => x.licenceId === null)!, 'fr')).toBe('Exigence de mention inconnue');
  });
});

describe('renderAttributionHtml', () => {
  it('is an escaped, semantic table with 44px licence links and real dates', () => {
    const html = renderAttributionHtml(buildAttributions(sources, 'en'), 'en');
    expect(html).toContain('<caption>Credits and licences</caption>');
    expect(html).toContain('Places / Beta &lt;b&gt;');
    expect(html).not.toContain('<b>');
    expect(html).toContain('<time datetime="2026-11-01">November 1, 2026</time>');
    expect(html).toContain('min-height:44px');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(scanHtml(html)).toEqual([]);
  });

  it('shows Unknown without a link when licence or date is missing', () => {
    const html = renderAttributionHtml(buildAttributions(sources, 'fr').filter((e) => e.sourceLabel.endsWith('Epsilon')), 'fr');
    expect(html).toContain('<td>Inconnu</td><td>Inconnu</td>');
    expect(html).not.toContain('<a ');
  });
});

describe('renderAttributionText', () => {
  it('writes one line per source, FR with NBSP before colons', () => {
    const en = renderAttributionText(buildAttributions(sources, 'en'), 'en').split('\n');
    expect(en).toHaveLength(5);
    expect(en[0]).toBe(
      'Places / Alpha. Licence: Open Government Licence – Ontario (https://www.ontario.ca/page/open-government-licence-ontario). Retrieved: November 1, 2026.',
    );
    const fr = renderAttributionText(buildAttributions(sources, 'fr'), 'fr');
    for (const line of fr.split('\n')) expect(lintFrench(line.replace(/https?:\/\/\S+/g, ''))).toEqual([]);
  });
});
