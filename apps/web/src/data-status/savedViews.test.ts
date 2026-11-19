import { describe, expect, it } from 'vitest';
import { NO_FILTERS, parseFilters, type Filters } from './filters';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import {
  addView,
  cleanViews,
  createSavedViewStore,
  describeSaveOutcome,
  MAX_SAVED_VIEWS,
  parseViewAction,
  removeViewAt,
  renderSavedViewsHtml,
  SAVED_VIEWS_KEY,
  VIEW_SAVE_ACTION,
  viewApplyAction,
  viewDeleteAction,
  viewLabel,
  viewQuery,
  cleanViewName,
  MAX_VIEW_NAME_LENGTH,
  savedViewLabel,
  viewsToStored,
  type SavedView,
} from './savedViews';
import { FakeHost, memoryStorage, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';

const v = (query: string, name: string | null = null): SavedView => ({ query, name });
const qs = (views: readonly SavedView[]): string[] => views.map((x) => x.query);
const TIER_E: Filters = { ...NO_FILTERS, tier: 'E' };
const STALE: Filters = { ...NO_FILTERS, state: 'stale' };

describe('viewQuery and cleanViews', () => {
  it('writes filters as canonical query text', () => {
    expect(viewQuery(NO_FILTERS)).toBe('');
    expect(viewQuery(TIER_E)).toBe('?tier=E');
    expect(viewQuery({ ...NO_FILTERS, query: '  Alpha  ' })).toBe('?q=alpha');
  });
  it('keeps readable, distinct, non-empty views in order', () => {
    expect(qs(cleanViews(['?tier=E', 'tier=E', '?state=stale', '', '?nothing=1', 7, null, '?tier=9']))).toEqual(['?tier=E', '?state=stale']);
  });
  it('drops parts of a view that are not filters, and keeps the rest', () => {
    expect(qs(cleanViews(['?tier=E&sort=tier&utm=x']))).toEqual(['?tier=E']);
  });
  it('returns nothing for anything that is not a list', () => {
    for (const v of [null, undefined, 'x', 3, {}, { 0: '?tier=E' }]) expect(qs(cleanViews(v))).toEqual([]);
  });
  it('stops at the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => `?q=name${i}`);
    expect(cleanViews(many)).toHaveLength(MAX_SAVED_VIEWS);
    expect(cleanViews(many)[0]?.query).toBe('?q=name0');
  });
});

describe('stores', () => {
  it('keeps views in memory for the page when there is no storage', () => {
    const store = createSavedViewStore(null);
    expect(store.durable).toBe(false);
    expect(qs(store.load())).toEqual([]);
    expect(store.save([v('?tier=E')])).toBe(true);
    expect(qs(store.load())).toEqual(['?tier=E']);
    expect(qs(createSavedViewStore(null).load())).toEqual([]);
  });
  it('does not hand out its own list', () => {
    const store = createSavedViewStore(undefined);
    store.save([v('?tier=E')]);
    store.load().push(v('?state=stale'));
    expect(qs(store.load())).toEqual(['?tier=E']);
  });
  it('writes to the given storage under its own key, and reads it back', () => {
    const storage = memoryStorage();
    const store = createSavedViewStore(storage);
    expect(store.durable).toBe(true);
    store.save([v('?tier=E'), v('?state=stale')]);
    expect(JSON.parse(storage.map.get(SAVED_VIEWS_KEY) ?? 'null')).toEqual(['?tier=E', '?state=stale']);
    expect(qs(createSavedViewStore(storage).load())).toEqual(['?tier=E', '?state=stale']);
  });
  it('removes its key when the last view goes', () => {
    const storage = memoryStorage();
    const store = createSavedViewStore(storage);
    store.save([v('?tier=E')]);
    store.save([]);
    expect(storage.map.has(SAVED_VIEWS_KEY)).toBe(false);
  });
  it('reads nothing from text that is not a list of views', () => {
    for (const text of ['not json', '{"a":1}', '"?tier=E"', '[1,2]', '']) {
      const storage = memoryStorage();
      storage.setItem(SAVED_VIEWS_KEY, text);
      expect(qs(createSavedViewStore(storage).load()), text).toEqual([]);
    }
  });
  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createSavedViewStore(broken);
    expect(qs(store.load())).toEqual([]);
    expect(store.save([v('?tier=E')])).toBe(false);
    expect(store.save([])).toBe(false);
  });
  it('can use another key', () => {
    const storage = memoryStorage();
    createSavedViewStore(storage, 'other').save([v('?tier=E')]);
    expect(storage.map.has('other')).toBe(true);
    expect(storage.map.has(SAVED_VIEWS_KEY)).toBe(false);
  });
});

