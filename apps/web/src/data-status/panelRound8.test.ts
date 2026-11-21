import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { REPEAT_MARK } from './announce';
import { FakeHost, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';

afterEach(() => vi.unstubAllGlobals());

const sv = { action: '/en/data-status', csvHref: '/en/data-status/sources.csv', creditsHref: '/en/data-status/credits.txt', summaryHref: '/en/data-status/summary.json' };

type SavedFile = { text: string; filename: string; mime: string };

function mount(over: { locale?: 'en' | 'fr'; plainTables?: boolean } = {}) {
  const host = new FakeHost();
  const files: SavedFile[] = [];
  let locale: 'en' | 'fr' = over.locale ?? 'en';
  const panel = mountDataStatusPanel(host, {
    getRecords: () => RECORDS,
    getLocale: () => locale,
    now: () => NOW,
    onExportFile: (f) => files.push(f),
    plainTables: over.plainTables,
  });
  return { host, files, panel, setLocale: (l: 'en' | 'fr') => (locale = l) };
}

describe('panel sections: review workload and age bands', () => {
  const en = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
  const fr = renderDataStatusPanel({ records: RECORDS, locale: 'fr', now: NOW });

  it('shows both sections, each with its own heading', () => {
    expect(en).toContain('<h2 id="ds-workload-title">Review workload</h2>');
    expect(en).toContain('<h2 id="ds-age-title">How old the retrieved dates are</h2>');
    expect(fr).toContain('<h2 id="ds-workload-title">Charge de révision</h2>');
    expect(fr).toContain('<h2 id="ds-age-title">Âge des dates de récupération</h2>');
  });
  it('reads the same audit as the rest of the panel', () => {
    expect(en).toContain('1 source is past its review date.');
    expect(en).toContain('1 source is not scheduled because its retrieved date is UNKNOWN.');
    expect(en).toContain('<th scope="row">Date UNKNOWN</th><td>1</td><td>33%</td>');
  });
  it('places the workload after the review calendar and the age bands after completeness', () => {
    expect(en.indexOf('ds-review-title')).toBeLessThan(en.indexOf('ds-workload-title'));
    expect(en.indexOf('Completeness by field')).toBeLessThan(en.indexOf('ds-age-title'));
  });
  it('follows the thresholds it is given: a longer limit moves the past-due source out of past due', () => {
    const relaxed = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, thresholds: { places: 2000 } });
    expect(relaxed).not.toContain('is past its review date.');
  });
  it('passes the markup and 44px target audits in both languages', () => {
    for (const html of [en, fr]) {
      expect(targetsBelow44(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      expect(scanHtml(html)).toEqual([]);
    }
  });
  it('has no French typography problems in the visible text', () => {
    expect(lintFrench(visibleText(fr))).toEqual([]);
  });
  it('keeps every id unique, so no section collides with another', () => {
    const ids = [...en.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('is present, unchanged in meaning, when the panel uses plain tables', () => {
    const plain = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, plainTables: true });
    expect(plain).toContain('ds-workload-title');
    expect(plain).toContain('ds-age-title');
  });
  it('renders for an empty registry without error', () => {
    const empty = renderDataStatusPanel({ records: [], locale: 'en', now: NOW });
    expect(empty).toContain('No source has a review date to plan around.');
    expect(empty).toContain('There are no sources to count.');
  });
});

describe('panel sections: at a glance, what to do next, licences in use', () => {
  const en = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
  const fr = renderDataStatusPanel({ records: RECORDS, locale: 'fr', now: NOW });
  it('shows each section with its heading in both languages', () => {
    for (const id of ['ds-glance-title', 'ds-actions-title', 'ds-licences-title']) {
      expect(en).toContain(`id="${id}"`);
      expect(fr).toContain(`id="${id}"`);
    }
    expect(en).toContain('<h2 id="ds-glance-title">At a glance</h2>');
    expect(fr).toContain('<h2 id="ds-actions-title">Prochaines étapes</h2>');
    expect(fr).toContain('<h2 id="ds-licences-title">Licences utilisées</h2>');
  });
  it('orders them so the summary comes first and the steps follow the findings', () => {
    expect(en.indexOf('ds-glance-title')).toBeLessThan(en.indexOf('ds-qa-title'));
    expect(en.indexOf('ds-qa-title')).toBeLessThan(en.indexOf('ds-actions-title'));
    expect(en.indexOf('Completeness by field')).toBeLessThan(en.indexOf('ds-licences-title'));
    expect(en.indexOf('ds-licences-title')).toBeLessThan(en.indexOf('ds-age-title'));
  });
  it('agrees with the audit totals the rest of the panel shows', () => {
    expect(en).toContain('3 sources saved on this device, in 2 datasets.');
    expect(en).toContain('<dt>Sources possibly out of date</dt><dd>1</dd>');
    expect(en).toContain('1 possibly out of date');
  });
  it('lists a next step for the kinds of item found', () => {
    expect(en).toContain('Look at the source again and fetch a newer copy if one exists.');
    expect(en).toContain('Compare it with the reference list.');
  });
  it('passes the markup, target and wording audits, with unique ids, in both languages', () => {
    for (const html of [en, fr]) {
      expect(targetsBelow44(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      expect(scanHtml(html)).toEqual([]);
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(lintFrench(visibleText(fr))).toEqual([]);
  });
  it('appears in the server-rendered page and with plain tables', () => {
    const served = renderDataStatusPanel({ records: RECORDS, locale: 'fr', now: NOW, staticView: { ...sv, action: '/fr/data-status' } });
    const plain = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, plainTables: true });
    for (const html of [served, plain]) for (const id of ['ds-glance-title', 'ds-actions-title', 'ds-licences-title']) expect(html).toContain(id);
  });
  it('says what is true for an empty registry', () => {
    const empty = renderDataStatusPanel({ records: [], locale: 'en', now: NOW });
    expect(empty).toContain('No sources are saved on this device.');
    expect(empty).toContain('Nothing needs action.');
    expect(empty).toContain('There are no sources to group.');
  });
});

describe('panel: announce region and extra buttons', () => {
  it('has one polite status region, and the sources table is no longer a live region', () => {
    const html = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    expect(html.match(/data-region="announce"/g)).toHaveLength(1);
    expect(html).toMatch(/data-region="announce" role="status" aria-live="polite" aria-atomic="true"/);
    expect(html).toContain('<div data-region="sources">');
    expect(html.match(/aria-live=/g)).toHaveLength(1);
  });
  it('is hidden by position and size, not by display:none, so it is still read aloud', () => {
    const html = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    const tag = html.match(/<div data-region="announce"[^>]*>/)?.[0] ?? '';
    expect(tag).toContain('clip:rect(0 0 0 0)');
    expect(tag).not.toMatch(/display:\s*none|visibility:\s*hidden|hidden=/);
  });
  it('has the two extra buttons in script mode, named in each language', () => {
    const en = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    const fr = renderDataStatusPanel({ records: RECORDS, locale: 'fr', now: NOW });
    expect(en).toContain('data-action="export-report"');
    expect(en).toContain('Download the audit report (Markdown)');
    expect(en).toContain('Download the checksum list (text)');
    expect(fr).toContain('Télécharger le rapport d’audit (Markdown)');
    expect(fr).toContain('Télécharger la liste des sommes de contrôle (texte)');
  });
  it('leaves the announce region and the script buttons out of the server-rendered page', () => {
    const html = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, staticView: sv });
    expect(html).not.toContain('data-region="announce"');
    expect(html).not.toContain('export-report');
    expect(html).not.toContain('export-checksums');
    expect(html).not.toContain('aria-live');
    expect(html).toContain('ds-workload-title');
    expect(describeProblems(auditHtml(html))).toEqual([]);
  });
});

describe('mounted panel: spoken list changes', () => {
  it('starts silent and says the new result after a filter change', () => {
    const { host } = mount();
    expect(host.announce.innerHTML).toBe('');
    host.filter('change', 'state', 'stale');
    expect(host.announce.innerHTML).toBe('1 source shown. Filters: status may be out of date.');
  });
  it('says no sources match, with the search text, and escapes it', () => {
    const { host } = mount();
    host.filter('input', 'query', '<b>zz');
    expect(host.announce.innerHTML).toBe('No sources match. Filters: name contains “&lt;b&gt;zz”.');
  });
  it('repeats an unchanged result with a trailing no-break space so it is heard again', () => {
    const { host } = mount();
    host.filter('change', 'state', 'stale');
    const first = host.announce.innerHTML;
    host.filter('change', 'state', 'stale');
    expect(host.announce.innerHTML).toBe(`${first}${REPEAT_MARK}`);
    host.filter('change', 'state', 'stale');
    expect(host.announce.innerHTML).toBe(first);
  });
  it('says the filters were cleared after the reset button', () => {
    const { host } = mount();
    host.filter('change', 'state', 'stale');
    host.click('reset-filters');
    expect(host.announce.innerHTML).toBe('3 sources shown. Filters cleared.');
  });
  it('does not announce when reset is pressed with nothing to clear', () => {
    const { host } = mount();
    host.click('reset-filters');
    expect(host.announce.innerHTML).toBe('');
  });
  it('speaks French, with a no-break space before the colon', () => {
    const { host } = mount({ locale: 'fr' });
    host.filter('change', 'kind', 'routes');
    const text = host.announce.innerHTML;
    expect(text).toBe('1 source affichée. Filtres : type de jeu de données itinéraires.');
    expect(lintFrench(text)).toEqual([]);
  });
  it('follows a language change made before the next filter change', () => {
    const { host, setLocale, panel } = mount();
    setLocale('fr');
    panel.refresh();
    host.filter('change', 'state', 'stale');
    expect(host.announce.innerHTML).toContain('Filtres :');
  });
  it('keeps working when the host has no announce region', () => {
    const host = new FakeHost(false);
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW });
    expect(() => host.filter('change', 'state', 'stale')).not.toThrow();
  });
  it('writes only to the announce region, never into the sources table', () => {
    const { host } = mount();
    host.filter('change', 'state', 'stale');
    expect(host.region.innerHTML).not.toContain('Filters:');
    expect(host.announce.innerHTML).not.toContain('<table');
  });
});

