import { describe, expect, it } from 'vitest';
import { scanCopy } from './copylint.js';
import { DEFAULT_MAX_ENTRIES, mdCode, mdEscape, renderMarkdown } from './markdown.js';
import { emptyReport, entry, sampleReport } from './outputs-testkit.js';
import { buildRouteAudit, makeReport, type AuditReport } from './report.js';

const at = new Date('2026-11-19T10:00:00Z');

describe('mdEscape', () => {
  it('escapes the characters Markdown gives a meaning to', () => {
    expect(mdEscape('a*b_c`d')).toBe('a\\*b\\_c\\`d');
    expect(mdEscape('[x](https://e)')).toBe('\\[x\\]\\(https://e\\)');
    expect(mdEscape('a|b')).toBe('a\\|b');
    expect(mdEscape('# heading')).toBe('\\# heading');
    expect(mdEscape('back\\slash')).toBe('back\\\\slash');
    expect(mdEscape('![img](x)')).toBe('\\!\\[img\\]\\(x\\)');
  });
  it('turns angle brackets into entities, so no HTML gets through', () => {
    expect(mdEscape('<img src=x onerror=y>')).toBe('&lt;img src=x onerror=y&gt;');
  });
  it('folds line breaks into one space', () => {
    expect(mdEscape('one\n  two\r\nthree')).toBe('one two three');
  });
  it('leaves ordinary text, accents and French punctuation alone', () => {
    expect(mdEscape('Heures d’ouverture\u00A0: 9 h à 17 h.')).toBe('Heures d’ouverture\u00A0: 9 h à 17 h.');
  });
});

describe('mdCode', () => {
  it('wraps text in backticks', () => {
    expect(mdCode('contrast/low')).toBe('`contrast/low`');
  });
  it('grows the fence when the text holds backticks, and pads when it starts or ends with one', () => {
    expect(mdCode('a`b')).toBe('``a`b``');
    expect(mdCode('a``b')).toBe('```a``b```');
    expect(mdCode('`x`')).toBe('`` `x` ``');
  });
  it('escapes a pipe, so a table cell stays one cell, and folds line breaks', () => {
    expect(mdCode('a|b')).toBe('`a\\|b`');
    expect(mdCode('a\nb')).toBe('`a b`');
  });
  it('gives a visible empty code span for empty text', () => {
    expect(mdCode('')).toBe('` `');
  });
});

