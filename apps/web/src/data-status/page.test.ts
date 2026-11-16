import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PAGE_CSS,
  contrastRatio,
  lintFrench,
  renderDataStatusPage,
  scanHtml,
  visibleText,
  EN,
  FR,
  type LoadIssue,
} from './index';
import { NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const page = (locale: 'en' | 'fr', extra: Partial<Parameters<typeof renderDataStatusPage>[0]> = {}) =>
  renderDataStatusPage({ records: RECORDS, locale, now: NOW, ...extra });

describe('renderDataStatusPage', () => {
  it('is a complete document in the right language with a viewport and a title', () => {
    for (const l of ['en', 'fr'] as const) {
      const html = page(l);
      expect(html.startsWith('<!doctype html><html lang="' + l + '">')).toBe(true);
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
      expect(html).toContain(`<title>${l === 'en' ? EN['page.title'] : FR['page.title']}</title>`);
    }
  });

  it('has the landmarks: skip link first, one h1, main with the skip target, footer', () => {
    const html = page('en');
    expect(html.indexOf('<body>') + 6).toBe(html.indexOf('<a class="ds-skip"'));
    expect(html).toContain('href="#main"');
    expect(html).toContain('<main id="main" tabindex="-1">');
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect((html.match(/<main\b/g) ?? []).length).toBe(1);
    expect(html).toContain('<footer>');
    expect(html).toContain('<nav aria-label=');
  });

  it('heading levels never skip (h1 > h2 > h3)', () => {
    const levels = [...page('en').matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
  });

  it('language switch links to the other locale with hreflang, lang and a 44px target', () => {
    const en = page('en', { pathname: '/en/data-status' });
    expect(en).toContain('href="/fr/data-status" hreflang="fr" lang="fr"');
    expect(en).toContain('>Français</a>');
    const fr = page('fr', { pathname: '/fr/data-status' });
    expect(fr).toContain('href="/en/data-status" hreflang="en" lang="en"');
    expect(fr).toContain('>English</a>');
    expect(page('en')).toContain('href="/fr/data-status"');
  });

  it('is accessible in structure and every control is 44px', () => {
    for (const l of ['en', 'fr'] as const) {
      const html = page(l);
      expect(structureProblems(html)).toEqual([]);
      expect(targetsBelow44(html)).toEqual([]);
    }
  });

  it('contains no banned wording (EN and FR), and FR text passes the typography lint', () => {
    expect(scanHtml(page('en'))).toEqual([]);
    expect(scanHtml(page('fr'))).toEqual([]);
    expect(lintFrench(visibleText(page('fr')))).toEqual([]);
  });

  it('shows what could not be read, in the page language, escaped', () => {
    const issues: LoadIssue[] = [{ severity: 'error', code: 'bad-kind', path: 'datasets[0].<kind>' }];
    const fr = page('fr', { loadIssues: issues });
    expect(fr).toContain('Certaines fiches n’ont pas pu être lues');
    expect(fr).toContain('datasets[0].&lt;kind&gt;\u00A0: type de jeu de données inconnu');
    expect(page('en')).not.toContain('could not be read');
    expect(structureProblems(fr)).toEqual([]);
  });

  it('escapes dataset names so markup in data cannot reach the page', () => {
    const html = page('en');
    expect(html).toContain('Places &lt;A&gt;');
    expect(html).not.toContain('<A>');
  });

  it('includes the panel with the offline note when showing a saved copy', () => {
    const html = page('en', { snapshotSavedAt: '2026-11-10T00:00:00.000Z' });
    expect(html).toContain('Showing the saved copy');
    expect(html).toContain('id="data-status"');
  });
});

describe('PAGE_CSS', () => {
  it('uses a focus ring and link colour with at least 3:1 and 4.5:1 contrast on white', () => {
    expect(PAGE_CSS).toContain(':focus-visible{outline:3px solid #1D4ED8');
    expect(contrastRatio('#1D4ED8', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#111827', '#FFFFFF')).toBeGreaterThanOrEqual(7);
    expect(contrastRatio('#4B5563', '#FFFFFF')).toBeGreaterThanOrEqual(3);
  });

  it('keeps the skip link reachable and wide tables inside a scroller', () => {
    expect(PAGE_CSS).toContain('.ds-skip:focus{position:static');
    expect(PAGE_CSS).toContain('.ds-scroll{overflow-x:auto}');
    expect(PAGE_CSS).not.toMatch(/outline:\s*(none|0)/);
  });
});

describe('standalone entry files stay in step with the page', () => {
  const html = read('./standalone/index.html');
  const main = read('./standalone/main.ts');

  it('index.html has language, viewport, one h1, a skip link, the mount point and the module entry', () => {
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain(`<title>${EN['page.title']}</title>`);
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(html).toContain('id="page-title"');
    expect(html).toContain('id="skip-link" href="#main"');
    expect(html).toContain('<main id="main" tabindex="-1">');
    expect(html).toContain('<div id="data-status"></div>');
    expect(html).toContain('<script type="module" src="./main.ts"></script>');
  });

  it('index.html embeds exactly the shared CSS', () => {
    expect(html).toContain(`<style>${PAGE_CSS}</style>`);
  });

  it('index.html has no banned wording', () => {
    expect(scanHtml(html)).toEqual([]);
  });

  it('main.ts mounts on the same id and delegates to bootstrap', () => {
    expect(main).toContain("getElementById('data-status')");
    expect(main).toContain("from './bootstrap'");
    expect(main).toContain('void bootstrap(');
  });
});
