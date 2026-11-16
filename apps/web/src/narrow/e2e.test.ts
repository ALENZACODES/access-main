import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderPanel } from './panel.js';
import { PROFILES } from './profiles.js';
import { buildRouteAudit, makeReport, renderHtml, totals, type RouteAudit } from './report.js';
import { auditLoadedPage, type FullPage } from './run.js';

/**
 * Real browser gates. They run when NARROW_E2E=1 and playwright-core (or
 * @playwright/test) with a Chromium is installed, and are skipped otherwise.
 * They audit the pages this folder produces and fail on any finding, and a
 * deliberately bad page proves that the audit fails on violations.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

interface BrowserPage extends FullPage {
  setContent(html: string): Promise<void>;
}
interface Launched {
  page: BrowserPage;
  close(): Promise<void>;
}

async function launch(): Promise<Launched> {
  for (const name of ['playwright-core', '@playwright/test']) {
    try {
      const mod = (await import(/* @vite-ignore */ name)) as { chromium?: unknown; default?: { chromium?: unknown } };
      const chromium = (mod.chromium ?? mod.default?.chromium) as { launch(): Promise<{ newContext(): Promise<{ addInitScript(s: string): Promise<void>; newPage(): Promise<unknown> }>; close(): Promise<void> }> } | undefined;
      if (!chromium) continue;
      const browser = await chromium.launch();
      const context = await browser.newContext();
      await context.addInitScript('globalThis.__name = globalThis.__name || ((f) => f);');
      return { page: (await context.newPage()) as BrowserPage, close: () => browser.close() };
    } catch {
      // try the next package
    }
  }
  throw new Error('playwright-core or @playwright/test is needed for NARROW_E2E=1');
}

const NOW = new Date('2026-11-15T12:00:00Z');
const sampleReport = makeReport(
  [
    buildRouteAudit('/map', 320, {
      contrast: { checked: 2, entries: [{ check: 'contrast', id: 'p[1]', status: 'fail', rule: 'x', message: { en: 'Low.', fr: 'Faible.' } }] },
    }),
  ],
  NOW,
);

const shell = (lang: 'en' | 'fr', body: string): string =>
  `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Audit</title></head><body><main>${body}</main></body></html>`;

function findings(audit: RouteAudit): string[] {
  return audit.entries.filter((e) => e.status === 'fail').map((e) => `${e.check}${e.rule ? `/${e.rule}` : ''} ${e.id}: ${e.message.en}`);
}

describe.skipIf(!enabled)('real browser gates', () => {
  let b: Launched;
  beforeAll(async () => {
    b = await launch();
  }, 60_000);
  afterAll(async () => {
    await b?.close();
  });
  // Media emulation sticks to the page, so every test starts from the 320px profile.
  beforeEach(async () => {
    const narrow = PROFILES[0];
    if (narrow) {
      await b.page.setViewportSize(narrow.viewport);
      await b.page.emulateMedia?.(narrow.media);
    }
  });

  for (const lang of ['en', 'fr'] as const) {
    it(`the report page (${lang}) has no failures in any profile`, async () => {
      for (const profile of PROFILES) {
        await b.page.setViewportSize({ width: profile.viewport.width, height: profile.viewport.height });
        await b.page.emulateMedia?.(profile.media);
        await b.page.setContent(renderHtml(sampleReport, lang));
        const audit = await auditLoadedPage(b.page, `report-${lang}-${profile.id}`, { profile, keyboard: profile.id === 'narrow' });
        expect(findings(audit), `${profile.id}`).toEqual([]);
        expect(totals([audit]).checked).toBeGreaterThan(10);
      }
    }, 60_000);

    it(`the panel (${lang}) has no failures`, async () => {
      await b.page.setViewportSize({ width: 320, height: 640 });
      await b.page.setContent(shell(lang, renderPanel(lang, { kind: 'done', report: sampleReport })));
      const audit = await auditLoadedPage(b.page, `panel-${lang}`, {});
      expect(findings(audit)).toEqual([]);
      const keyboard = audit.checks.find((c) => c.check === 'keyboard');
      expect(keyboard?.checked).toBeGreaterThan(0);
    }, 30_000);
  }

  it('a page with violations fails the audit', async () => {
    await b.page.setViewportSize({ width: 320, height: 640 });
    await b.page.setContent(
      '<!doctype html><html><head><title>Bad</title><style>a:focus,button:focus{outline:none}</style></head><body>' +
        '<div style="width:600px">wide</div>' +
        '<button style="width:20px;height:20px"></button>' +
        '<a href="#x" style="display:inline-block;min-height:44px;min-width:44px">Link</a>' +
        '<p style="color:#bbb;background:#fff">Low contrast and verified claim</p>' +
        '<input type="text"></body></html>',
    );
    const audit = await auditLoadedPage(b.page, 'bad', {});
    const checks = new Set(audit.entries.filter((e) => e.status === 'fail').map((e) => e.check));
    for (const c of ['reflow', 'target-size', 'contrast', 'name', 'language', 'static-html', 'copy', 'focus-visible']) {
      expect(checks.has(c as never), c).toBe(true);
    }
    expect(totals([audit]).failed).toBeGreaterThan(8);
  }, 30_000);
});
