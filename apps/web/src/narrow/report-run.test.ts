import { afterEach, describe, expect, it } from 'vitest';
import { auditContrast } from './contrast.js';
import { auditFocusObscured } from './focus.js';
import { auditI18n, frTypographyIssues } from './i18n.js';
import { snapshotInPage } from './inpage.js';
import { auditLanguage, auditNames } from './names.js';
import { offlineCheckResult } from './offline.js';
import { INTERACTIVE_SELECTOR } from './page.js';
import {
  addCheck,
  buildRouteAudit,
  entriesFromFindings,
  escapeHtml,
  makeReport,
  renderBody,
  renderHtml,
  renderJson,
  renderText,
  totals,
  CHECK_LABELS,
  SCOPE_NOTE,
} from './index.js';
import { auditSnapshot, runAudit, selfAudit, type AuditPage } from './run.js';
import { auditTargetSpacing } from './spacing.js';
import { auditTextSpacing } from './textspacing.js';
import { installDom, type Installed, type Spec } from './testkit.js';
import { auditReflow, auditTargets, describeFinding, type Box } from './audit.js';

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});

const NOW = new Date('2026-11-15T20:00:00.000Z');

const page: Spec[] = [
  { tag: 'header', style: { position: 'fixed' }, rect: [0, 0, 320, 600], children: [] },
  { tag: 'button', id: 'go', text: 'Go', interactive: true, rect: [0, 0, 30, 30], attrs: { 'aria-label': 'Search' } },
  { tag: 'a', interactive: true, rect: [0, 100, 400, 150], attrs: { href: '/x' } },
  { tag: 'p', text: 'Low contrast', style: { color: 'rgb(200, 200, 200)', backgroundColor: 'rgb(255, 255, 255)' } },
];

describe('entriesFromFindings', () => {
  it('routes target findings to target-size and the rest to reflow', () => {
    const boxes: Box[] = [{ id: 'w', left: 0, right: 400, width: 400, height: 20 }];
    const f = [...auditReflow(boxes, 400, 320), ...auditTargets(boxes)];
    const m = entriesFromFindings(f);
    expect(m.reflow.map((e) => e.check)).toEqual(['reflow', 'reflow']);
    expect(m.targets.map((e) => e.check)).toEqual(['target-size']);
    expect(m.targets[0]?.message).toEqual(describeFinding(f[2] ?? f[0]!));
  });
});

describe('auditSnapshot', () => {
  it('combines every check and keeps counts of what was looked at', () => {
    dom = installDom(page, { lang: '', scrollWidth: 420 });
    const snapshot = snapshotInPage({ selector: INTERACTIVE_SELECTOR, maxElements: 100 });
    const a = auditSnapshot('/map', 320, { snapshot });
    const byCheck = Object.fromEntries(a.checks.map((c) => [c.check, c]));
    expect(byCheck['reflow']?.failed).toBeGreaterThanOrEqual(2);
    expect(byCheck['target-size']?.failed).toBe(1);
    expect(byCheck['contrast']?.failed).toBe(1);
    expect(byCheck['language']?.failed).toBe(1);
    expect(byCheck['name']?.failed).toBe(1);
    expect(byCheck['focus-obscured']).toBeUndefined();
    expect(byCheck['text-spacing']).toBeUndefined();
    expect(a.viewportWidth).toBe(320);
  });

  it('adds focus and text spacing results when they were probed', () => {
    dom = installDom(page);
    const snapshot = snapshotInPage({ selector: INTERACTIVE_SELECTOR, maxElements: 100 });
    const a = auditSnapshot('/map', 320, {
      snapshot,
      focus: [{ id: 'a', rect: { left: 0, top: 0, right: 10, bottom: 10 }, covers: [{ left: 0, top: 0, right: 20, bottom: 20 }], focused: true }],
      textSpacing: { checked: 3, newlyClipped: [] },
    });
    expect(a.checks.find((c) => c.check === 'focus-obscured')?.failed).toBe(1);
    expect(a.checks.find((c) => c.check === 'text-spacing')?.checked).toBe(3);
  });
});

