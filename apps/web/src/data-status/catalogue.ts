/**
 * Open-data catalogue of the sources the App uses, as JSON-LD (DCAT vocabulary).
 * Only recorded facts are written. A missing value is left out and named in
 * `ds:unknown`; it is never replaced by an empty string, a zero or a guess.
 */
import type { AuditResult, AuditedSource } from './datasetRegistry';
import { licenceInfo } from './licences';
import { t } from './i18n';

export const CATALOGUE_CONTEXT = {
  dcat: 'http://www.w3.org/ns/dcat#',
  dct: 'http://purl.org/dc/terms/',
  prov: 'http://www.w3.org/ns/prov#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  ds: 'urn:data-status:terms:',
} as const;

export type UnknownField = 'name' | 'url' | 'licence' | 'retrieved';

export interface CatalogueSource {
  '@id': string;
  '@type': 'prov:Entity';
  'dct:title'?: string;
  'dcat:landingPage'?: { '@id': string };
  'dct:license'?: { '@id': string } | string;
  'prov:generatedAtTime'?: { '@value': string; '@type': 'xsd:date' };
  'ds:licenceOpen'?: boolean;
  'ds:state': 'fresh' | 'stale' | 'unknown';
  'ds:unknown': UnknownField[];
}

export interface CatalogueDataset {
  '@id': string;
  '@type': 'dcat:Dataset';
  'dct:identifier': string;
  'dct:title': string;
  'ds:kind': string;
  'ds:staleAfterDays': number;
  'prov:wasDerivedFrom': CatalogueSource[];
}

export interface Catalogue {
  '@context': typeof CATALOGUE_CONTEXT;
  '@type': 'dcat:Catalog';
  'dct:title': { '@value': string; '@language': 'en' | 'fr' }[];
  'dct:modified': { '@value': string; '@type': 'xsd:date' };
  'dcat:dataset': CatalogueDataset[];
}

function sourceEntry(s: AuditedSource): CatalogueSource {
  const unknown: UnknownField[] = [];
  const out: CatalogueSource = { '@id': `urn:data-status:source:${encodeURIComponent(s.datasetId)}:${encodeURIComponent(s.sourceId)}`, '@type': 'prov:Entity', 'ds:state': s.state, 'ds:unknown': unknown };
  if (s.name === null) unknown.push('name');
  else out['dct:title'] = s.name;
  if (s.url === null) unknown.push('url');
  else out['dcat:landingPage'] = { '@id': s.url };
  if (s.licence === null) unknown.push('licence');
  else {
    const info = licenceInfo(s.licence);
    out['dct:license'] = info ? { '@id': info.url } : s.licence;
    if (s.licenceOpen !== null) out['ds:licenceOpen'] = s.licenceOpen;
  }
  if (s.retrievedIso === null) unknown.push('retrieved');
  else out['prov:generatedAtTime'] = { '@value': s.retrievedIso, '@type': 'xsd:date' };
  return out;
}

export function buildCatalogue(audit: AuditResult, now: Date): Catalogue {
  return {
    '@context': CATALOGUE_CONTEXT,
    '@type': 'dcat:Catalog',
    'dct:title': [
      { '@value': t('en', 'page.title'), '@language': 'en' },
      { '@value': t('fr', 'page.title'), '@language': 'fr' },
    ],
    'dct:modified': { '@value': now.toISOString().slice(0, 10), '@type': 'xsd:date' },
    'dcat:dataset': audit.datasets.map((d, i) => ({
      '@id': `urn:data-status:dataset:${encodeURIComponent(d.id)}`,
      '@type': 'dcat:Dataset',
      'dct:identifier': d.id,
      'dct:title': d.name,
      'ds:kind': d.kind,
      'ds:staleAfterDays': d.staleAfterDays,
      // Datasets that share an id (already reported as duplicates) list the shared sources once, under the first.
      'prov:wasDerivedFrom': audit.datasets.findIndex((x) => x.id === d.id) === i ? audit.sources.filter((s) => s.datasetId === d.id).map(sourceEntry) : [],
    })),
  };
}

export function catalogueToJson(c: Catalogue): string {
  return `${JSON.stringify(c, null, 2)}\n`;
}

/** Problems found in a catalogue (empty when it is well formed and never invents a value). */
export function validateCatalogue(value: unknown): string[] {
  const bad: string[] = [];
  const o = value as Record<string, unknown> | null;
  if (typeof o !== 'object' || o === null) return ['not an object'];
  if (o['@type'] !== 'dcat:Catalog') bad.push('@type');
  if (!Array.isArray(o['dcat:dataset'])) return [...bad, 'dcat:dataset'];
  (o['dcat:dataset'] as Record<string, unknown>[]).forEach((d, i) => {
    if (typeof d['dct:identifier'] !== 'string') bad.push(`dataset[${i}].dct:identifier`);
    const srcs = d['prov:wasDerivedFrom'];
    if (!Array.isArray(srcs)) return bad.push(`dataset[${i}].prov:wasDerivedFrom`);
    (srcs as Record<string, unknown>[]).forEach((s, j) => {
      const at = `dataset[${i}].source[${j}]`;
      const unknown = s['ds:unknown'];
      if (!Array.isArray(unknown)) return bad.push(`${at}.ds:unknown`);
      const has = (k: UnknownField) => (unknown as unknown[]).includes(k);
      const pairs: [UnknownField, string][] = [['name', 'dct:title'], ['url', 'dcat:landingPage'], ['licence', 'dct:license'], ['retrieved', 'prov:generatedAtTime']];
      for (const [field, key] of pairs) {
        if (has(field) && key in s) bad.push(`${at}.${key}-present-but-listed-unknown`);
        if (!has(field) && !(key in s)) bad.push(`${at}.${key}-missing-but-not-listed-unknown`);
      }
      if (has('licence') && 'ds:licenceOpen' in s) bad.push(`${at}.ds:licenceOpen-must-be-absent-when-licence-unknown`);
      if (has('retrieved') && s['ds:state'] !== 'unknown') bad.push(`${at}.ds:state-must-be-unknown-when-date-unknown`);
    });
  });
  return bad;
}
