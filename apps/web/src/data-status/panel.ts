/**
 * Data-status panel: QA report, dataset and source tables, optional attribute coverage,
 * offline saved copy and CSV export. `mountDataStatusPanel` is the integration point
 * for an app shell; everything else is pure and testable.
 */
import { badgeInlineStyle, buttonInlineStyle } from './a11y';
import { coverageTable, type AttributeDef } from './coverage';
import { auditRegistry, type AuditResult, type DatasetRecord } from './datasetRegistry';
import type { FreshnessState, Locale } from './dataStatus';
import { auditedSourcesToCsv } from './csv';
import { t } from './i18n';
import { buildQaReport, renderQaReportHtml } from './qaReport';
import { createSnapshot, type SnapshotStore } from './snapshot';
import { escapeHtml } from './sourceList';

export type SnapshotNote = 'none' | 'unreadable' | null;

export interface PanelState {
  records: readonly DatasetRecord[];
  locale: Locale;
  now: Date;
  /** Set only when the shown data came from the saved copy. */
  snapshotSavedAt?: string | null;
  snapshotNote?: SnapshotNote;
  attributes?: readonly AttributeDef[];
  /** Raw attribute values per record, used for the coverage table. */
  attributeRecords?: readonly Readonly<Record<string, unknown>>[];
}

const esc = escapeHtml;

function statusBadge(state: FreshnessState, locale: Locale): string {
  return `<span style="${badgeInlineStyle(state)}">${esc(t(locale, `state.${state}`))}</span>`;
}

