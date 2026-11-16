import { describe, expect, it } from 'vitest';
import { CATALOGUE_CONTEXT, auditRegistry, buildCatalogue, catalogueToJson, validateCatalogue } from './index';
import { NOW, RECORDS } from './testkit';

const cat = buildCatalogue(auditRegistry(RECORDS, NOW), NOW);
const find = (id: string) => cat['dcat:dataset'].flatMap((d) => d['prov:wasDerivedFrom']).find((s) => s['@id'].endsWith(`:${id}`))!;

describe('buildCatalogue', () => {
  it('is a DCAT catalogue with both titles and a modified date', () => {
    expect(cat['@type']).toBe('dcat:Catalog');
    expect(cat['@context']).toBe(CATALOGUE_CONTEXT);
    expect(cat['dct:title']).toEqual([
      { '@value': 'Data sources and quality', '@language': 'en' },
      { '@value': 'Sources et qualité des données', '@language': 'fr' },
    ]);
    expect(cat['dct:modified']).toEqual({ '@value': '2026-11-15', '@type': 'xsd:date' });
  });

  it('lists each dataset with its kind, setting and sources', () => {
    expect(cat['dcat:dataset'].map((d) => [d['dct:identifier'], d['ds:kind'], d['ds:staleAfterDays'], d['prov:wasDerivedFrom'].length])).toEqual([['p', 'places', 180, 2], ['r', 'routes', 120, 1]]);
  });

  it('a known source has title, page, licence link and retrieved date', () => {
    expect(find('a')).toMatchObject({
      'dct:title': 'Alpha',
      'dcat:landingPage': { '@id': 'https://example.org/a' },
      'dct:license': { '@id': 'https://www.ontario.ca/page/open-government-licence-ontario' },
      'prov:generatedAtTime': { '@value': '2026-11-01', '@type': 'xsd:date' },
      'ds:licenceOpen': true,
      'ds:state': 'fresh',
      'ds:unknown': ['url'].filter(() => false),
    });
  });

  it('a licence that is not on the open list is kept as text and marked not open', () => {
    expect(find('b')).toMatchObject({ 'dct:license': 'Proprietary', 'ds:licenceOpen': false, 'ds:state': 'stale' });
  });

  it('missing values are left out and named, never filled in', () => {
    const c = find('c');
    expect(c['ds:unknown']).toEqual(['name', 'url', 'licence', 'retrieved']);
    for (const k of ['dct:title', 'dcat:landingPage', 'dct:license', 'prov:generatedAtTime', 'ds:licenceOpen']) expect(k in c, k).toBe(false);
    expect(c['ds:state']).toBe('unknown');
  });

  it('ids with special characters are encoded', () => {
    const odd = buildCatalogue(auditRegistry([{ id: 'a b/c', name: 'N', kind: 'places', sources: [{ id: 'é' }] }], NOW), NOW);
    expect(odd['dcat:dataset'][0]?.['@id']).toBe('urn:data-status:dataset:a%20b%2Fc');
    expect(odd['dcat:dataset'][0]?.['prov:wasDerivedFrom'][0]?.['@id']).toBe('urn:data-status:source:a%20b%2Fc:%C3%A9');
  });

  it('follows custom thresholds', () => {
    const c = buildCatalogue(auditRegistry(RECORDS, NOW, { places: 2000 }), NOW);
    expect(c['dcat:dataset'][0]?.['ds:staleAfterDays']).toBe(2000);
    expect(c['dcat:dataset'][0]?.['prov:wasDerivedFrom'].every((s) => s['ds:state'] !== 'stale')).toBe(true);
  });
});

describe('catalogueToJson / validateCatalogue', () => {
  it('is pretty JSON with a trailing newline that parses back', () => {
    const text = catalogueToJson(cat);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(cat)));
  });
  it('accepts what buildCatalogue makes', () => {
    expect(validateCatalogue(JSON.parse(catalogueToJson(cat)))).toEqual([]);
  });
  it('catches a value that was invented for something Unknown', () => {
    const copy = JSON.parse(catalogueToJson(cat));
    const c = copy['dcat:dataset'][1]['prov:wasDerivedFrom'][0];
    c['dct:license'] = 'CC0-1.0';
    c['ds:licenceOpen'] = true;
    c['ds:state'] = 'fresh';
    expect(validateCatalogue(copy)).toEqual([
      'dataset[1].source[0].dct:license-present-but-listed-unknown',
      'dataset[1].source[0].ds:licenceOpen-must-be-absent-when-licence-unknown',
      'dataset[1].source[0].ds:state-must-be-unknown-when-date-unknown',
    ]);
  });
  it('catches a missing value that is not listed as Unknown', () => {
    const copy = JSON.parse(catalogueToJson(cat));
    delete copy['dcat:dataset'][0]['prov:wasDerivedFrom'][0]['prov:generatedAtTime'];
    expect(validateCatalogue(copy)).toEqual(['dataset[0].source[0].prov:generatedAtTime-missing-but-not-listed-unknown']);
  });
  it('catches wrong shapes', () => {
    expect(validateCatalogue(null)).toEqual(['not an object']);
    expect(validateCatalogue({})).toEqual(['@type', 'dcat:dataset']);
  });
});
