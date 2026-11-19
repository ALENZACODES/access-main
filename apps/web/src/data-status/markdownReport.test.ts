import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { lintFrench } from './i18n';
import { buildMarkdownReport, DEFAULT_ROW_LIMIT, escapeMarkdown, MAX_CELL_LENGTH } from './markdownReport';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW, RECORDS } from './testkit';

const report = (records: DatasetRecord[], locale: 'en' | 'fr' = 'en', opts = {}) => buildMarkdownReport(auditRegistry(records, NOW), NOW, locale, opts);
/** Pipes that are not escaped, which is what a Markdown table reads as a column break. */
const columnBreaks = (line: string) => (line.match(/(?<!\\)\|/g) ?? []).length;

describe('escapeMarkdown', () => {
  it('escapes the characters Markdown reads as markup', () => {
    expect(escapeMarkdown('a|b')).toBe('a\\|b');
    expect(escapeMarkdown('`code` *em* _u_')).toBe('\\`code\\` \\*em\\* \\_u\\_');
    expect(escapeMarkdown('[x](https://example.org)')).toBe('\\[x\\]\\(https://example.org\\)');
    expect(escapeMarkdown('<img src=x>')).toBe('\\<img src=x\\>');
    expect(escapeMarkdown('back\\slash')).toBe('back\\\\slash');
  });
  it('stops a value from starting a heading, list or numbered list', () => {
    expect(escapeMarkdown('# Heading')).toBe('\\# Heading');
    expect(escapeMarkdown('- item')).toBe('\\- item');
    expect(escapeMarkdown('+ item')).toBe('\\+ item');
    expect(escapeMarkdown('1. item')).toBe('1\\. item');
  });
  it('joins line breaks and control characters into one line', () => {
    expect(escapeMarkdown('a\nb\r\nc\td')).toBe('a b c d');
    expect(escapeMarkdown('x\u0000y\u001fz')).toBe('x y z');
    expect(escapeMarkdown('a b c')).toBe('a b c');
    expect(escapeMarkdown('x\ny\n# not a heading')).toBe('x y \\# not a heading');
  });
  it('trims and collapses spaces', () => {
    expect(escapeMarkdown('  a    b  ')).toBe('a b');
    expect(escapeMarkdown('   ')).toBe('');
  });
  it('cuts long text at the limit and marks the cut, counting characters not UTF-16 units', () => {
    const long = 'x'.repeat(MAX_CELL_LENGTH + 50);
    const out = escapeMarkdown(long);
    expect(Array.from(out)).toHaveLength(MAX_CELL_LENGTH);
    expect(out.endsWith('…')).toBe(true);
    const emoji = escapeMarkdown('😀'.repeat(10), 5);
    expect(Array.from(emoji)).toEqual(['😀', '😀', '😀', '😀', '…']);
  });
  it('leaves short plain and accented text alone', () => {
    expect(escapeMarkdown('Ontario Places')).toBe('Ontario Places');
    expect(escapeMarkdown('Théâtre')).toBe('Théâtre');
  });
});

describe('buildMarkdownReport in English', () => {
  const md = report(RECORDS);
  const lines = md.split('\n');
  it('starts with the title and the as-of date', () => {
    expect(lines[0]).toBe('# Data status');
    expect(lines[2]).toBe('As of November 15, 2026.');
  });
  it('has its four sections in order', () => {
    const headings = lines.filter((l) => l.startsWith('## '));
    expect(headings).toEqual(['## Totals', '## Items to review', '## Sources', '## Records by tier']);
  });
  it('lists the totals from the audit', () => {
    expect(md).toContain('| Sources | 3 |');
    expect(md).toContain('| Datasets | 2 |');
    expect(md).toContain('| Sources possibly out of date | 1 |');
  });
  it('lists one source per row with licence, date and status', () => {
    expect(md).toContain('| Alpha | Places \\<A\\> | OGL-Ontario | 2026-11-01 | Within its review period (14\u00A0d) |');
    expect(md).toContain('| Beta | Places \\<A\\> | Proprietary | 2024-01-01 | May be out of date (1049\u00A0d) |');
    expect(md).toContain('| c | Routes | Unknown | Unknown | Update date unknown |');
  });
  it('puts findings that need action before the ones that are notices', () => {
    const items = lines.filter((l) => l.startsWith('- '));
    const rank = (s: string) => (s.includes('licence not on the reference list') || s.includes('missing') ? 0 : s.includes('possibly out of date') ? 2 : 1);
    const ranks = items.map(rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(items.length).toBeGreaterThan(0);
  });
  it('ends with the note, in italics, and a final newline', () => {
    expect(md.endsWith('_This is a record of what is stored on this device. Unknown means the value is missing or unreadable._\n')).toBe(true);
  });
  it('has the same number of columns on every table row', () => {
    const rows = lines.filter((l) => l.startsWith('|'));
    const sources = rows.filter((l) => columnBreaks(l) === 7);
    const totals = rows.filter((l) => columnBreaks(l) === 3);
    expect(sources.length + totals.length).toBe(rows.length);
    expect(sources).toHaveLength(1 + 1 + 3);
  });
});

describe('buildMarkdownReport in French', () => {
  const md = report(RECORDS, 'fr');
  it('uses the French headings, date and status words', () => {
    expect(md).toContain('# État des données');
    expect(md).toContain('En date du 15 novembre 2026.');
    expect(md).toContain('## Éléments à examiner');
    expect(md).toContain('Dans sa période de révision (14 j)');
    expect(md).toContain('| c | Routes | Inconnu | Inconnu | Date de mise à jour inconnue |');
  });
  it('puts a no-break space before the colon in each finding', () => {
    const items = md.split('\n').filter((l) => l.startsWith('- '));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item).toContain(' : ');
  });
  it('has no typography problems in the lines the module wrote itself', () => {
    const own = md.split('\n').filter((l) => !l.startsWith('|') && !l.startsWith('- '));
    for (const line of own) expect(lintFrench(line), line).toEqual([]);
  });
});

