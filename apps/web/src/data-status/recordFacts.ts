/**
 * The four facts every record should carry: a source, a licence, a retrieved date and a tier.
 * This lists the records that are missing one or more of them and says which. It reports gaps
 * only; a missing fact stays Unknown and is never filled in.
 */
import { isFieldKnown } from './completeness';
import type { AuditResult, AuditedSource, DatasetRecord } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';
import { readTiers, type TierRead } from './tiers';

export const FACT_FIELDS = ['source', 'licence', 'date', 'tier'] as const;
export type FactField = (typeof FACT_FIELDS)[number];

export const MAX_FACT_ROWS = 25;

export interface RecordFactRow {
  source: AuditedSource;
  tier: TierRead;
  missing: FactField[];
}

export interface DatasetFacts {
  datasetId: string;
  datasetName: string;
  total: number;
  complete: number;
  missingBy: Record<FactField, number>;
}

export interface RecordFacts {
  total: number;
  /** Records that carry all four facts. */
  complete: number;
  /** How many records are missing each fact. */
  missingBy: Record<FactField, number>;
  /** The same counts for each dataset, in audit order. Datasets that share an id form one entry. */
  datasets: DatasetFacts[];
  /** Every record with its facts, in audit order. */
  all: RecordFactRow[];
  /** Records missing at least one fact, most gaps first, at most the limit. */
  rows: RecordFactRow[];
  hidden: number;
}

const key = (datasetId: string, sourceId: string): string => `${datasetId}\u0000${sourceId}`;

export function buildRecordFacts(records: readonly DatasetRecord[], audit: AuditResult, limit: number = MAX_FACT_ROWS): RecordFacts {
  // Records that share a dataset id and a source id cannot be told apart; the first tier read is used for each.
  const tiers = new Map<string, TierRead>();
  for (const rec of readTiers(records)) {
    const k = key(rec.datasetId, rec.sourceId);
    if (!tiers.has(k)) tiers.set(k, rec.read);
  }
  const missingBy: Record<FactField, number> = { source: 0, licence: 0, date: 0, tier: 0 };
  const all: RecordFactRow[] = audit.sources.map((s) => {
    const tier = tiers.get(key(s.datasetId, s.sourceId)) ?? { kind: 'unknown' };
    const missing: FactField[] = [];
    if (!isFieldKnown(s, 'source')) missing.push('source');
    if (!isFieldKnown(s, 'licence')) missing.push('licence');
    if (!isFieldKnown(s, 'retrieved')) missing.push('date');
    if (tier.kind !== 'tier') missing.push('tier');
    for (const f of missing) missingBy[f] += 1;
    return { source: s, tier, missing };
  });
  const byDataset = new Map<string, DatasetFacts>();
  for (const row of all) {
    let d = byDataset.get(row.source.datasetId);
    if (d === undefined) {
      d = { datasetId: row.source.datasetId, datasetName: row.source.datasetName, total: 0, complete: 0, missingBy: { source: 0, licence: 0, date: 0, tier: 0 } };
      byDataset.set(row.source.datasetId, d);
    }
    d.total += 1;
    if (row.missing.length === 0) d.complete += 1;
    for (const f of row.missing) d.missingBy[f] += 1;
  }
  const incomplete = all
    .map((row, index) => ({ row, index }))
    .filter((x) => x.row.missing.length > 0)
    .sort((a, b) => b.row.missing.length - a.row.missing.length || a.index - b.index)
    .map((x) => x.row);
  const cap = Math.max(0, Math.trunc(limit));
  return {
    total: all.length,
    complete: all.length - incomplete.length,
    missingBy,
    datasets: [...byDataset.values()],
    all,
    rows: incomplete.slice(0, cap),
    hidden: Math.max(0, incomplete.length - cap),
  };
}

type Key =
  | 'rf.title'
  | 'rf.intro'
  | 'rf.none'
  | 'rf.allComplete'
  | 'rf.summary'
  | 'rf.caption'
  | 'rf.colRecord'
  | 'rf.f.source'
  | 'rf.f.licence'
  | 'rf.f.date'
  | 'rf.f.tier'
  | 'rf.recorded'
  | 'rf.missing'
  | 'rf.more.one'
  | 'rf.more.other'
  | 'rf.countsCaption'
  | 'rf.colFact'
  | 'rf.colMissing'
  | 'rf.dsCaption'
  | 'rf.colDataset'
  | 'rf.colRecords'
  | 'rf.colComplete';

