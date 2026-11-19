/**
 * The panel sits on a page that people cross with the Tab key to reach the rest of the app. This
 * counts the stops a keyboard meets in the panel and holds them under a budget, so that adding a
 * control does not quietly make the page longer to cross. Controls inside a closed disclosure
 * are not stops, but the panel must not put any there: a control that is not drawn has no name
 * for assistive technology and cannot be reached.
 */
import { describe, expect, it } from 'vitest';
import { COLUMN_IDS, renderColumnChooser } from './columns';
import type { DatasetRecord } from './datasetRegistry';
import { handleDataStatus } from './http';
import { mountDataStatusPanel, renderDataStatusPanel, type PanelState } from './index';
import { isoDayOffset } from './round7Kit';
import { FakeHost, NOW, RECORDS } from './testkit';
import { renderPivotControl } from './pivot';
import { buildToc, renderTocHtml, TOC_GO_ACTION, TOC_SELECT_ID } from './toc';

/** The markup with everything inside a closed disclosure removed, except its summary. */
export function withoutClosedDisclosures(html: string): string {
  let out = html;
  for (let guard = 0; guard < 200; guard++) {
    const start = out.search(/<details(?![^>]* open)[^>]*>/);
    if (start < 0) return out;
    // Find the matching end, allowing disclosures inside disclosures.
    let depth = 0;
    let i = start;
    let end = -1;
    while (i < out.length) {
      const open = out.indexOf('<details', i + 1);
      const close = out.indexOf('</details>', i + 1);
      if (close < 0) break;
      if (open >= 0 && open < close) {
        depth += 1;
        i = open;
      } else if (depth === 0) {
        end = close;
        break;
      } else {
        depth -= 1;
        i = close;
      }
    }
    if (end < 0) return out;
    const summary = /<summary[^>]*>.*?<\/summary>/s.exec(out.slice(start, end))?.[0] ?? '';
    out = `${out.slice(0, start)}<span data-closed>${summary}</span>${out.slice(end + '</details>'.length)}`;
  }
  return out;
}

/** How many places the Tab key stops at in this markup. */
export function countTabStops(html: string): number {
  const visible = withoutClosedDisclosures(html);
  const controls = visible.match(/<(a\s[^>]*href=|button[\s>]|select[\s>]|textarea[\s>]|summary[\s>]|input\s(?![^>]*type="hidden"))/g) ?? [];
  const regions = visible.match(/<(?!a\s|button|select|textarea|summary|input)[a-z0-9]+\s[^>]*tabindex="0"/g) ?? [];
  return controls.length + regions.length;
}

const live = (records: readonly DatasetRecord[], over: Partial<PanelState> = {}) => renderDataStatusPanel({ records, locale: 'en', now: NOW, live: { sort: null, limit: 50 }, ...over });

describe('counting', () => {
  it('counts links, buttons, fields, summaries and scrollable regions', () => {
    expect(countTabStops('<a href="#x">a</a><button type="button">b</button><select><option>c</option></select><input type="checkbox"><input type="hidden" name="h"><div tabindex="0">r</div><span>s</span>')).toBe(5);
    expect(countTabStops('<a name="anchor">not a link</a><div tabindex="-1">no</div>')).toBe(0);
  });
  it('counts a closed disclosure as one stop and an open one in full', () => {
    const inner = '<a href="#1">1</a><a href="#2">2</a><button type="button">3</button>';
    expect(countTabStops(`<details><summary>s</summary>${inner}</details>`)).toBe(1);
    expect(countTabStops(`<details open><summary>s</summary>${inner}</details>`)).toBe(4);
    expect(countTabStops(`<details><summary>s</summary><details open><summary>t</summary>${inner}</details></details><a href="#4">4</a>`)).toBe(2);
    expect(countTabStops(`<details open><summary>s</summary><details><summary>t</summary>${inner}</details></details>`)).toBe(2);
  });
});