describe('mounted panel: report and checksum buttons', () => {
  it('saves the Markdown report for the current records and language', () => {
    const { host, files } = mount();
    host.click('export-report');
    expect(files).toHaveLength(1);
    expect(files[0]?.filename).toBe('data-status.md');
    expect(files[0]?.mime).toBe('text/markdown;charset=utf-8');
    expect(files[0]?.text.startsWith('# Data status\n')).toBe(true);
    expect(files[0]?.text).toContain('| Sources | 3 |');
  });
  it('saves the French report after a language change', () => {
    const { host, files, setLocale } = mount();
    setLocale('fr');
    host.click('export-report');
    expect(files[0]?.text.startsWith('# État des données\n')).toBe(true);
  });
  it('does nothing, without error, when no save handler was given', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW });
    expect(() => host.click('export-report')).not.toThrow();
    expect(() => host.click('export-checksums')).not.toThrow();
  });
  it('saves a checksum list of the five files', async () => {
    const { host, files } = mount();
    host.click('export-checksums');
    await vi.waitFor(() => expect(files).toHaveLength(1));
    const lines = (files[0]?.text ?? '').trimEnd().split('\n');
    expect(files[0]?.filename).toBe('checksums.txt');
    expect(lines.map((l) => l.slice(66))).toEqual(['catalogue.json', 'credits.txt', 'data-sources.csv', 'review-dates.ics', 'summary.json']);
    for (const l of lines) expect(l).toMatch(/^[0-9a-f]{64} {2}\S+$/);
  });
  it('says so, and saves nothing, when the browser cannot make checksums', async () => {
    vi.stubGlobal('crypto', {});
    const { host, files } = mount();
    host.click('export-checksums');
    await vi.waitFor(() => expect(host.announce.innerHTML).toBe('Checksums cannot be made in this browser.'));
    expect(files).toHaveLength(0);
    host.click('export-checksums');
    await vi.waitFor(() => expect(host.announce.innerHTML).toBe(`Checksums cannot be made in this browser.${REPEAT_MARK}`));
  });
  it('says so in French', async () => {
    vi.stubGlobal('crypto', {});
    const { host } = mount({ locale: 'fr' });
    host.click('export-checksums');
    await vi.waitFor(() => expect(host.announce.innerHTML).toContain('ne peuvent pas être calculées'));
  });
  it('still saves the CSV from its own button', () => {
    const host = new FakeHost();
    const csv: string[] = [];
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onExport: (text, name) => csv.push(name + ':' + text.length) });
    host.click('export-csv');
    expect(csv).toHaveLength(1);
    expect(csv[0]?.startsWith('data-sources.csv:')).toBe(true);
  });
});

describe('mounted panel: markup after mounting', () => {
  it('keeps the sections in the host html after a refresh and with plain tables', () => {
    const { host } = mount({ plainTables: true });
    for (const id of ['ds-workload-title', 'ds-age-title']) expect(host.innerHTML).toContain(id);
    host.click('recalculate');
    for (const id of ['ds-workload-title', 'ds-age-title']) expect(host.innerHTML).toContain(id);
    expect(host.innerHTML).not.toContain('class="ds-scroll"');
  });
  it('is valid markup in both languages after mounting', () => {
    for (const locale of ['en', 'fr'] as const) {
      const { host } = mount({ locale });
      expect(structureProblems(host.innerHTML), locale).toEqual([]);
    }
  });
});