describe('addView and removeViewAt', () => {
  it('saves the filters in force', () => {
    const store = createSavedViewStore(null);
    expect(addView(store, TIER_E)).toEqual({ outcome: 'saved', views: [v('?tier=E')] });
    expect(qs(store.load())).toEqual(['?tier=E']);
  });
  it('does not save when no filter is in force', () => {
    const store = createSavedViewStore(null);
    expect(addView(store, NO_FILTERS).outcome).toBe('empty');
    expect(addView(store, { ...NO_FILTERS, query: '   ' }).outcome).toBe('empty');
    expect(qs(store.load())).toEqual([]);
  });
  it('does not save the same view twice', () => {
    const store = createSavedViewStore(null);
    addView(store, TIER_E);
    expect(addView(store, { ...TIER_E }).outcome).toBe('exists');
    expect(store.load()).toHaveLength(1);
  });
  it('stops at the limit', () => {
    const store = createSavedViewStore(null);
    for (let i = 0; i < MAX_SAVED_VIEWS; i++) expect(addView(store, { ...NO_FILTERS, query: `n${i}` }).outcome).toBe('saved');
    expect(addView(store, TIER_E).outcome).toBe('full');
    expect(store.load()).toHaveLength(MAX_SAVED_VIEWS);
  });
  it('reports a failed write and leaves the list as it was', () => {
    const storage = memoryStorage();
    const store = createSavedViewStore({ ...storage, setItem: () => { throw new Error('quota'); } });
    expect(addView(store, TIER_E)).toEqual({ outcome: 'failed', views: [] });
  });
  it('removes the view at a position and nothing else', () => {
    const store = createSavedViewStore(null);
    addView(store, TIER_E);
    addView(store, STALE);
    expect(removeViewAt(store, 0)).toEqual({ removed: true, views: [v('?state=stale')] });
    expect(qs(store.load())).toEqual(['?state=stale']);
  });
  it('changes nothing for a position that does not exist', () => {
    const store = createSavedViewStore(null);
    addView(store, TIER_E);
    for (const i of [-1, 1, 1.5, NaN, 99]) expect(removeViewAt(store, i).removed).toBe(false);
    expect(qs(store.load())).toEqual(['?tier=E']);
  });
});

describe('actions', () => {
  it('reads save, apply and delete actions', () => {
    expect(parseViewAction(VIEW_SAVE_ACTION)).toEqual({ kind: 'save' });
    expect(parseViewAction(viewApplyAction(0))).toEqual({ kind: 'apply', index: 0 });
    expect(parseViewAction(viewDeleteAction(7))).toEqual({ kind: 'delete', index: 7 });
  });
  it('rejects anything else', () => {
    for (const a of ['view-apply:', 'view-apply:-1', 'view-apply:01', 'view-apply:1e3', 'view-apply:abc', 'view-delete:999', 'view', 'clear:tier', '', null, undefined]) {
      expect(parseViewAction(a), String(a)).toBeNull();
    }
  });
});

describe('wording', () => {
  it('describes a view by its filters', () => {
    expect(viewLabel('?state=stale&tier=E', 'en')).toBe('Status: May be out of date, Tier: E');
    expect(viewLabel('?ds=p', 'en', new Map([['p', 'Places']]))).toBe('Dataset: Places');
    expect(viewLabel('?tier=E', 'fr')).toBe('Niveau : E');
  });
  it('has a sentence for every outcome in both languages', () => {
    for (const o of ['saved', 'exists', 'empty', 'full', 'failed'] as const) {
      expect(describeSaveOutcome(o, 'en').endsWith('.')).toBe(true);
      expect(describeSaveOutcome(o, 'fr')).not.toBe(describeSaveOutcome(o, 'en'));
    }
  });
});

