/**
 * One row per record with its source, licence, retrieved date and tier, for use in a
 * spreadsheet. Values are written as recorded; a missing value is written as the word for
 * Unknown, never left looking like an empty string that could be read as "none".
 */
import { toCsv } from './csv';
import type { AuditResult, DatasetRecord } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { t } from './i18n';
import { createTranslator, type Messages } from './localText';
import { buildRecordFacts, type RecordFactRow } from './recordFacts';
import { tierCell } from './tiers';
import { cleanValue } from './unknownTokens';

type Key = 'fc.dataset' | 'fc.recordId' | 'fc.record' | 'fc.source' | 'fc.page' | 'fc.licence' | 'fc.retrieved' | 'fc.status' | 'fc.tier' | 'fc.gaps';

const MESSAGES: Messages<Key> = {
  en: {
    'fc.dataset': 'Dataset',
    'fc.recordId': 'Record ID',
    'fc.record': 'Record',
    'fc.source': 'Source',
    'fc.page': 'Source page',
    'fc.licence': 'Licence',
    'fc.retrieved': 'Retrieved (YYYY-MM-DD)',
    'fc.status': 'Status',
    'fc.tier': 'Tier',
    'fc.gaps': 'Facts that are unknown',
  },
  fr: {
    'fc.dataset': 'Jeu de données',
    'fc.recordId': 'Identifiant',
    'fc.record': 'Enregistrement',
    'fc.source': 'Source',
    'fc.page': 'Page de la source',
    'fc.licence': 'Licence',
    'fc.retrieved': 'Récupération (AAAA-MM-JJ)',
    'fc.status': 'État',
    'fc.tier': 'Niveau',
    'fc.gaps': 'Éléments inconnus',
  },
};

export const FACTS_CSV_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export const FACTS_CSV_COLUMNS: readonly Key[] = ['fc.dataset', 'fc.recordId', 'fc.record', 'fc.source', 'fc.page', 'fc.licence', 'fc.retrieved', 'fc.status', 'fc.tier', 'fc.gaps'];

/** The publisher text for each record, as recorded, keyed by dataset and record id (first one wins). */
function publishers(records: readonly DatasetRecord[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const r of records) {
    for (const s of r.sources) {
      const k = `${r.id}\u0000${s.id}`;
      if (!m.has(k)) m.set(k, cleanValue(s.source));
    }
  }
  return m;
}

export function buildFactsRows(records: readonly DatasetRecord[], audit: AuditResult, locale: Locale): string[][] {
  const unknown = t(locale, 'unknown');
  const pub = publishers(records);
  const facts = buildRecordFacts(records, audit, 0);
  const row = (r: RecordFactRow): string[] => {
    const s = r.source;
    return [
      s.datasetName,
      s.sourceId,
      s.name ?? unknown,
      pub.get(`${s.datasetId}\u0000${s.sourceId}`) ?? unknown,
      s.url ?? unknown,
      s.licence ?? unknown,
      // A future date is on record but not usable, so it is written as Unknown, as on the panel.
      s.ageDays === null || s.retrievedIso === null ? unknown : s.retrievedIso,
      t(locale, `state.${s.state}`),
      tierCell(r.tier, locale),
      String(r.missing.length),
    ];
  };
  return [FACTS_CSV_COLUMNS.map((k) => tx(locale, k)), ...facts.all.map(row)];
}

export function buildFactsCsv(records: readonly DatasetRecord[], audit: AuditResult, locale: Locale, bom = true): string {
  return toCsv(buildFactsRows(records, audit, locale), bom);
}