const MESSAGES: Messages<Key> = {
  en: {
    'rf.title': 'Source, licence, date and tier for each record',
    'rf.intro': 'Every record should carry all four. The table lists the records that are missing at least one, with the most gaps first.',
    'rf.none': 'There are no records to check.',
    'rf.allComplete': 'Every record carries a source, a licence, a retrieved date and a tier.',
    'rf.summary': 'Records that carry all four: {complete} of {total}.',
    'rf.caption': 'Records with a missing source, licence, date or tier',
    'rf.colRecord': 'Record',
    'rf.f.source': 'Source',
    'rf.f.licence': 'Licence',
    'rf.f.date': 'Retrieved date',
    'rf.f.tier': 'Tier',
    'rf.recorded': 'Recorded',
    'rf.missing': 'Unknown',
    'rf.more.one': '{n} more record with a gap is not listed.',
    'rf.more.other': '{n} more records with a gap are not listed.',
    'rf.countsCaption': 'Records missing each fact',
    'rf.colFact': 'Fact',
    'rf.colMissing': 'Records where it is unknown',
    'rf.dsCaption': 'Unknown facts for each dataset',
    'rf.colDataset': 'Dataset',
    'rf.colRecords': 'Records',
    'rf.colComplete': 'With all four',
  },
  fr: {
    'rf.title': 'Source, licence, date et niveau de chaque enregistrement',
    'rf.intro': 'Chaque enregistrement devrait comporter les quatre. Le tableau présente les enregistrements auxquels il en manque au moins un, en commençant par ceux qui ont le plus de lacunes.',
    'rf.none': 'Il n’y a aucun enregistrement à examiner.',
    'rf.allComplete': 'Chaque enregistrement comporte une source, une licence, une date de récupération et un niveau.',
    'rf.summary': 'Enregistrements qui comportent les quatre\u00A0: {complete} sur {total}.',
    'rf.caption': 'Enregistrements sans source, licence, date ou niveau',
    'rf.colRecord': 'Enregistrement',
    'rf.f.source': 'Source',
    'rf.f.licence': 'Licence',
    'rf.f.date': 'Date de récupération',
    'rf.f.tier': 'Niveau',
    'rf.recorded': 'Inscrit',
    'rf.missing': 'Inconnu',
    'rf.more.one': '{n} autre enregistrement ayant une lacune n’est pas affiché.',
    'rf.more.other': '{n} autres enregistrements ayant une lacune ne sont pas affichés.',
    'rf.countsCaption': 'Enregistrements auxquels il manque chaque élément',
    'rf.colFact': 'Élément',
    'rf.colMissing': 'Enregistrements où il est inconnu',
    'rf.dsCaption': 'Éléments inconnus pour chaque jeu de données',
    'rf.colDataset': 'Jeu de données',
    'rf.colRecords': 'Enregistrements',
    'rf.colComplete': 'Avec les quatre',
  },
};

export const RECORD_FACT_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function factLabel(field: FactField, locale: Locale): string {
  return tx(locale, `rf.f.${field}`);
}

export function factsSummary(f: RecordFacts, locale: Locale): string {
  return tx(locale, 'rf.summary', { complete: f.complete, total: f.total });
}

function recordName(s: AuditedSource): string {
  return `${s.datasetName} / ${s.name ?? s.sourceId}`;
}

export function renderRecordFactsHtml(f: RecordFacts, locale: Locale): string {
  const heading = `<h2 id="ds-facts-title">${escapeHtml(tx(locale, 'rf.title'))}</h2>`;
  const open = `<section aria-labelledby="ds-facts-title">${heading}`;
  if (f.total === 0) return `${open}<p>${escapeHtml(tx(locale, 'rf.none'))}</p></section>`;
  const summary = `<p>${escapeHtml(factsSummary(f, locale))}</p>`;
  if (f.complete === f.total) return `${open}${summary}<p>${escapeHtml(tx(locale, 'rf.allComplete'))}</p></section>`;
  const cell = (row: RecordFactRow, field: FactField) => `<td>${escapeHtml(tx(locale, row.missing.includes(field) ? 'rf.missing' : 'rf.recorded'))}</td>`;
  const rows = f.rows
    .map((row) => `<tr><th scope="row">${escapeHtml(recordName(row.source))}</th>${FACT_FIELDS.map((field) => cell(row, field)).join('')}</tr>`)
    .join('');
  const counts = FACT_FIELDS.map((field) => `<tr><th scope="row">${escapeHtml(factLabel(field, locale))}</th><td>${f.missingBy[field]}</td></tr>`).join('');
  const datasets = f.datasets
    .map(
      (d) =>
        `<tr><th scope="row">${escapeHtml(d.datasetName)}</th><td>${d.total}</td><td>${d.complete}</td>${FACT_FIELDS.map((field) => `<td>${d.missingBy[field]}</td>`).join('')}</tr>`,
    )
    .join('');
  return (
    `${open}<p>${escapeHtml(tx(locale, 'rf.intro'))}</p>${summary}` +
    `<table><caption>${escapeHtml(tx(locale, 'rf.countsCaption'))}</caption><thead><tr><th scope="col">${escapeHtml(tx(locale, 'rf.colFact'))}</th>` +
    `<th scope="col">${escapeHtml(tx(locale, 'rf.colMissing'))}</th></tr></thead><tbody>${counts}</tbody></table>` +
    `<table><caption>${escapeHtml(tx(locale, 'rf.dsCaption'))}</caption><thead><tr><th scope="col">${escapeHtml(tx(locale, 'rf.colDataset'))}</th>` +
    `<th scope="col">${escapeHtml(tx(locale, 'rf.colRecords'))}</th><th scope="col">${escapeHtml(tx(locale, 'rf.colComplete'))}</th>` +
    FACT_FIELDS.map((field) => `<th scope="col">${escapeHtml(factLabel(field, locale))}</th>`).join('') +
    `</tr></thead><tbody>${datasets}</tbody></table>` +
    (f.rows.length === 0
      ? ''
      : `<table><caption>${escapeHtml(tx(locale, 'rf.caption'))}</caption><thead><tr><th scope="col">${escapeHtml(tx(locale, 'rf.colRecord'))}</th>` +
        FACT_FIELDS.map((field) => `<th scope="col">${escapeHtml(factLabel(field, locale))}</th>`).join('') +
        `</tr></thead><tbody>${rows}</tbody></table>`) +
    (f.hidden > 0 ? `<p>${escapeHtml(tx.count(locale, 'rf.more', f.hidden))}</p>` : '') +
    '</section>'
  );
}