describe('renderSavedViewsHtml', () => {
  it('offers to save when a filter is in force and the view is new', () => {
    const html = renderSavedViewsHtml([], 'en', { durable: false, active: TIER_E });
    expect(html).toContain(`data-action="${VIEW_SAVE_ACTION}"`);
    expect(html).toContain('No view is saved yet.');
    expect(html).toContain('Views are kept until you leave this page.');
  });
  it('explains instead of offering a button that would do nothing', () => {
    expect(renderSavedViewsHtml([], 'en', { durable: true, active: NO_FILTERS })).toContain('Choose at least one filter to save a view.');
    expect(renderSavedViewsHtml([v('?tier=E')], 'en', { durable: true, active: TIER_E })).toContain('This view is already saved.');
    const full = Array.from({ length: MAX_SAVED_VIEWS }, (_, i) => v(`?q=n${i}`));
    expect(renderSavedViewsHtml(full, 'en', { durable: true, active: TIER_E })).toContain('The list of saved views is full.');
    for (const html of [renderSavedViewsHtml([], 'en', { durable: true, active: NO_FILTERS }), renderSavedViewsHtml([v('?tier=E')], 'en', { durable: true, active: TIER_E })]) {
      expect(html).not.toContain(`data-action="${VIEW_SAVE_ACTION}"`);
    }
  });
  it('says where views are kept', () => {
    expect(renderSavedViewsHtml([], 'en', { durable: true, active: NO_FILTERS })).toContain('Views are kept on this device only.');
  });
  it('lists each view with a show control and a delete control, and marks the one on screen', () => {
    const html = renderSavedViewsHtml([v('?tier=E'), v('?state=stale')], 'en', { durable: true, active: STALE });
    expect(html).toContain('data-action="view-apply:0" aria-pressed="false"');
    expect(html).toContain('data-action="view-apply:1" aria-pressed="true"');
    expect(html).toContain('>Show view. Tier: E</button>');
    expect(html).toContain('>Delete view. Status: May be out of date</button>');
    expect(html.match(/data-action="view-delete:/g)).toHaveLength(2);
  });
  it('escapes search text in a view', () => {
    const html = renderSavedViewsHtml([v('?q=%3Cb%3Ex')], 'en', { durable: true, active: NO_FILTERS });
    expect(html).not.toContain('<b>x');
  });
  it('passes the markup, target and wording audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const [views, active] of [[[], NO_FILTERS], [[], TIER_E], [[v('?tier=E'), v('?state=stale&lic=open', 'Old and open')], TIER_E]] as const) {
        const html = renderSavedViewsHtml(views, locale, { durable: locale === 'en', active });
        expect(scanHtml(html)).toEqual([]);
        expect(describeProblems(auditHtml(html))).toEqual([]);
        expect(targetsBelow44(html)).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      }
    }
  });
});

