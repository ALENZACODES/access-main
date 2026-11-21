import { afterEach, describe, expect, it } from 'vitest';
import {
  auditTypography,
  EMPTY_TYPOGRAPHY,
  ITALIC_WORDS,
  MAX_LINE_CHARS,
  MIN_FONT_PX,
  MIN_LEADING,
  TYPOGRAPHY_RULES,
  typographyInPage,
  type TextLayout,
  type TypographyFacts,
} from './typography.js';
import { installDom, type Installed, type Spec } from './testkit.js';
import { noFrIssues } from './expect-fr.js';

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});

const TEXT = 'The ramp is on the left side of the main door of the building today.';
const read = (roots: Spec[], over: Partial<{ maxElements: number; maxBlocks: number }> = {}): TypographyFacts => {
  dom = installDom(roots);
  return typographyInPage({ maxElements: 500, maxBlocks: 50, ...over });
};
const block = (over: Partial<TextLayout> = {}): TextLayout => ({ id: 'p[0]', words: 20, chars: 100, fontSize: 16, leading: 1.5, lines: 3, textAlign: 'start', italic: false, ...over });
const rules = (b: TextLayout): string[] => auditTypography({ blocks: [b], truncated: false }).entries.map((e) => String(e.rule));

describe('typographyInPage', () => {
  it('reads size, line height ratio, alignment and style of a block', () => {
    const f = read([{ tag: 'p', id: 'a', text: TEXT, rect: [0, 0, 300, 72], style: { fontSize: '16px', lineHeight: '24px', textAlign: 'justify', fontStyle: 'italic' } }]);
    expect(f.blocks).toEqual([{ id: 'p#a[0]', words: 15, chars: TEXT.length, fontSize: 16, leading: 1.5, lines: 3, textAlign: 'justify', italic: true }]);
    expect(f.truncated).toBe(false);
  });
  it('takes normal line height as 1.2 and counts at least one line', () => {
    const f = read([{ tag: 'p', text: TEXT, rect: [0, 0, 300, 10] }]);
    expect(f.blocks[0]).toMatchObject({ leading: 1.2, lines: 1 });
  });
  it('counts lines from the box height and the line height', () => {
    const f = read([{ tag: 'p', text: TEXT, rect: [0, 0, 300, 100], style: { fontSize: '10px', lineHeight: '20px' } }]);
    expect(f.blocks[0]).toMatchObject({ fontSize: 10, leading: 2, lines: 5 });
  });
  it('does not guess lines for a block that holds other elements', () => {
    const f = read([{ tag: 'div', text: TEXT, rect: [0, 0, 300, 200], children: [{ tag: 'p', text: 'short' }] }]);
    expect(f.blocks).toHaveLength(1);
    expect(f.blocks[0]?.lines).toBe(0);
  });
  it('treats an oblique font as italic', () => {
    expect(read([{ tag: 'p', text: TEXT, style: { fontStyle: 'oblique' } }]).blocks[0]?.italic).toBe(true);
  });
  it('joins inline children into the text of the block', () => {
    const f = read([{ tag: 'p', text: 'Call the office', children: [{ tag: 'a', text: 'or use the form before noon' }] }]);
    expect(f.blocks[0]?.words).toBe(9);
  });
  it('skips short, hidden, code and button text', () => {
    const f = read([
      { tag: 'p', text: 'Too short' },
      { tag: 'p', text: TEXT, style: { display: 'none' } },
      { tag: 'p', text: TEXT, style: { visibility: 'hidden' } },
      { tag: 'pre', text: TEXT },
      { tag: 'button', text: TEXT },
      { tag: 'div', style: { display: 'none' }, children: [{ tag: 'p', text: TEXT }] },
    ]);
    expect(f.blocks).toEqual([]);
  });
  it('numbers blocks by tag and says when a limit was hit', () => {
    const roots: Spec[] = Array.from({ length: 4 }, () => ({ tag: 'p', text: TEXT }));
    const f = read(roots, { maxBlocks: 2 });
    expect(f.blocks.map((b) => b.id)).toEqual(['p[0]', 'p[1]']);
    expect(f.truncated).toBe(true);
    expect(read(roots, { maxElements: 1 }).truncated).toBe(true);
    expect(read(roots).truncated).toBe(false);
  });
  it('falls back to 16px when the font size cannot be read', () => {
    expect(read([{ tag: 'p', text: TEXT, style: { fontSize: 'medium' } }]).blocks[0]?.fontSize).toBe(16);
  });
});

