import { afterEach, describe, expect, it } from 'vitest';
import { auditGenerated, EMPTY_GENERATED, GENERATED_RULES, generatedInPage, type GeneratedFacts } from './generated.js';
import { installDom, type Installed, type Spec } from './testkit.js';
import { noFrIssues } from './expect-fr.js';

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});

const read = (roots: Spec[], over: Partial<{ maxElements: number; maxItems: number }> = {}): GeneratedFacts => {
  dom = installDom(roots);
  return generatedInPage({ maxElements: 500, maxItems: 50, ...over });
};
const PUA = '\uE900';
const items = (roots: Spec[]): Array<[string, string]> => read(roots).items.map((i) => [i.id, i.text]);

describe('generatedInPage', () => {
  it('finds nothing when no element has generated content', () => {
    expect(read([{ tag: 'p', text: 'hello' }])).toEqual({ items: [], checked: 1, truncated: false });
  });
  it('reads a quoted string on before and after', () => {
    expect(items([{ tag: 'label', id: 'f', before: { content: '"Required "' }, after: { content: "'*'" } }])).toEqual([
      ['label#f[0]::before', 'Required '],
      ['label#f[0]::after', '*'],
    ]);
  });
  it('ignores none, normal, empty strings and white space only', () => {
    expect(items([{ tag: 'p', before: { content: 'none' }, after: { content: '""' } }, { tag: 'p', before: { content: '" "' } }, { tag: 'p', before: { content: 'normal' } }])).toEqual([]);
  });
  it('ignores values that are not a plain string: counters, attr() and images', () => {
    expect(
      items([
        { tag: 'p', before: { content: 'counter(item)' }, after: { content: 'attr(data-x)' } },
        { tag: 'p', before: { content: 'url(x.png)' }, after: { content: 'open-quote' } },
        { tag: 'p', before: { content: '"a" counter(x)' } },
      ]),
    ).toEqual([]);
  });
  it('unescapes quotes and backslashes in the string', () => {
    expect(items([{ tag: 'p', before: { content: '"say \\"hi\\" \\\\ ok"' } }])).toEqual([['p[0]::before', 'say "hi" \\ ok']]);
  });
  it('keeps at most 80 characters of the text', () => {
    expect(read([{ tag: 'p', before: { content: `"${'x'.repeat(120)}"` } }]).items[0]?.text).toHaveLength(80);
  });
  it('does not look at script and style elements, and counts the others', () => {
    const f = read([{ tag: 'script', before: { content: '"x"' } }, { tag: 'style', before: { content: '"x"' } }, { tag: 'p' }, { tag: 'p' }]);
    expect(f.items).toEqual([]);
    expect(f.checked).toBe(2);
  });
  it('numbers elements by tag', () => {
    const f = read([{ tag: 'p', before: { content: '"a"' } }, { tag: 'p', before: { content: '"b"' } }]);
    expect(f.items.map((i) => i.id)).toEqual(['p[0]::before', 'p[1]::before']);
  });
  it('says when the item or element limit was hit', () => {
    const roots: Spec[] = Array.from({ length: 4 }, () => ({ tag: 'p', before: { content: '"New"' } }));
    expect(read(roots, { maxItems: 2 })).toMatchObject({ truncated: true });
    expect(read(roots, { maxItems: 2 }).items).toHaveLength(2);
    expect(read(roots, { maxElements: 2 }).truncated).toBe(true);
    expect(read(roots).truncated).toBe(false);
  });
});

describe('auditGenerated', () => {
  const f = (...texts: string[]): GeneratedFacts => ({ items: texts.map((text, i) => ({ id: `p[${i}]::before`, pseudo: '::before', text })), checked: 5, truncated: false });
  it('finds nothing and checks nothing without facts', () => {
    expect(auditGenerated(EMPTY_GENERATED)).toEqual({ checked: 0, entries: [] });
  });
  it('asks about words added by CSS', () => {
    const r = auditGenerated(f('Required'));
    expect(r.checked).toBe(5);
    expect(r.entries.map((e) => [e.rule, e.status, e.check])).toEqual([['css-text', 'unknown', 'generated']]);
    expect(r.entries[0]?.message.en).toContain('“Required”');
    expect(r.entries[0]?.message.fr).toContain('«\u202FRequired\u202F»');
  });
  it('asks about an icon font glyph, as a character or as an escape left in the text', () => {
    expect(auditGenerated(f(PUA)).entries.map((e) => e.rule)).toEqual(['icon-glyph']);
    expect(auditGenerated(f('\\e900')).entries.map((e) => e.rule)).toEqual(['icon-glyph']);
    expect(auditGenerated(f('\\F123')).entries.map((e) => e.rule)).toEqual(['icon-glyph']);
  });
  it('does not take an ordinary escape for an icon', () => {
    expect(auditGenerated(f('\\e90')).entries).toEqual([]);
  });
  it('leaves punctuation, symbols and single letters alone', () => {
    expect(auditGenerated(f('*', '→', '›', '•', ':', 'x', '1')).entries).toEqual([]);
  });
  it('treats a glyph with words as a glyph', () => {
    expect(auditGenerated(f(`${PUA} Menu`)).entries.map((e) => e.rule)).toEqual(['icon-glyph']);
  });
  it('clips long text in the message', () => {
    const e = auditGenerated(f('word '.repeat(30))).entries[0];
    expect(e?.message.en).toContain('…');
  });
  it('has both rules with clean French', () => {
    const es = auditGenerated(f('Required', PUA)).entries;
    expect(new Set(es.map((e) => e.rule))).toEqual(new Set(GENERATED_RULES));
    noFrIssues(es);
  });
  it('flows from the page to the audit', () => {
    const r = auditGenerated(read([{ tag: 'span', before: { content: '"New"' } }, { tag: 'i', after: { content: `"${PUA}"` } }, { tag: 'p' }]));
    expect(r.entries.map((e) => [e.id, e.rule])).toEqual([
      ['span[0]::before', 'css-text'],
      ['i[0]::after', 'icon-glyph'],
    ]);
    expect(r.checked).toBe(3);
  });
});