describe('saved views on the panel', () => {
  const mount = (store = createSavedViewStore(null)) => {
    const host = new FakeHost();
    const seen: string[] = [];
    const panel = mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, savedViews: store, onFiltersChange: (s) => seen.push(s) });
    return { host, seen, panel, store };
  };

  it('is left out unless a store is given, and is never in the static view', () => {
    expect(renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW })).not.toContain('ds-views-title');
    const withViews = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, savedViews: { views: [], durable: false } });
    expect(withViews).toContain('id="ds-views-title"');
    expect(withViews).toContain('href="#ds-views-title"');
    expect(structureProblems(withViews)).toEqual([]);
    const page = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, savedViews: { views: [v('?tier=E')], durable: true }, staticView: { action: '/x', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' } });
    expect(page).not.toContain('ds-views-title');
  });
  it('saves the filters in force, lists the view, and says so', () => {
    const { host, store } = mount();
    host.filter('change', 'tier', 'E');
    host.click(VIEW_SAVE_ACTION);
    expect(qs(store.load())).toEqual(['?tier=E']);
    expect(host.innerHTML).toContain('>Show view. Tier: E</button>');
    expect(host.announce.innerHTML).toContain('View saved.');
  });
  it('offers saving as soon as a filter is chosen, and marks quick filters, without redrawing the form', () => {
    const { host } = mount();
    const before = host.innerHTML;
    host.filter('change', 'tier', 'unknown');
    expect(host.innerHTML).toBe(before);
    expect(host.views.innerHTML).toContain(`data-action="${VIEW_SAVE_ACTION}"`);
    expect(host.quick.innerHTML).toContain('data-action="quick:noTier" aria-pressed="true"');
    host.filter('change', 'tier', 'any');
    expect(host.views.innerHTML).toContain('Choose at least one filter to save a view.');
    expect(host.quick.innerHTML).toContain('data-action="quick:noTier" aria-pressed="false"');
  });
  it('says there is nothing to save when no filter is in force, and saves nothing', () => {
    const { host, store } = mount();
    host.click(VIEW_SAVE_ACTION);
    expect(qs(store.load())).toEqual([]);
    expect(host.announce.innerHTML).toContain('There is no filter to save.');
  });
  it('shows a saved view: sets the filters, the controls and the address', () => {
    const store = createSavedViewStore(null);
    store.save([v('?state=stale'), v('?tier=E&lic=unrecognised')]);
    const { host, seen, panel } = mount(store);
    host.click(viewApplyAction(1));
    expect(panel.getFilters()).toEqual(parseFilters('?tier=E&lic=unrecognised'));
    expect(seen.at(-1)).toContain('tier=E');
    expect(seen.at(-1)).toContain('lic=unrecognised');
    expect(host.innerHTML).toContain('<option value="E" selected>');
    expect(host.innerHTML).toContain('data-action="view-apply:1" aria-pressed="true"');
    expect(host.announce.innerHTML).toContain('tier E');
  });
  it('deletes a view and says so, leaving the filters alone', () => {
    const store = createSavedViewStore(null);
    store.save([v('?state=stale'), v('?tier=E')]);
    const { host, panel } = mount(store);
    host.filter('change', 'tier', 'E');
    host.click(viewDeleteAction(0));
    expect(qs(store.load())).toEqual(['?tier=E']);
    expect(panel.getFilters().tier).toBe('E');
    expect(host.announce.innerHTML).toContain('View deleted.');
  });
  it('ignores positions that do not exist', () => {
    const { host, seen, store } = mount();
    host.click(viewApplyAction(3));
    host.click(viewDeleteAction(3));
    expect(seen).toEqual([]);
    expect(qs(store.load())).toEqual([]);
  });
  it('does nothing with view actions when no store is given', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW });
    expect(() => host.click(VIEW_SAVE_ACTION)).not.toThrow();
    expect(host.innerHTML).not.toContain('ds-views-title');
  });
  it('says the view could not be saved when the device refuses the write', () => {
    const storage = memoryStorage();
    const { host } = mount(createSavedViewStore({ ...storage, setItem: () => { throw new Error('quota'); } }));
    host.filter('change', 'tier', 'E');
    host.click(VIEW_SAVE_ACTION);
    expect(host.announce.innerHTML).toContain('The view could not be saved on this device.');
  });
});

