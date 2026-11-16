/**
 * Per-source licence + retrieved-date list (data-status round 2).
 * Pure model plus a small accessible HTML renderer. Unknown stays UNKNOWN.
 */
import { dataBadge, type FreshnessState, type Locale, type Provenance, type ProvenanceIssue } from './dataStatus.ts';

export interface SourceInput extends Provenance {
  id: string;
  name?: string | null;
  /** Public page for the source; only http(s) links are kept. */
  url?: string | null;
}

export interface SourceRow {
  id: string;
  name: string;
  url: string | null;
  licence: string;
  /** true = on the open list, false = present but not on it, null = licence unknown. */
  licenceOpen: boolean | null;
  /** ISO date (YYYY-MM-DD) or the localized Unknown text. */
  retrieved: string;
  retrievedIso: string | null;
  state: FreshnessState;
  statusLabel: string;
  issues: ProvenanceIssue[];
  duplicateId: boolean;
}


const T = {
  en: {
    unknown: 'Unknown',
    unknownSource: 'Unknown source',
    caption: 'Data sources',
    colSource: 'Source',
    colLicence: 'Licence',
    colRetrieved: 'Retrieved',
    colStatus: 'Status',
    review: 'Licence needs review',
    empty: 'No data sources listed.',
    sep: ' · ',
  },
  fr: {
    unknown: 'Inconnue',
    unknownSource: 'Source inconnue',
    caption: 'Sources de données',
    colSource: 'Source',
    colLicence: 'Licence',
    colRetrieved: 'Date de récupération',
    colStatus: 'État',
    review: 'Licence à examiner',
    empty: 'Aucune source de données listée.',
    sep: ' · ',
  },
} as const;

function clean(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function safeUrl(v: string | null | undefined): string | null {
  const u = clean(v);
  if (u === null) return null;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : null;
  } catch {
    return null;
  }
}

/** Build one row per source, sorted by name (then id). Nothing is inferred. */
export function buildSourceList(sources: readonly SourceInput[], locale: Locale, now: Date): SourceRow[] {
  const t = T[locale];
  const counts = new Map<string, number>();
  for (const s of sources) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);

  const rows = sources.map((s): SourceRow => {
    const badge = dataBadge(s, locale, now);
    const licence = clean(s.licence);
    const iso = clean(s.retrievedAt) !== null && !badge.issues.includes('invalid-date') && !badge.issues.includes('missing-date')
      ? (clean(s.retrievedAt) as string).slice(0, 10)
      : null;
    return {
      id: s.id,
      name: clean(s.name) ?? t.unknownSource,
      url: safeUrl(s.url),
      licence: licence ?? t.unknown,
      licenceOpen: licence === null ? null : badge.licence === 'open',
      retrieved: iso ?? t.unknown,
      retrievedIso: iso,
      state: badge.state,
      statusLabel: badge.label,
      issues: badge.issues,
      duplicateId: (counts.get(s.id) ?? 0) > 1,
    };
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name, locale) || a.id.localeCompare(b.id));
}

export function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the list as a semantic table. Status is always text (never colour alone);
 * links get a 44px minimum target.
 */
export function renderSourceListHtml(rows: readonly SourceRow[], locale: Locale): string {
  const t = T[locale];
  if (rows.length === 0) return `<p>${escapeHtml(t.empty)}</p>`;
  const link = (r: SourceRow) =>
    r.url === null
      ? escapeHtml(r.name)
      : `<a href="${escapeHtml(r.url)}" rel="noopener noreferrer" style="display:inline-block;min-width:44px;min-height:44px;line-height:44px">${escapeHtml(r.name)}</a>`;
  const body = rows
    .map((r) => {
      const date =
        r.retrievedIso === null
          ? escapeHtml(r.retrieved)
          : `<time datetime="${escapeHtml(r.retrievedIso)}">${escapeHtml(r.retrieved)}</time>`;
      const status = [r.statusLabel, ...(r.licenceOpen === false ? [t.review] : [])].map(escapeHtml).join(t.sep);
      return `<tr><th scope="row">${link(r)}</th><td>${escapeHtml(r.licence)}</td><td>${date}</td><td>${status}</td></tr>`;
    })
    .join('');
  return (
    `<table><caption>${escapeHtml(t.caption)}</caption><thead><tr>` +
    `<th scope="col">${escapeHtml(t.colSource)}</th><th scope="col">${escapeHtml(t.colLicence)}</th>` +
    `<th scope="col">${escapeHtml(t.colRetrieved)}</th><th scope="col">${escapeHtml(t.colStatus)}</th>` +
    `</tr></thead><tbody>${body}</tbody></table>`
  );
}

