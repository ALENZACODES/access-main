import { afterEach, describe, expect, it } from 'vitest';
import { snapshotInPage } from './inpage.js';
import * as barrel from './index.js';
import { OVERFLOW_ARGS, overflowInPage } from './overflow-inpage.js';
import { factsOf, originOf, regionOf } from './overflow-testkit.js';
import { INTERACTIVE_SELECTOR } from './page.js';
import { renderText } from './report.js';
import { auditSnapshot, runAudit, selfAudit, type FullPage } from './run.js';
import { installDom, type Installed, type Spec } from './testkit.js';

/** The overflow probe as part of an audit: in the pure step, in the audit of the live document, and in a run with a page. */

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});

const NOW = new Date('2026-11-19T12:00:00Z');
const snap = (): ReturnType<typeof snapshotInPage> => snapshotInPage({ selector: INTERACTIVE_SELECTOR, maxElements: 100 });
const reflowOf = (entries: ReadonlyArray<{ check: string; rule?: string; id: string; status: string }>): string[] => entries.filter((e) => e.check === 'reflow').map((e) => `${e.status} ${e.rule ?? '-'} ${e.id}`);

/** A page 320 pixels wide whose card is 600 pixels wide. */
const WIDE: Spec[] = [{ tag: 'main', rect: [0, 0, 320, 200], children: [{ tag: 'div', id: 'card', rect: [0, 0, 600, 100], children: [{ tag: 'p', text: 'Opening hours', rect: [0, 0, 600, 20] }] }] }];
const FITS: Spec[] = [{ tag: 'main', rect: [0, 0, 320, 200], children: [{ tag: 'p', text: 'Opening hours', rect: [0, 0, 320, 20] }] }];

describe('auditSnapshot', () => {
  it('leaves the reflow check as it was when no overflow facts are given', () => {
    dom = installDom(WIDE, { scrollWidth: 600 });
    const audit = auditSnapshot('/x', 320, { snapshot: snap() });
    expect(reflowOf(audit.entries)).toEqual(['fail - page']);
  });

  it('adds the causes to the reflow check, after the finding that the page scrolls', () => {
    dom = installDom(WIDE, { scrollWidth: 600 });
    const audit = auditSnapshot('/x', 320, { snapshot: snap(), overflow: factsOf({ origins: [originOf()] }) });
    expect(reflowOf(audit.entries)).toEqual(['fail - page', 'fail cause-fixed-width div#card[0]']);
    const reflow = audit.checks.find((c) => c.check === 'reflow');
    expect(reflow).toMatchObject({ failed: 2, unknown: 0 });
    expect(reflow?.checked).toBeGreaterThan(40);
  });

  it('adds a region as UNKNOWN on a page that does not scroll', () => {
    dom = installDom(FITS);
    const audit = auditSnapshot('/x', 320, { snapshot: snap(), overflow: factsOf({ regions: [regionOf({ table: true })] }) });
    expect(reflowOf(audit.entries)).toEqual(['unknown region-content div#scroller[0]']);
  });

  it('adds nothing for a page that fits', () => {
    dom = installDom(FITS);
    const audit = auditSnapshot('/x', 320, { snapshot: snap(), overflow: factsOf() });
    expect(reflowOf(audit.entries)).toEqual([]);
  });
});

describe('the probe on the shared stand-in document', () => {
  it('finds the wide card under a parent that fits', () => {
    dom = installDom(WIDE, { scrollWidth: 600 });
    const facts = overflowInPage(OVERFLOW_ARGS);
    expect(facts.pageScrolls).toBe(true);
    expect(facts.origins.map((o) => o.id)).toEqual(['div#card[0]']);
    expect(facts.origins[0]).toMatchObject({ widthPx: 600, spacePx: 320, overPx: 280 });
  });

  it('finds nothing on a page that fits', () => {
    dom = installDom(FITS);
    expect(overflowInPage(OVERFLOW_ARGS)).toMatchObject({ pageScrolls: false, origins: [], regions: [] });
  });

  it('finds a region that scrolls and what it holds', () => {
    dom = installDom([
      {
        tag: 'div',
        id: 'scroller',
        rect: [0, 0, 320, 100],
        style: { overflowX: 'auto' } as never,
        scroll: { sw: 600, cw: 320, sh: 100, ch: 100 },
        attrs: { tabindex: '0' },
        children: [{ tag: 'table', rect: [0, 0, 600, 100] }],
      },
    ]);
    const facts = overflowInPage(OVERFLOW_ARGS);
    expect(facts.regions).toEqual([{ id: 'div#scroller[0]', tag: 'div', contentPx: 600, spacePx: 320, table: true, pre: false, media: false, textBlock: false, role: '', keyboard: true }]);
  });
});