describe('the parts that were made shorter', () => {
  it('gives the live panel a jump menu with every section in it, and two stops', () => {
    const page = live(RECORDS);
    const menu = /<nav aria-labelledby="ds-toc-title"[\s\S]*?<\/nav>/.exec(page)?.[0] ?? '';
    expect(countTabStops(menu)).toBe(2);
    const options = menu.match(/<option /g) ?? [];
    expect(options.length).toBeGreaterThan(15);
    // Every section after the menu is in it: the headings the menu itself and the lines above it carry are not.
    const after = buildToc(page.slice(page.indexOf('</nav>')));
    expect(options).toHaveLength(after.length);
    expect(menu).toBe(renderTocHtml(after, 'en', 'jump'));
    for (const m of menu.matchAll(/<option value="([^"]+)"/g)) expect(page, m[1]).toContain(`id="${m[1]}"`);
    expect(menu).toContain(`<label for="${TOC_SELECT_ID}">Section</label>`);
    expect(menu).toContain(`data-action="${TOC_GO_ACTION}"`);
    expect(page).not.toContain('<a href="#ds-');
  });
  it('keeps one link per section on the page the server sends, where nothing can run', async () => {
    const res = await handleDataStatus({ method: 'GET', url: '/fr/data-status', headers: {} }, { getRecords: () => RECORDS, now: () => NOW });
    expect(res!.body).not.toContain(`id="${TOC_SELECT_ID}"`);
    expect((res!.body.match(/<a href="#ds-/g) ?? []).length).toBeGreaterThan(15);
    expect(renderTocHtml(buildToc(res!.body), 'fr')).toBe(renderTocHtml(buildToc(res!.body), 'fr', 'links'));
  });
  it('is empty for a short panel in either form, and escapes section names', () => {
    expect(renderTocHtml([], 'en', 'jump')).toBe('');
    const menu = renderTocHtml([{ id: 'a', text: 'A & <b>' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], 'en', 'jump');
    expect(menu).toContain('<option value="a">A &amp; &lt;b&gt;</option>');
  });
  it('goes to the chosen section, or to the first when none was chosen, and nowhere for an id that is not a section', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW });
    const first = buildToc(host.innerHTML)[0]!.id;
    host.click(TOC_GO_ACTION);
    expect(host.focused.at(-1)).toBe(`#${first}`);
    host.filter('change', 'tocTarget', 'ds-glossary-title');
    host.click(TOC_GO_ACTION);
    expect(host.focused.at(-1)).toBe('#ds-glossary-title');
    host.filter('change', 'tocTarget', 'ds-f-state');
    host.click(TOC_GO_ACTION);
    expect(host.focused.at(-1)).toBe(`#${first}`);
    host.filter('change', 'tocTarget', 'x"]><script>');
    host.click(TOC_GO_ACTION);
    expect(host.focused.at(-1)).toBe(`#${first}`);
  });
  it('choosing a section does not redraw anything or change the address', () => {
    const host = new FakeHost();
    const changes: string[] = [];
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onFiltersChange: (v) => changes.push(v) });
    host.region.innerHTML = 'kept';
    host.filter('change', 'tocTarget', 'ds-glossary-title');
    host.click(TOC_GO_ACTION);
    expect(host.region.innerHTML).toBe('kept');
    expect(changes).toEqual([]);
  });
  it('draws the second count select only once a count table is on, on the live panel', () => {
    expect(countTabStops(renderPivotControl(null, 'en', true))).toBe(1);
    expect(countTabStops(renderPivotControl({ rows: 'tier', cols: null }, 'en', true))).toBe(2);
    expect(countTabStops(renderPivotControl(null, 'en'))).toBe(2);
    expect(live(RECORDS)).not.toContain('id="ds-pv-cols"');
    expect(live(RECORDS, { live: { sort: null, limit: 50, pivot: { rows: 'tier', cols: null } } })).toContain('id="ds-pv-cols"');
  });
  it('shows every column box, since a hidden control cannot be reached or named', () => {
    expect(countTabStops(renderColumnChooser([], 'en'))).toBe(COLUMN_IDS.length);
    expect(renderColumnChooser([], 'en')).not.toContain('<details');
    expect(live(RECORDS)).not.toMatch(/<details(?![^>]* open)[^>]*>(?:(?!<\/details>)[\s\S])*<(a |button|input|select)/);
  });
});

describe('the budget', () => {
  it('an empty panel is short to cross', () => {
    const stops = countTabStops(live([]));
    expect(stops).toBeGreaterThan(10);
    expect(stops).toBeLessThanOrEqual(42);
  });
  it('a panel with one record stays within the budget of the page it sits on', () => {
    const one: DatasetRecord[] = [{ id: 'cache', name: 'Saved on this device', kind: 'reference', sources: [{ id: 'prefs', name: 'Preferences', source: 'This device', licence: null, retrievedAt: isoDayOffset(NOW, 0), tier: null }] }];
    // One record adds its row link, the scrollable tables and the buttons that list it.
    expect(countTabStops(live(one))).toBeLessThanOrEqual(56);
    expect(countTabStops(live(one)) - countTabStops(live([]))).toBeLessThanOrEqual(16);
  });
  it('choosing extras adds only what was chosen', () => {
    const base = countTabStops(live(RECORDS));
    const withColumns = countTabStops(live(RECORDS, { live: { sort: null, limit: 50, columns: ['review'] } }));
    expect(withColumns - base).toBe(0);
    const withSessions = countTabStops(live(RECORDS, { live: { sort: null, limit: 50, batch: 5 } }));
    expect(withSessions - base).toBe(1);
  });
  it('the page the server sends is not held to the budget: it has a link per section and both count selects', async () => {
    const res = await handleDataStatus({ method: 'GET', url: '/en/data-status', headers: {} }, { getRecords: () => RECORDS, now: () => NOW });
    expect(res!.body).toContain('id="ds-pv-cols"');
    expect(countTabStops(res!.body)).toBeGreaterThan(countTabStops(live(RECORDS)));
  });
});
