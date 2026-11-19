/**
 * Status counted within each tier: for the records at each tier, how many are within their
 * review period, how many may be out of date, and how many have no usable date. It is a count
 * of what is recorded and makes no claim about which tier is more reliable.
 */
import type { AuditResult } from './datasetRegistry';
import type { FreshnessState, Locale } from './dataStatus';
import { t } from './i18n';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';
import { tierLabel } from './tiers';
import { TIER_IDS, type TierId } from './tierValue';

export const STATUS_COLUMNS: readonly FreshnessState[] = ['fresh', 'stale', 'unknown'];

export interface StatusByTierRow {
  /** null is the row for records with no usable tier. */
  tier: TierId | null;
  counts: Record<FreshnessState, number>;
  total: number;
}

export interface StatusByTier {
  /** One row for each tier in use, in the fixed tier order, then the Unknown row when it has records. */
  rows: StatusByTierRow[];
  totals: Record<FreshnessState, number>;
  total: number;
}

const zero = (): Record<FreshnessState, number> => ({ fresh: 0, stale: 0, unknown: 0 });

export function buildStatusByTier(audit: AuditResult): StatusByTier {
  const byTier = new Map<TierId | null, StatusByTierRow>();
  const totals = zero();
  for (const s of audit.sources) {
    let row = byTier.get(s.tier);
    if (row === undefined) {
      row = { tier: s.tier, counts: zero(), total: 0 };
      byTier.set(s.tier, row);
    }
    row.counts[s.state] += 1;
    row.total += 1;
    totals[s.state] += 1;
  }
  const rows: StatusByTierRow[] = [];
  for (const id of TIER_IDS) {
    const row = byTier.get(id);
    if (row !== undefined) rows.push(row);
  }
  const unknown = byTier.get(null);
  if (unknown !== undefined) rows.push(unknown);
  return { rows, totals, total: audit.sources.length };
}

type Key = 'st.title' | 'st.intro' | 'st.none' | 'st.caption' | 'st.colTier' | 'st.colTotal' | 'st.rowTotal';

const MESSAGES: Messages<Key> = {
  en: {
    'st.title': 'Status within each tier',
    'st.intro': 'Each record is counted once, in the row for its tier and the column for its status.',
    'st.none': 'There are no records to count.',
    'st.caption': 'Records by tier and status',
    'st.colTier': 'Tier',
    'st.colTotal': 'All records',
    'st.rowTotal': 'All tiers',
  },
  fr: {
    'st.title': 'État selon le niveau',
    'st.intro': 'Chaque enregistrement est compté une seule fois, dans la ligne de son niveau et la colonne de son état.',
    'st.none': 'Il n’y a aucun enregistrement à compter.',
    'st.caption': 'Enregistrements selon le niveau et l’état',
    'st.colTier': 'Niveau',
    'st.colTotal': 'Tous les enregistrements',
    'st.rowTotal': 'Tous les niveaux',
  },
};

export const STATUS_BY_TIER_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

/** An extra last row: a row heading and one cell of ready-made HTML for each status column. */
export interface StatusColumnExtra {
  heading: string;
  cell: (state: FreshnessState) => string;
}

/** With `extra`, a status that no record has gets an empty cell. */
export function renderStatusByTierHtml(b: StatusByTier, locale: Locale, extra?: StatusColumnExtra): string {
  const heading = `<h2 id="ds-statustier-title">${escapeHtml(tx(locale, 'st.title'))}</h2>`;
  if (b.total === 0) return `<section aria-labelledby="ds-statustier-title">${heading}<p>${escapeHtml(tx(locale, 'st.none'))}</p></section>`;
  const cells = (counts: Record<FreshnessState, number>, total: number) => STATUS_COLUMNS.map((s) => `<td>${counts[s]}</td>`).join('') + `<td>${total}</td>`;
  const rows = b.rows.map((r) => `<tr><th scope="row">${escapeHtml(tierLabel(r.tier, locale))}</th>${cells(r.counts, r.total)}</tr>`).join('');
  const head = STATUS_COLUMNS.map((s) => `<th scope="col">${escapeHtml(t(locale, `state.${s}`))}</th>`).join('');
  return (
    `<section aria-labelledby="ds-statustier-title">${heading}<p>${escapeHtml(tx(locale, 'st.intro'))}</p>` +
    `<table><caption>${escapeHtml(tx(locale, 'st.caption'))}</caption><thead><tr><th scope="col">${escapeHtml(tx(locale, 'st.colTier'))}</th>${head}` +
    `<th scope="col">${escapeHtml(tx(locale, 'st.colTotal'))}</th></tr></thead><tbody>${rows}</tbody>` +
    `<tfoot><tr><th scope="row">${escapeHtml(tx(locale, 'st.rowTotal'))}</th>${cells(b.totals, b.total)}</tr>` +
    (extra ? `<tr><th scope="row">${escapeHtml(extra.heading)}</th>${STATUS_COLUMNS.map((s) => `<td>${b.totals[s] > 0 ? extra.cell(s) : ''}</td>`).join('')}<td></td></tr>` : '') +
    `</tfoot></table></section>`
  );
}