describe('report building', () => {
  const route = buildRouteAudit(
    '/a',
    320,
    {
      contrast: { checked: 4, entries: [{ check: 'contrast', id: 'p[0]', status: 'fail', message: { en: 'e', fr: 'f' } }] },
      offline: { checked: 1, entries: [{ check: 'offline', id: '/a', status: 'unknown', message: { en: 'e2', fr: 'f2' } }] },
    },
    2,
  );
  it('summarises per check in a stable order', () => {
    expect(route.checks.map((c) => [c.check, c.checked, c.failed, c.unknown])).toEqual([
      ['contrast', 4, 1, 0],
      ['offline', 1, 0, 1],
    ]);
    expect(totals([route])).toEqual({ checked: 5, failed: 1, unknown: 1, unmeasured: 2 });
  });
  it('addCheck keeps the other checks', () => {
    const r2 = addCheck(route, 'name', { checked: 3, entries: [] });
    expect(r2.checks.map((c) => c.check)).toEqual(['contrast', 'name', 'offline']);
    expect(r2.entries).toHaveLength(2);
  });
});

describe('rendering', () => {
  const route = buildRouteAudit(
    '/a<b>',
    320,
    { contrast: { checked: 1, entries: [{ check: 'contrast', id: '<img onerror=x>', status: 'fail', message: { en: 'a & b', fr: 'c' } }] } },
  );
  const report = makeReport([route], NOW);

  it('escapes everything it prints', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    const html = renderHtml(report, 'en');
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img onerror=x&gt;');
    expect(html).toContain('/a&lt;b&gt;');
  });
  it('sets lang, viewport meta and a 44px button style', () => {
    const fr = renderHtml(report, 'fr');
    expect(fr).toContain('<html lang="fr">');
    expect(fr).toContain('name="viewport"');
    expect(fr).toContain('min-height:44px');
    expect(fr).toContain('Audit écran étroit');
  });
  it('states the scope and records the source with its date', () => {
    const text = renderText(report, 'en');
    expect(text).toContain(SCOPE_NOTE.en);
    expect(text).toContain('https://www.w3.org/TR/WCAG22/');
    expect(text).toContain('2023-10-05');
    expect(renderText(report, 'fr')).toContain(`WCAG 2.2`);
  });
  it('never claims conformance or verification', () => {
    const all = renderText(report, 'en') + renderText(report, 'fr') + renderHtml(report, 'en');
    expect(all).not.toMatch(/\bverified\b|AAA|certified|real-time|temps réel/i);
  });
  it('JSON round-trips', () => {
    const parsed = JSON.parse(renderJson(report)) as { generatedAt: string; routes: unknown[] };
    expect(parsed.generatedAt).toBe(NOW.toISOString());
    expect(parsed.routes).toHaveLength(1);
  });
  it('body has one section per route', () => {
    expect(renderBody(report, 'en').match(/<section/g)).toHaveLength(1);
  });
});