describe('renderMarkdown', () => {
  const en = renderMarkdown(sampleReport(), 'en');
  const fr = renderMarkdown(sampleReport(), 'fr');
  it('starts with a title, the date, the tool and the scope note', () => {
    const lines = en.split('\n');
    expect(lines[0]).toBe('# Narrow-screen audit');
    expect(en).toContain('Generated 2026-11-19T10:00:00.000Z · narrow-audit ');
    expect(en).toContain('> Automated checks cover only some WCAG 2.2 success criteria. A clean result is not a conformance statement.');
    expect(fr.split('\n')[0]).toBe('# Audit écran étroit');
    expect(fr).toContain('n’est pas une déclaration de conformité.');
  });
  it('gives the totals in one line', () => {
    expect(en).toContain('**To fix: 3** · Unknown: 3 · Checked: 108');
    expect(fr).toContain('**À corriger\u00A0: 3** · Inconnus\u00A0: 3 · Contrôlés\u00A0: 108');
  });
  it('has a table by check with summed numbers and right-aligned number columns', () => {
    expect(en).toContain('| Check | To fix | Unknown | Checked |\n| --- | ---: | ---: | ---: |');
    expect(en).toContain('| Text contrast (`contrast`) | 2 | 2 | 42 |');
    expect(en).toContain('| Reflow at 320px (`reflow`) | 1 | 0 | 21 |');
    expect(fr).toContain('| Contraste du texte (`contrast`) | 2 | 2 | 42 |');
  });
  it('has a table by criterion, in criterion order, with the level and a note that a check is partial', () => {
    expect(en).toContain('A check relates to a criterion and does not test all of it.');
    const a = en.indexOf('| 1.4.3 Contrast \\(Minimum\\) \\(AA\\) | `contrast` | 2 | 2 |');
    const b = en.indexOf('| 1.4.8 Visual Presentation \\(AAA\\) | `typography` | 0 | 1 |');
    const c = en.indexOf('| 1.4.10 Reflow \\(AA\\) | `reflow` | 1 | 0 |');
    const d = en.indexOf('| Not a WCAG criterion | `copy` | 0 | 0 |');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(c);
    expect(fr).toContain('| Hors critères WCAG | `copy` | 0 | 0 |');
  });
  it('has the most frequent rules, worst first', () => {
    expect(en).toContain('## Most frequent rules\n\n| Rule | To fix | Unknown | Routes |\n| --- | ---: | ---: | ---: |\n| `contrast/low` | 2 | 0 | 1 |\n| `reflow/overflow` | 1 | 0 | 1 |\n| `contrast/image` | 0 | 2 | 2 |');
  });
  it('lists each route with its counts, failures before unknowns', () => {
    expect(en).toContain('### `/` (320px)\n\nTo fix: 3 · Unknown: 1 · Checked: 82\n\n- **FAIL** `reflow/overflow` `div#map` English text for overflow.');
    const home = en.slice(en.indexOf('### `/` (320px)'), en.indexOf('### `/help`'));
    expect(home.lastIndexOf('**FAIL**')).toBeLessThan(home.indexOf('**UNKNOWN**'));
    expect(fr).toContain('### `/` (320\u00A0px)');
    expect(fr).toContain('- **À CORRIGER** `reflow/overflow` `div#map` Texte français pour overflow.');
    expect(fr).toContain('- **INCONNU** `contrast/image` `h1[0]`');
  });
  it('says "No findings." for a clean route and for a report with no route', () => {
    expect(en).toContain('### `/about` (320px)\n\nTo fix: 0 · Unknown: 0 · Checked: 13\n\nNo findings.');
    const empty = renderMarkdown(emptyReport(), 'fr');
    expect(empty).toContain('## Anomalies par route\n\nAucune anomalie.');
    expect(empty).not.toContain('## Par contrôle');
  });
  it('cuts a long route at the limit and says how many were left out', () => {
    const many = Array.from({ length: 7 }, (_, i) => entry('contrast', 'low', 'fail', `p[${i}]`));
    const report = makeReport([buildRouteAudit('/', 320, { contrast: { checked: 7, entries: many } })], at);
    const cut = renderMarkdown(report, 'en', { maxEntriesPerRoute: 5 });
    expect(cut.match(/\*\*FAIL\*\*/g)).toHaveLength(5);
    expect(cut).toContain('- … and 2 more findings not listed here. The JSON report holds all of them.');
    expect(renderMarkdown(report, 'en', { maxEntriesPerRoute: 6 })).toContain('- … and 1 more finding not listed here.');
    expect(renderMarkdown(report, 'fr', { maxEntriesPerRoute: 6 })).toContain('- … et 1 autre anomalie, non listée ici.');
    expect(renderMarkdown(report, 'fr', { maxEntriesPerRoute: 5 })).toContain('- … et 2 autres anomalies, non listées ici.');
    expect(renderMarkdown(report, 'en')).not.toContain('more finding');
    expect(DEFAULT_MAX_ENTRIES).toBe(50);
  });
  it('can leave the rules table out', () => {
    expect(renderMarkdown(sampleReport(), 'en', { topRules: 0 })).not.toContain('Most frequent rules');
    expect(renderMarkdown(sampleReport(), 'en', { topRules: 1 })).not.toContain('| `reflow/overflow` | 1 | 0 | 1 |');
  });
  it('escapes page text in messages and ids, so a finding cannot add markup to a comment', () => {
    const report = makeReport(
      [buildRouteAudit('/x|y', 320, { contrast: { checked: 1, entries: [entry('contrast', 'low', 'fail', 'a`b|c', 'Text <script>alert(1)</script> [link](https://e) *bold*\nnext', 'Texte <b>x</b>')] } })],
      at,
    );
    const md = renderMarkdown(report, 'en');
    expect(md).not.toContain('<script>');
    expect(md).toContain('Text &lt;script&gt;alert\\(1\\)&lt;/script&gt; \\[link\\]\\(https://e\\) \\*bold\\* next');
    expect(md).toContain('``a`b\\|c``');
    expect(md).toContain('### `/x\\|y` (320px)');
  });
  it('marks a route that was only partly read', () => {
    const report = makeReport([buildRouteAudit('/', 320, { contrast: { checked: 1, entries: [] } }, 0, true)], at);
    expect(renderMarkdown(report, 'en')).toContain('_Only the first elements were read on this page._');
  });
  it('lists waived failures and skipped checks when there are some', () => {
    const base = sampleReport();
    const report: AuditReport = { ...base, waived: [{ route: '/', entry: entry('contrast', 'low', 'fail', 'x'), reason: 'Redesign *in* progress', expires: '2027-01-31' }], skipped: ['offline', 'keyboard'] };
    const md = renderMarkdown(report, 'en');
    expect(md).toContain('## Failures covered by a waiver\n\n- `/` `contrast/low` `x` Redesign \\*in\\* progress (until 2027-01-31)');
    expect(md).toContain('## Checks not run in this run, so nothing is said about them\n\n`offline`, `keyboard`');
    expect(en).not.toContain('waiver');
  });
  it('shows a route with no viewport without a width', () => {
    const report = makeReport([buildRouteAudit('strings', null, { copy: { checked: 1, entries: [] } })], at);
    expect(renderMarkdown(report, 'en')).toContain('### `strings`\n');
  });
  it('ends with one line break, has no trailing spaces and never three line breaks in a row', () => {
    for (const md of [en, fr, renderMarkdown(emptyReport(), 'en')]) {
      expect(md.endsWith('\n')).toBe(true);
      expect(md.endsWith('\n\n')).toBe(false);
      expect(md).not.toMatch(/[ \t]\n/);
      expect(md).not.toContain('\n\n\n');
    }
  });
  it('is the same when rendered twice, and its own words follow the copy rules', () => {
    expect(renderMarkdown(sampleReport(), 'en')).toBe(en);
    const own = (md: string): string => md.split('\n').filter((l) => !l.startsWith('- **')).join('\n');
    expect(scanCopy(own(en)).map((h) => h.rule.id)).toEqual([]);
    expect(scanCopy(own(fr)).map((h) => h.rule.id)).toEqual([]);
    expect(`${en}${fr}`).not.toMatch(/verif|vérif/iu);
  });
});
