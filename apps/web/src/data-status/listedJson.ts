/**
 * The listed sources as a JSON file: one object per source with its source, licence, retrieved
 * date and tier, in the order on screen. A fact that is not known is written as the token
 * UNKNOWN, never as an empty string, a zero or a guess. Numbers that cannot be worked out are null.
 */
import type { AuditedSource, AuditResult } from './datasetRegistry';
import { licenceKind, type Locale } from './dataStatus';
import { applyFilters, daysUntilReview, GAP_FIELDS, hasGap, serializeFilters, type Filters, type GapField } from './filters';
import { createTranslator, type Messages } from './localText';
import { reviewDateIso } from './rowDetail';
import { applySort, type SortSpec } from './sorting';
import { UNKNOWN_WORD } from './unknownWord';

export const LISTED_JSON_VERSION = 1;

export interface ListedJsonSource {
  datasetId: string;
  dataset: string;
  kind: string;
  sourceId: string;
  /** The name recorded for the source, or UNKNOWN. */
  source: string;
  /** The page the source was taken from, or UNKNOWN. */
  page: string;
  licence: string;
  licenceType: string;
  /** YYYY-MM-DD, or UNKNOWN when there is no usable retrieved date. */
  retrieved: string;
  /** 0 to 4 or E as text, or UNKNOWN. */
  tier: string;
  status: string;
  ageDays: number | null;
  /** YYYY-MM-DD, or UNKNOWN when nothing is scheduled. */
  reviewDate: string;
  daysUntilReview: number | null;
  /** Which of source, licence, date and tier are not known for this source. */
  unknownFacts: GapField[];
}

export interface ListedJson {
  version: number;
  generatedAt: string;
  locale: Locale;
  unknownToken: string;
  /** The filters as a query string, empty when none is set. */
  filters: string;
  total: number;
  listed: number;
  sources: ListedJsonSource[];
}

function orUnknown(v: string | null): string {
  return v === null || v.trim() === '' ? UNKNOWN_WORD : v;
}

export function listedJsonSource(s: AuditedSource): ListedJsonSource {
  const kind = licenceKind(s.licence);
  return {
    datasetId: s.datasetId,
    dataset: s.datasetName,
    kind: s.kind,
    sourceId: s.sourceId,
    source: orUnknown(s.name),
    page: orUnknown(s.url),
    licence: orUnknown(s.licence),
    licenceType: kind === 'unknown' ? UNKNOWN_WORD : kind,
    // A date in the future is kept on the record but is not a usable retrieved date.
    retrieved: s.state === 'unknown' ? UNKNOWN_WORD : orUnknown(s.retrievedIso),
    tier: s.tier ?? UNKNOWN_WORD,
    status: s.state === 'unknown' ? UNKNOWN_WORD : s.state,
    ageDays: s.ageDays,
    reviewDate: reviewDateIso(s) ?? UNKNOWN_WORD,
    daysUntilReview: daysUntilReview(s),
    unknownFacts: GAP_FIELDS.filter((g) => hasGap(s, g)),
  };
}

export function buildListedJson(audit: AuditResult, filters: Filters, now: Date, locale: Locale, sort: SortSpec | null = null): ListedJson {
  const listed = applySort(applyFilters(audit.sources, filters), sort, locale);
  return {
    version: LISTED_JSON_VERSION,
    generatedAt: now.toISOString(),
    locale,
    unknownToken: UNKNOWN_WORD,
    filters: serializeFilters(filters),
    total: audit.sources.length,
    listed: listed.length,
    sources: listed.map(listedJsonSource),
  };
}

/** Two-space indented JSON with a final newline. The same input always gives the same text. */
export function listedJsonText(doc: ListedJson): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export const LISTED_JSON_ACTION = 'export-listed-json';
export const LISTED_JSON_FILENAME = 'listed-sources.json';

export interface ListedJsonFile {
  filename: string;
  mime: string;
  text: string;
}

export function buildListedJsonFile(audit: AuditResult, filters: Filters, now: Date, locale: Locale, sort: SortSpec | null = null): ListedJsonFile {
  return { filename: LISTED_JSON_FILENAME, mime: 'application/json;charset=utf-8', text: listedJsonText(buildListedJson(audit, filters, now, locale, sort)) };
}

type Key = 'lj.label' | 'lj.said.one' | 'lj.said.other' | 'lj.saidNone';

const MESSAGES: Messages<Key> = {
  en: {
    'lj.label': 'Download the listed sources (JSON)',
    'lj.said.one': 'File saved with {n} source.',
    'lj.said.other': 'File saved with {n} sources.',
    'lj.saidNone': 'File saved. No source is listed, so it holds none.',
  },
  fr: {
    'lj.label': 'Télécharger les sources de la liste (JSON)',
    'lj.said.one': 'Fichier enregistré avec {n} source.',
    'lj.said.other': 'Fichier enregistré avec {n} sources.',
    'lj.saidNone': 'Fichier enregistré. Aucune source n’est dans la liste, il n’en contient donc aucune.',
  },
};

export const LISTED_JSON_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function listedJsonLabel(locale: Locale): string {
  return tx(locale, 'lj.label');
}

export function describeListedJsonSaved(listed: number, locale: Locale): string {
  return listed === 0 ? tx(locale, 'lj.saidNone') : tx.count(locale, 'lj.said', listed);
}