describe('auditTypography', () => {
  it('finds nothing in comfortable text', () => {
    expect(auditTypography({ blocks: [block()], truncated: false })).toEqual({ checked: 1, entries: [] });
  });
  it('finds nothing when there are no blocks', () => {
    expect(auditTypography(EMPTY_TYPOGRAPHY)).toEqual({ checked: 0, entries: [] });
  });
  it('skips blocks of fewer than 8 words', () => {
    const r = auditTypography({ blocks: [block({ words: 7, fontSize: 9, textAlign: 'justify' })], truncated: false });
    expect(r).toEqual({ checked: 0, entries: [] });
  });
  it('asks about text under the minimum size, not at it', () => {
    expect(rules(block({ fontSize: MIN_FONT_PX - 0.5 }))).toEqual(['small-text']);
    expect(rules(block({ fontSize: MIN_FONT_PX }))).toEqual([]);
  });
  it('writes the small size with a decimal comma in French', () => {
    const e = auditTypography({ blocks: [block({ fontSize: 11.5 })], truncated: false }).entries[0];
    expect(e?.message.en).toContain('11.5px');
    expect(e?.message.fr).toContain('11,5\u00A0px');
  });
  it('asks about justified text', () => {
    expect(rules(block({ textAlign: 'justify' }))).toEqual(['justified']);
    expect(rules(block({ textAlign: 'left' }))).toEqual([]);
  });
  it('asks about long lines only for wrapped text', () => {
    expect(rules(block({ chars: 90 * 2, lines: 2 }))).toEqual(['long-line']);
    expect(rules(block({ chars: MAX_LINE_CHARS * 2, lines: 2 }))).toEqual([]);
    expect(rules(block({ chars: 400, lines: 1 }))).toEqual([]);
    expect(rules(block({ chars: 400, lines: 0 }))).toEqual([]);
  });
  it('asks about tight spacing only for wrapped text', () => {
    expect(rules(block({ leading: MIN_LEADING - 0.1, lines: 2 }))).toEqual(['tight-leading']);
    expect(rules(block({ leading: MIN_LEADING, lines: 2 }))).toEqual([]);
    expect(rules(block({ leading: 1, lines: 1 }))).toEqual([]);
  });
  it('asks about a long italic passage, not a short one', () => {
    expect(rules(block({ italic: true, words: ITALIC_WORDS }))).toEqual(['italic-passage']);
    expect(rules(block({ italic: true, words: ITALIC_WORDS - 1 }))).toEqual([]);
  });
  it('can give several findings for one block, in a fixed order', () => {
    expect(rules(block({ fontSize: 10, textAlign: 'justify', chars: 400, lines: 4, leading: 1, italic: true, words: 60 }))).toEqual([
      'small-text',
      'justified',
      'long-line',
      'tight-leading',
      'italic-passage',
    ]);
  });
  it('counts the blocks it judged', () => {
    expect(auditTypography({ blocks: [block(), block({ words: 3 }), block({ id: 'p[2]' })], truncated: false }).checked).toBe(2);
  });
  it('gives every rule an unknown entry with clean French', () => {
    const es = auditTypography({ blocks: [block({ fontSize: 10, textAlign: 'justify', chars: 400, lines: 4, leading: 1, italic: true, words: 60 })], truncated: false }).entries;
    expect(new Set(es.map((e) => e.rule))).toEqual(new Set(TYPOGRAPHY_RULES));
    for (const e of es) {
      expect(e.check).toBe('typography');
      expect(e.status).toBe('unknown');
    }
    noFrIssues(es);
  });
  it('flows from the page to the audit', () => {
    const f = read([{ tag: 'p', text: TEXT, rect: [0, 0, 300, 48], style: { fontSize: '10px', lineHeight: '24px', textAlign: 'justify' } }]);
    expect(auditTypography(f).entries.map((e) => e.rule)).toEqual(['small-text', 'justified']);
  });
});
