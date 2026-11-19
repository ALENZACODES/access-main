import { describe, expect, it } from 'vitest';
import type { DatasetRecord } from './datasetRegistry';
import { auditHtml, describeProblems, mountDataStatusPanel, renderDataStatusPanel, type PanelHost } from './index';
import { SHOW_MORE_ACTION } from './liveList';
import { createSavedViewStore, VIEW_SAVE_ACTION, viewApplyAction, viewDeleteAction } from './savedViews';
import { FakeHost, NOW, RECORDS, structureProblems } from './testkit';

const many = (n: number): DatasetRecord[] => [
  { id: 'd', name: 'Set', kind: 'places', sources: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Name ${i}`, licence: 'OGL-Ontario', retrievedAt: '2026-11-01', tier: i % 2 === 0 ? 0 : 'E' })) },
];

const mount = (records: DatasetRecord[] = RECORDS) => {
  const host = new FakeHost();
  const store = createSavedViewStore(null);
  mountDataStatusPanel(host, { getRecords: () => records, getLocale: () => 'en', now: () => NOW, savedViews: store });
  return { host, store };
};

describe('where focus goes after a control redraws the panel', () => {
  it('adds nothing to the tab order', () => {
    const html = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, savedViews: { views: [], durable: false } });
    expect(html).not.toMatch(/data-region="[a-z]+" tabindex/);
    expect(describeProblems(auditHtml(html))).toEqual([]);
    expect(structureProblems(html)).toEqual([]);
  });
  it('stays on a quick filter or a drill-down control, which are still there after the redraw', () => {
    const { host } = mount();
    host.click('quick:noTier');
    host.click('show:tier:E');
    expect(host.focused).toEqual(['[data-action="quick:noTier"]', '[data-action="show:tier:E"]']);
  });
  it('after a filter is removed, goes to the next filter in force, or to the clear control when none is left', () => {
    const { host } = mount();
    host.filter('change', 'tier', 'E');
    host.filter('change', 'licence', 'unrecognised');
    host.click('clear:tier');
    host.click('clear:licence');
    expect(host.focused).toEqual(['[data-action^="clear:"]', '[data-action="reset-filters"]']);
  });
  it('stays on the clear control after the form is cleared', () => {
    const { host } = mount();
    host.filter('change', 'tier', 'E');
    host.click('reset-filters');
    expect(host.focused).toEqual(['[data-action="reset-filters"]']);
  });
  it('stays on a saved view after it is shown', () => {
    const { host, store } = mount();
    store.save([{ query: '?tier=E', name: null }]);
    host.click('recalculate');
    host.click(viewApplyAction(0));
    expect(host.focused).toEqual(['[data-action="view-apply:0"]']);
  });
  it('goes to the new view after saving, and back to the save control after deleting', () => {
    const { host } = mount();
    host.filter('change', 'tier', 'E');
    host.click(VIEW_SAVE_ACTION);
    host.click(viewDeleteAction(0));
    expect(host.focused).toEqual(['[data-action="view-apply:0"]', `[data-action="${VIEW_SAVE_ACTION}"]`]);
  });
  it('goes to the start of the form when a save does not happen and there is no save control', () => {
    const { host } = mount();
    host.click(VIEW_SAVE_ACTION);
    expect(host.focused).toEqual(['#ds-f-state']);
  });
  it('does not move when a form field changes, so typing and choosing are not interrupted', () => {
    const { host } = mount();
    host.filter('change', 'tier', 'E');
    host.filter('input', 'query', 'al');
    host.filter('change', 'sort', 'tier:asc');
    host.filter('input', 'viewName', 'x');
    host.click(SHOW_MORE_ACTION);
    expect(host.focused).toEqual([]);
  });
  it('does not move for actions that change nothing', () => {
    const { host } = mount();
    host.click('reset-filters');
    host.click('show:tier:9');
    host.click('clear:nothing');
    host.click(viewDeleteAction(4));
    expect(host.focused).toEqual([]);
  });
  it('copes with a host that cannot find or focus a control', () => {
    const bare = new FakeHost(false);
    mountDataStatusPanel(bare, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW });
    expect(() => bare.click('quick:noTier')).not.toThrow();
    const throwing: PanelHost & { listeners: ((ev: unknown) => void)[] } = {
      innerHTML: '',
      listeners: [],
      setAttribute: () => undefined,
      addEventListener(type, l) {
        if (type === 'click') this.listeners.push(l);
      },
      removeEventListener: () => undefined,
      querySelector: () => ({
        innerHTML: '',
        focus: () => {
          throw new Error('no focus');
        },
      }),
    };
    mountDataStatusPanel(throwing, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW });
    expect(() => throwing.listeners[0]?.({ target: { closest: () => ({ getAttribute: () => 'quick:noTier' }) } })).not.toThrow();
  });
});

describe('saying how many rows are drawn when the list is long', () => {
  it('adds the drawn count to what is said when only the first rows are drawn', () => {
    const { host } = mount(many(120));
    host.filter('change', 'sort', 'source:desc');
    expect(host.announce.innerHTML).toBe('Sorted by source, descending. Showing 50 of 120 listed sources.');
  });
  it('says nothing extra when every listed row is drawn', () => {
    const { host } = mount(many(120));
    host.filter('change', 'tier', 'E');
    host.filter('input', 'query', 'name 11');
    expect(host.announce.innerHTML).not.toContain('Showing ');
    const short = mount();
    short.host.filter('change', 'sort', 'tier:asc');
    expect(short.host.announce.innerHTML).not.toContain('Showing ');
  });
  it('adds it after a control that redraws the panel too', () => {
    const { host } = mount(many(160));
    host.click('show:tier:E');
    expect(host.announce.innerHTML).toContain('80 sources shown.');
    expect(host.announce.innerHTML).toContain('Showing 50 of 80 listed sources.');
  });
  it('a control that changes what is listed starts again from the first rows', () => {
    const { host } = mount(many(160));
    host.click(SHOW_MORE_ACTION);
    expect((host.region.innerHTML.match(/<tr><th scope="row">/g) ?? []).length).toBe(100);
    host.click('show:tier:0');
    expect(host.innerHTML).toContain('Showing 50 of 80 listed sources.');
  });
});
