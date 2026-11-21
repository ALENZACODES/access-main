import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditHtml, describeProblems, mountDataStatusPanel, renderDataStatusPanel, scanHtml } from './index';
import { FakeHost, NOW, RECORDS, structureProblems } from './testkit';

afterEach(() => vi.unstubAllGlobals());

describe('panel: contents list, source details, self-check, tables export', () => {
  for (const locale of ['en', 'fr'] as const) {
    const html = renderDataStatusPanel({ records: RECORDS, locale, now: NOW });
    it(`${locale}: has the contents list after the glance and before the QA report`, () => {
      const g = html.indexOf('id="ds-glance-title"');
      const toc = html.indexOf('id="ds-toc-title"');
      const qa = html.indexOf('id="ds-qa-title"');
      expect(g).toBeGreaterThan(-1);
      expect(toc).toBeGreaterThan(g);
      expect(qa).toBeGreaterThan(toc);
    });
    it(`${locale}: has source details and the self-check, each once`, () => {
      expect(html.match(/id="ds-detail-title"/g)).toHaveLength(1);
      expect(html.match(/id="ds-selfcheck-title"/g)).toHaveLength(1);
    });
    it(`${locale}: passes the audits and has unique ids`, () => {
      expect(scanHtml(html)).toEqual([]);
      expect(describeProblems(auditHtml(html))).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
    });
  }
  it('the contents list links to the new sections', () => {
    const html = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    expect(html).toContain('<option value="ds-detail-title">');
    expect(html).toContain('<option value="ds-selfcheck-title">');
  });
  it('shows the tables button only in the interactive panel', () => {
    const live = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    const sv = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, staticView: { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' } });
    expect(live).toContain('data-action="export-tables"');
    expect(sv).not.toContain('data-action="export-tables"');
  });
  it('clicking the tables button hands the CSV file to the page', () => {
    const host = new FakeHost();
    const files: { text: string; filename: string; mime: string }[] = [];
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onExportFile: (f) => files.push(f) });
    host.click('export-tables');
    expect(files).toHaveLength(1);
    expect(files[0]?.filename).toBe('planning-tables.csv');
    expect(files[0]?.text.charCodeAt(0)).toBe(0xfeff);
  });
});