describe('every French message follows the typography rules', () => {
  it('covers each audit and each check label', () => {
    const entries = [
      ...entriesFromFindings([
        { kind: 'target-too-small', id: 'a', width: 30, height: 30, overflowPx: 0 },
        { kind: 'horizontal-overflow', id: 'a', width: 30, height: 30, overflowPx: 9 },
        { kind: 'page-scrolls-sideways', id: 'page', width: 400, height: 0, overflowPx: 80 },
      ]).reflow,
      ...auditTargetSpacing([
        { id: 'a', left: 0, top: 0, right: 10, bottom: 10 },
        { id: 'b', left: 12, top: 0, right: 22, bottom: 10 },
      ]).entries,
      ...auditContrast([
        { id: 'a', text: 'x', fg: '#777', bgLayers: ['rgb(255, 255, 255)'], bgImage: false, fontSizePx: 16, fontWeight: 400 },
        { id: 'b', text: 'x', fg: '#777', bgLayers: [], bgImage: true, fontSizePx: 16, fontWeight: 400 },
      ]).entries,
      ...auditNames([
        { id: 'a', tag: 'a', role: null, rect: { left: 0, top: 0, right: 1, bottom: 1 }, name: '', text: '' },
        { id: 'b', tag: 'a', role: null, rect: { left: 0, top: 0, right: 1, bottom: 1 }, name: 'Menu', text: 'Home' },
      ]).names.entries,
      ...auditNames([{ id: 'b', tag: 'a', role: null, rect: { left: 0, top: 0, right: 1, bottom: 1 }, name: 'Menu', text: 'Home' }]).labels.entries,
      ...auditLanguage({ lang: '' }).entries,
      ...auditLanguage({ lang: '!!' }).entries,
      ...auditFocusObscured([
        { id: 'a', rect: { left: 0, top: 0, right: 1, bottom: 1 }, covers: [{ left: 0, top: 0, right: 1, bottom: 1 }], focused: true },
        { id: 'b', rect: { left: 0, top: 0, right: 1, bottom: 1 }, covers: [], focused: false },
      ]).entries,
      ...auditTextSpacing({ checked: 1, newlyClipped: [{ id: 'a', scrollWidth: 1, clientWidth: 1, scrollHeight: 2, clientHeight: 1 }] }).entries,
      ...auditI18n(
        { a: 'x', b: 'y', c: 'z {n}', d: 'Same text that is long enough', e: 'e' },
        { b: ' ', c: 'z', d: 'Same text that is long enough', f: 'f', e: "l'e" },
      ).entries,
      ...(['unsupported', 'no-service-worker', 'error-page', 'empty-page', 'exception'] as const).flatMap(
        (reason) => offlineCheckResult('/', { status: reason === 'unsupported' ? 'unknown' : 'fail', reason }).entries,
      ),
    ];
    expect(entries.length).toBeGreaterThan(20);
    for (const e of entries) {
      expect(e.message.en.length).toBeGreaterThan(0);
      expect(frTypographyIssues(e.message.fr), e.message.fr).toEqual([]);
    }
    for (const l of Object.values(CHECK_LABELS)) expect(frTypographyIssues(l.fr), l.fr).toEqual([]);
  });
});

describe('runAudit and selfAudit', () => {
  function livePage(log: string[]): AuditPage {
    return {
      async setViewportSize(s) {
        log.push(`viewport ${s.width}`);
      },
      async goto(url) {
        log.push(`goto ${url}`);
        dom?.uninstall();
        dom = installDom(page);
      },
      async reload() {
        log.push('reload');
      },
      async evaluate(fn, arg) {
        return fn(arg);
      },
    };
  }

  it('audits each route at 320px and appends the string check', async () => {
    const log: string[] = [];
    const report = await runAudit({
      page: livePage(log),
      baseUrl: 'http://localhost:5173/',
      routes: ['/', 'map'],
      i18n: { en: { a: 'x' }, fr: {} },
      now: NOW,
    });
    expect(log.filter((l) => l.startsWith('goto'))).toEqual(['goto http://localhost:5173/', 'goto http://localhost:5173/map']);
    expect(log[0]).toBe('viewport 320');
    expect(report.routes.map((r) => r.route)).toEqual(['/', 'map', 'strings']);
    expect(report.routes[2]?.viewportWidth).toBeNull();
    expect(report.routes[0]?.checks.some((c) => c.check === 'focus-obscured')).toBe(true);
    expect(report.routes[0]?.checks.some((c) => c.check === 'offline')).toBe(false);
    expect(dom?.world.styleElements).toBe(0);
  });

  it('selfAudit reads the live document without probing focus', () => {
    dom = installDom(page, { innerWidth: 360, scrollWidth: 360, clientWidth: 360 });
    const report = selfAudit(NOW);
    expect(report.routes).toHaveLength(1);
    expect(report.routes[0]?.viewportWidth).toBe(360);
    expect(report.routes[0]?.checks.some((c) => c.check === 'focus-obscured')).toBe(false);
    expect(dom.world.scrollTo).toEqual([]);
  });
});