describe('selfAudit', () => {
  it('names the cause when the live document scrolls sideways', () => {
    dom = installDom(WIDE, { scrollWidth: 600 });
    const report = selfAudit(NOW);
    expect(reflowOf(report.routes[0]?.entries ?? [])).toEqual(['fail - page', 'fail cause-fixed-width div#card[0]']);
  });

  it('shows the cause, with what was measured, in the text of the report in both languages', () => {
    dom = installDom(WIDE, { scrollWidth: 600 });
    const report = selfAudit(NOW);
    expect(renderText(report, 'en')).toContain('This element is 600px wide in a space of 320px, so a width has been set on it.');
    expect(renderText(report, 'fr')).toContain('Cet élément fait 600\u00A0px de large dans un espace de 320\u00A0px');
  });

  it('says the cause was not found when the page scrolls and no element explains it', () => {
    dom = installDom(FITS, { scrollWidth: 600 });
    const report = selfAudit(NOW);
    expect(reflowOf(report.routes[0]?.entries ?? [])).toEqual(['fail - page', 'unknown cause-not-found page']);
  });

  it('adds nothing to the reflow check of a page that fits', () => {
    dom = installDom(FITS);
    expect(reflowOf(selfAudit(NOW).routes[0]?.entries ?? [])).toEqual([]);
  });

  it('leaves the document alone', () => {
    dom = installDom(WIDE, { scrollWidth: 600 });
    selfAudit(NOW);
    expect(dom.world.scrollTo).toEqual([]);
    expect(dom.world.styleElements).toBe(0);
    expect(dom.world.active).toBeNull();
  });
});

describe('runAudit', () => {
  const page = (spec: Spec[], scrollWidth: number): FullPage => ({
    async setViewportSize() {},
    async goto() {
      dom?.uninstall();
      dom = installDom(spec, { scrollWidth });
    },
    async reload() {},
    async evaluate(fn, arg) {
      return fn(arg);
    },
  });

  it('runs the probe on each route and puts the causes in its reflow check', async () => {
    const report = await runAudit({ page: page(WIDE, 600), baseUrl: 'https://example.org', routes: ['/a'], now: NOW });
    expect(reflowOf(report.routes[0]?.entries ?? [])).toEqual(['fail - page', 'fail cause-fixed-width div#card[0]']);
  });

  it('adds nothing for a route that fits', async () => {
    const report = await runAudit({ page: page(FITS, 320), baseUrl: 'https://example.org', routes: ['/a'], now: NOW });
    expect(reflowOf(report.routes[0]?.entries ?? [])).toEqual([]);
  });
});

describe('the barrel', () => {
  it('exports the overflow probe and its causes', () => {
    expect(barrel.overflowInPage).toBe(overflowInPage);
    expect(typeof barrel.auditOverflow).toBe('function');
    expect(typeof barrel.causeOf).toBe('function');
    expect(barrel.CAUSE_KINDS).toHaveLength(12);
  });

  it('exports the colour modules of the earlier rounds', () => {
    for (const name of ['readColor', 'rgbToOklch', 'fixContrast', 'auditContrastWithFixes', 'themesFromCss', 'auditPalette', 'renderPairTool', 'comparePair'] as const) {
      expect(typeof barrel[name], name).toBe('function');
    }
  });
});