describe('what the report never does', () => {
  it('shows Unknown instead of a date or licence it does not have', () => {
    const md = report([{ id: 'd', name: 'D', kind: 'places', sources: [{ id: 's', retrievedAt: 'soon' }] }]);
    expect(md).toContain('| s | D | Unknown | Unknown | Update date unknown |');
  });
  it('says there is nothing to review or list for an empty registry', () => {
    const md = report([]);
    expect(md).toContain('No items to review.');
    expect(md).toContain('There are no sources.');
    expect(md).not.toContain('| Source |');
  });
  it('lets a hostile name neither break the table nor start markup', () => {
    const records: DatasetRecord[] = [
      {
        id: 'd',
        name: 'Evil | name\n# Heading',
        kind: 'places',
        sources: [{ id: 's', name: '[click](javascript:alert(1))|x', licence: '`;|', retrievedAt: isoDayOffset(NOW, -5) }],
      },
    ];
    const md = report(records);
    const row = md.split('\n').find((l) => l.startsWith('| \\[click'));
    expect(row).toBeDefined();
    expect(columnBreaks(row ?? '')).toBe(7);
    expect(md).not.toMatch(/^# Heading/m);
    expect(md).not.toMatch(/\]\(javascript/);
  });
});

describe('row limit', () => {
  const many: DatasetRecord[] = [
    { id: 'd', name: 'D', kind: 'places', sources: Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, retrievedAt: isoDayOffset(NOW, -i) })) },
  ];
  it('lists the first rows and says how many are left, with singular and plural wording', () => {
    const md = report(many, 'en', { rowLimit: 10 });
    expect(md.split('\n').filter((l) => /^\| s\d/.test(l))).toHaveLength(10);
    expect(md).toContain('2 more sources are not listed.');
    expect(report(many, 'en', { rowLimit: 11 })).toContain('1 more source is not listed.');
    expect(report(many, 'fr', { rowLimit: 11 })).toContain('1 autre source n’est pas affichée.');
    expect(report(many, 'fr', { rowLimit: 10 })).toContain('2 autres sources ne sont pas affichées.');
  });
  it('shows everything when the limit is large, and nothing extra when it is zero', () => {
    expect(report(many, 'en', { rowLimit: 500 })).not.toContain('not listed');
    const zero = report(many, 'en', { rowLimit: 0 });
    expect(zero.split('\n').filter((l) => /^\| s\d/.test(l))).toHaveLength(0);
    expect(zero).toContain('12 more sources are not listed.');
  });
  it('uses a default limit that is large enough for ordinary registries', () => {
    expect(DEFAULT_ROW_LIMIT).toBeGreaterThanOrEqual(100);
  });
});

describe('over random registries', () => {
  it('keeps every table row to its own columns and never emits raw HTML tags from data', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const md = report(randomRegistry(seed, NOW), seed % 2 === 0 ? 'en' : 'fr');
      for (const line of md.split('\n')) {
        if (!line.startsWith('|')) continue;
        expect([3, 7], `seed ${seed}: ${line}`).toContain(columnBreaks(line));
      }
      expect(md, `seed ${seed}`).not.toMatch(/(?<!\\)<(b|script|img)/);
      expect(md, `seed ${seed}`).not.toMatch(/^# (?!Data status|État des données)/m);
      expect(md.endsWith('\n')).toBe(true);
    }
  });
});

describe('tiers in the Markdown report', () => {
  it('adds the tier to each source row, with Unknown where none is recorded', () => {
    const md = report(RECORDS);
    const rows = md.split('\n').filter((l) => l.startsWith('| ') && columnBreaks(l) === 7);
    expect(rows[0]?.endsWith('| Tier |')).toBe(true);
    expect(rows.slice(2).map((r) => r.split(' | ').at(-1))).toEqual(['0 |', 'E |', 'Unknown |']);
  });
  it('counts records by tier, in the fixed order, with Unknown last', () => {
    const md = report(RECORDS);
    const at = md.indexOf('## Records by tier');
    expect(md.slice(at)).toContain('| Tier | Records |\n| --- | --- |\n| Tier 0 | 1 |\n| Tier E | 1 |\n| Unknown | 1 |');
  });
  it('is in French in the French report', () => {
    const md = report(RECORDS, 'fr');
    expect(md).toContain('## Enregistrements selon le niveau');
    expect(md).toContain('| Niveau E | 1 |');
    expect(md).toContain('| Inconnu | 1 |');
  });
  it('leaves the tier section out when there are no sources', () => {
    expect(report([])).not.toContain('## Records by tier');
  });
});