describe('view names', () => {
  it('cleans a name: trims, collapses spaces, removes control characters, cuts to the limit', () => {
    expect(cleanViewName('  Old   places  ')).toBe('Old places');
    expect(cleanViewName('Line\none\ttwo')).toBe('Line one two');
    expect(cleanViewName('x'.repeat(200))).toHaveLength(MAX_VIEW_NAME_LENGTH);
    expect(cleanViewName(`${'x'.repeat(MAX_VIEW_NAME_LENGTH - 1)} tail`)).toBe('x'.repeat(MAX_VIEW_NAME_LENGTH - 1));
  });
  it('treats nothing, blanks and other types as no name', () => {
    for (const raw of ['', '   ', '\n\t', null, undefined, 5, {}]) expect(cleanViewName(raw)).toBeNull();
  });
  it('saves a view with a name, and without one', () => {
    const store = createSavedViewStore(null);
    expect(addView(store, TIER_E, '  Desk checks ').views).toEqual([v('?tier=E', 'Desk checks')]);
    expect(addView(store, STALE, '   ').views[1]).toEqual(v('?state=stale'));
    expect(addView(store, { ...NO_FILTERS, kind: 'places' }).views[2]).toEqual(v('?kind=places'));
  });
  it('does not save the same filters twice under another name', () => {
    const store = createSavedViewStore(null);
    addView(store, TIER_E, 'One');
    expect(addView(store, TIER_E, 'Two').outcome).toBe('exists');
    expect(store.load()).toEqual([v('?tier=E', 'One')]);
  });
  it('stores a plain query for a view without a name and an object for one with a name', () => {
    expect(viewsToStored([v('?tier=E'), v('?state=stale', 'Old')])).toEqual(['?tier=E', { q: '?state=stale', name: 'Old' }]);
  });
  it('reads back both stored forms, and cleans what it reads', () => {
    const storage = memoryStorage();
    storage.setItem(SAVED_VIEWS_KEY, JSON.stringify(['?tier=E', { q: 'state=stale&junk=1', name: '  Old\nones ' }, { q: '?tier=E', name: 'Repeat' }, { name: 'No filters' }, { q: 7 }, { q: '?kind=places', name: 9 }]));
    expect(createSavedViewStore(storage).load()).toEqual([v('?tier=E'), v('?state=stale', 'Old ones'), v('?kind=places')]);
  });
  it('keeps names through a save and a fresh load', () => {
    const storage = memoryStorage();
    addView(createSavedViewStore(storage), TIER_E, 'Desk checks');
    expect(createSavedViewStore(storage).load()).toEqual([v('?tier=E', 'Desk checks')]);
  });
  it('does not hand out objects that can change the stored list', () => {
    const store = createSavedViewStore(null);
    addView(store, TIER_E, 'Name');
    const first = store.load()[0];
    if (first) first.name = 'Changed';
    expect(store.load()[0]?.name).toBe('Name');
  });
  it('describes a named view by its name with its filters in brackets', () => {
    expect(savedViewLabel(v('?tier=E', 'Desk checks'), 'en')).toBe('Desk checks (Tier: E)');
    expect(savedViewLabel(v('?tier=E'), 'en')).toBe('Tier: E');
    expect(savedViewLabel(v('?tier=E', 'Bureau'), 'fr')).toBe('Bureau (Niveau : E)');
  });
  it('offers a labelled name field with the save control, and only then', () => {
    const html = renderSavedViewsHtml([], 'en', { durable: false, active: TIER_E, draftName: 'Half typed' });
    expect(html).toContain('<label for="ds-view-name">Name for the view (optional)</label>');
    expect(html).toContain(`maxlength="${MAX_VIEW_NAME_LENGTH}"`);
    expect(html).toContain('value="Half typed"');
    expect(html).toContain('data-filter="viewName"');
    expect(renderSavedViewsHtml([], 'en', { durable: false, active: NO_FILTERS })).not.toContain('ds-view-name');
    expect(renderSavedViewsHtml([v('?tier=E')], 'en', { durable: false, active: TIER_E })).not.toContain('ds-view-name');
  });
  it('escapes a name in the field and in the list', () => {
    const html = renderSavedViewsHtml([v('?state=stale', '<b>"x"</b>')], 'en', { durable: false, active: TIER_E, draftName: '"><i>' });
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<i>');
    expect(html).toContain('Show view. &lt;b&gt;');
  });
  it('lists a named view by its name', () => {
    const html = renderSavedViewsHtml([v('?tier=E', 'Desk checks')], 'en', { durable: true, active: NO_FILTERS });
    expect(html).toContain('>Show view. Desk checks (Tier: E)</button>');
    expect(html).toContain('>Delete view. Desk checks (Tier: E)</button>');
  });
});