function datasetTable(audit: AuditResult, locale: Locale): string {
  const rows = audit.datasets
    .map(
      (d) =>
        `<tr><th scope="row">${esc(d.name)}</th><td>${d.sourceCount}</td><td>${statusBadge(d.state, locale)}</td></tr>`,
    )
    .join('');
  return (
    `<table><caption>${esc(t(locale, 'tbl.datasets'))}</caption><thead><tr>` +
    `<th scope="col">${esc(t(locale, 'tbl.dataset'))}</th><th scope="col">${esc(t(locale, 'tbl.sourceCount'))}</th>` +
    `<th scope="col">${esc(t(locale, 'tbl.status'))}</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

function sourceTable(audit: AuditResult, locale: Locale): string {
  const unknown = t(locale, 'unknown');
  const rows = audit.sources
    .map((s) => {
      const label = esc(`${s.datasetName} / ${s.name ?? t(locale, 'unknownName')}`);
      const name =
        s.url === null
          ? label
          : `<a href="${esc(s.url)}" rel="noopener noreferrer" style="display:inline-block;min-width:44px;min-height:44px;line-height:44px">${label}</a>`;
      const date =
        s.retrievedIso === null
          ? esc(unknown)
          : `<time datetime="${esc(s.retrievedIso)}">${esc(s.retrievedIso)}</time>`;
      return (
        `<tr><th scope="row">${name}</th><td>${esc(s.licence ?? unknown)}</td><td>${date}</td>` +
        `<td>${statusBadge(s.state, locale)}</td></tr>`
      );
    })
    .join('');
  return (
    `<table><caption>${esc(t(locale, 'tbl.sources'))}</caption><thead><tr>` +
    `<th scope="col">${esc(t(locale, 'tbl.source'))}</th><th scope="col">${esc(t(locale, 'tbl.licence'))}</th>` +
    `<th scope="col">${esc(t(locale, 'tbl.retrieved'))}</th><th scope="col">${esc(t(locale, 'tbl.status'))}</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>`
  );
}

function coverageSection(state: PanelState): string {
  if (!state.attributes || state.attributes.length === 0 || !state.attributeRecords) return '';
  const { locale } = state;
  const rows = coverageTable(state.attributeRecords, state.attributes, locale)
    .map(
      (c) =>
        `<tr><th scope="row">${esc(c.label)}</th><td>${c.tally.yes}</td><td>${c.tally.no}</td>` +
        `<td>${c.tally.unknown}</td><td>${esc(c.unknownShare.text)}</td><td>${esc(c.yesOfKnown.text)}</td></tr>`,
    )
    .join('');
  const th = (k: Parameters<typeof t>[1]) => `<th scope="col">${esc(t(locale, k))}</th>`;
  return (
    `<table><caption>${esc(t(locale, 'cov.title'))} (${esc(t(locale, 'cov.records'))}: ${state.attributeRecords.length})</caption>` +
    `<thead><tr>${th('cov.attribute')}${th('cov.yes')}${th('cov.no')}${th('cov.unknown')}${th('cov.unknownShare')}${th('cov.yesOfKnown')}</tr></thead>` +
    `<tbody>${rows}</tbody></table>`
  );
}

function snapshotLine(state: PanelState): string {
  const { locale } = state;
  if (state.snapshotSavedAt) {
    return `<p>${esc(t(locale, 'snap.savedOn', { date: state.snapshotSavedAt.slice(0, 10) }))}</p>`;
  }
  if (state.snapshotNote === 'none') return `<p>${esc(t(locale, 'snap.none'))}</p>`;
  if (state.snapshotNote === 'unreadable') return `<p>${esc(t(locale, 'snap.unreadable'))}</p>`;
  return '';
}

export function renderDataStatusPanel(state: PanelState): string {
  const { locale } = state;
  const audit = auditRegistry(state.records, state.now);
  const btn = (action: string, label: string) =>
    `<button type="button" data-action="${action}" style="${buttonInlineStyle()}">${esc(label)}</button>`;
  return (
    snapshotLine(state) +
    `<div>${btn('recalculate', t(locale, 'act.recalculate'))} ${btn('export-csv', t(locale, 'act.exportCsv'))}</div>` +
    renderQaReportHtml(buildQaReport(audit, locale), locale) +
    datasetTable(audit, locale) +
    sourceTable(audit, locale) +
    coverageSection(state)
  );
}

/** The slice of a DOM element the panel needs (also easy to fake in tests). */
export interface PanelHost {
  innerHTML: string;
  setAttribute(name: string, value: string): void;
  addEventListener(type: 'click', listener: (ev: unknown) => void): void;
  removeEventListener(type: 'click', listener: (ev: unknown) => void): void;
}

export interface MountOptions {
  getRecords: () => readonly DatasetRecord[];
  getLocale: () => Locale;
  now?: () => Date;
  store?: SnapshotStore;
  attributes?: readonly AttributeDef[];
  getAttributeRecords?: () => readonly Readonly<Record<string, unknown>>[];
  /** Called with the CSV text and a file name when the export button is used. */
  onExport?: (csv: string, filename: string) => void;
}

export interface MountedPanel {
  refresh(): void;
  destroy(): void;
}

export function mountDataStatusPanel(host: PanelHost, opts: MountOptions): MountedPanel {
  let lastRecords: readonly DatasetRecord[] = [];

  const refresh = (): void => {
    const locale = opts.getLocale();
    const now = (opts.now ?? (() => new Date()))();
    let records: readonly DatasetRecord[] | null = null;
    let snapshotSavedAt: string | null = null;
    let snapshotNote: SnapshotNote = null;
    try {
      records = opts.getRecords();
    } catch {
      records = null;
    }
    if (records !== null) {
      opts.store?.save(createSnapshot(records, now));
    } else if (opts.store) {
      const loaded = opts.store.load();
      if (loaded.ok) {
        records = loaded.snapshot.records;
        snapshotSavedAt = loaded.snapshot.savedAt;
      } else {
        snapshotNote = loaded.reason === 'empty' || loaded.reason === 'storage-unavailable' ? 'none' : 'unreadable';
      }
    } else {
      snapshotNote = 'none';
    }
    lastRecords = records ?? [];
    host.setAttribute('lang', locale);
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', t(locale, 'qa.title'));
    host.innerHTML = renderDataStatusPanel({
      records: lastRecords,
      locale,
      now,
      snapshotSavedAt,
      snapshotNote,
      attributes: opts.attributes,
      attributeRecords: opts.getAttributeRecords?.(),
    });
  };

  const onClick = (ev: unknown): void => {
    const target = (ev as { target?: { closest?: (sel: string) => { getAttribute?: (n: string) => string | null } | null } })
      .target;
    const action = target?.closest?.('[data-action]')?.getAttribute?.('data-action');
    if (action === 'recalculate') refresh();
    else if (action === 'export-csv' && opts.onExport) {
      const audit = auditRegistry(lastRecords, (opts.now ?? (() => new Date()))());
      opts.onExport(auditedSourcesToCsv(audit.sources, opts.getLocale()), 'data-sources.csv');
    }
  };

  host.addEventListener('click', onClick);
  refresh();
  return { refresh, destroy: () => host.removeEventListener('click', onClick) };
}
