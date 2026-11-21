/**
 * Credits page model: one entry per source with the licence name, a reference link,
 * whether credit is required, and the retrieved date. Licences that are not in the
 * table keep their recorded text; licences not recorded show Unknown. No credit
 * requirement is ever assumed for an unrecognised licence.
 */
import type { AuditedSource } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { formatDisplayDate } from './locale';
import { licenceInfo, normaliseLicence } from './licences';
import { t } from './i18n';
import { escapeHtml } from './sourceList';

export interface AttributionEntry {
  sourceLabel: string;
  licenceId: string | null;
  licenceName: string;
  licenceUrl: string | null;
  /** true = credit required, false = not required, null = unknown. */
  credit: boolean | null;
  shareAlike: boolean | null;
  retrievedIso: string | null;
}

export function buildAttributions(sources: readonly AuditedSource[], locale: Locale): AttributionEntry[] {
  return sources
    .map((s): AttributionEntry => {
      const match = normaliseLicence(s.licence);
      const info = licenceInfo(match.id);
      return {
        sourceLabel: `${s.datasetName} / ${s.name ?? t(locale, 'unknownName')}`,
        licenceId: info?.id ?? null,
        licenceName: info ? info.name[locale] : (s.licence ?? t(locale, 'unknown')),
        licenceUrl: info?.url ?? null,
        credit: info ? info.attribution : null,
        shareAlike: info ? info.shareAlike : null,
        retrievedIso: s.retrievedIso,
      };
    })
    .sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel, locale));
}

export function creditText(e: AttributionEntry, locale: Locale): string {
  const base =
    e.credit === null
      ? t(locale, 'attr.creditUnknown')
      : e.credit
        ? t(locale, 'attr.creditRequired')
        : t(locale, 'attr.noCredit');
  return e.shareAlike ? `${base} · ${t(locale, 'attr.shareAlike')}` : base;
}

export function renderAttributionHtml(entries: readonly AttributionEntry[], locale: Locale): string {
  const rows = entries
    .map((e) => {
      const licence =
        e.licenceUrl === null
          ? escapeHtml(e.licenceName)
          : `<a href="${escapeHtml(e.licenceUrl)}" rel="noopener noreferrer" style="display:inline-block;min-width:44px;min-height:44px;line-height:44px">${escapeHtml(e.licenceName)}</a>`;
      const date =
        e.retrievedIso === null
          ? escapeHtml(t(locale, 'unknown'))
          : `<time datetime="${escapeHtml(e.retrievedIso)}">${escapeHtml(formatDisplayDate(e.retrievedIso, locale))}</time>`;
      return `<tr><th scope="row">${escapeHtml(e.sourceLabel)}</th><td>${licence}</td><td>${date}</td><td>${escapeHtml(creditText(e, locale))}</td></tr>`;
    })
    .join('');
  return (
    `<table><caption>${escapeHtml(t(locale, 'attr.title'))}</caption><thead><tr>` +
    `<th scope="col">${escapeHtml(t(locale, 'tbl.source'))}</th><th scope="col">${escapeHtml(t(locale, 'tbl.licence'))}</th>` +
    `<th scope="col">${escapeHtml(t(locale, 'tbl.retrieved'))}</th><th scope="col">${escapeHtml(t(locale, 'attr.credit'))}</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>`
  );
}

/** Plain-text credits, one line per source, for copying into a notice. */
export function renderAttributionText(entries: readonly AttributionEntry[], locale: Locale): string {
  return entries
    .map((e) =>
      t(locale, 'attr.line', {
        source: e.sourceLabel,
        licence: e.licenceUrl === null ? e.licenceName : `${e.licenceName} (${e.licenceUrl})`,
        date: formatDisplayDate(e.retrievedIso, locale),
      }),
    )
    .join('\n');
}