describe('naming a view on the panel', () => {
  const mount = () => {
    const host = new FakeHost();
    const store = createSavedViewStore(null);
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, savedViews: store });
    return { host, store };
  };
  it('saves the typed name with the view and clears the field for the next one', () => {
    const { host, store } = mount();
    host.filter('change', 'tier', 'E');
    host.filter('input', 'viewName', '  Desk checks ');
    host.click(VIEW_SAVE_ACTION);
    expect(store.load()).toEqual([v('?tier=E', 'Desk checks')]);
    expect(host.innerHTML).toContain('>Show view. Desk checks (Tier: E)</button>');
    host.filter('change', 'tier', 'unknown');
    expect(host.views.innerHTML).toContain('id="ds-view-name"');
    expect(host.views.innerHTML).toContain('value=""');
  });
  it('typing a name redraws nothing', () => {
    const { host } = mount();
    host.filter('change', 'tier', 'E');
    const before = [host.innerHTML, host.region.innerHTML, host.views.innerHTML, host.announce.innerHTML];
    host.filter('input', 'viewName', 'Typing');
    expect([host.innerHTML, host.region.innerHTML, host.views.innerHTML, host.announce.innerHTML]).toEqual(before);
  });
  it('keeps what was typed when a filter change redraws the section', () => {
    const { host } = mount();
    host.filter('change', 'tier', 'E');
    host.filter('input', 'viewName', 'Keep me');
    host.filter('change', 'licence', 'unrecognised');
    expect(host.views.innerHTML).toContain('value="Keep me"');
  });
  it('keeps the name when the save does not happen, so it can be tried again', () => {
    const { host, store } = mount();
    host.filter('input', 'viewName', 'Too early');
    host.click(VIEW_SAVE_ACTION);
    expect(store.load()).toEqual([]);
    host.filter('change', 'tier', 'E');
    expect(host.views.innerHTML).toContain('value="Too early"');
  });
  it('cuts an overlong name to the limit', () => {
    const { host, store } = mount();
    host.filter('change', 'tier', 'E');
    host.filter('input', 'viewName', 'y'.repeat(300));
    host.click(VIEW_SAVE_ACTION);
    expect(store.load()[0]?.name).toHaveLength(MAX_VIEW_NAME_LENGTH);
  });
});

describe('how many sources a saved view lists now', () => {
  it('is stated for each view when a counter is given, with the right plural', () => {
    const html = renderSavedViewsHtml([v('?tier=E'), v('?state=stale', 'Old')], 'en', { durable: true, active: NO_FILTERS, countFor: (f) => (f.tier === 'E' ? 1 : 4) });
    expect(html).toContain('>Lists 1 source now.</span>');
    expect(html).toContain('>Lists 4 sources now.</span>');
    expect(renderSavedViewsHtml([v('?tier=E')], 'fr', { durable: true, active: NO_FILTERS, countFor: () => 0 })).toContain('>Présente 0 source actuellement.</span>');
  });
  it('is left out when no counter is given', () => {
    expect(renderSavedViewsHtml([v('?tier=E')], 'en', { durable: true, active: NO_FILTERS })).not.toContain('Lists ');
  });
  it('on the panel, matches what showing the view lists', () => {
    const host = new FakeHost();
    const store = createSavedViewStore(null);
    store.save([v('?tier=E'), v('?tier=4', 'Feeds')]);
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, savedViews: store });
    expect(host.innerHTML).toContain('>Lists 1 source now.</span>');
    expect(host.innerHTML).toContain('>Lists 0 sources now.</span>');
    host.click(viewApplyAction(0));
    expect((host.innerHTML.match(/data-listed-summary="1"/g) ?? []).length).toBe(1);
  });
  it('passes the audits with counts and names, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderSavedViewsHtml([v('?tier=E', 'Desk'), v('?state=stale')], locale, { durable: true, active: TIER_E, countFor: () => 2, draftName: 'x' });
      expect(scanHtml(html)).toEqual([]);
      expect(describeProblems(auditHtml(html))).toEqual([]);
      expect(targetsBelow44(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
    }
  });
});
