import { afterEach, describe, expect, it } from 'vitest';
import { auditOrder, EMPTY_ORDER, ORDER_RULES, orderInPage, type OrderFacts } from './order.js';
import { installDom, type Installed, type Spec } from './testkit.js';
import { noFrIssues } from './expect-fr.js';

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});

const read = (roots: Spec[], over: Partial<{ maxElements: number }> = {}): OrderFacts => {
  dom = installDom(roots);
  return orderInPage({ maxElements: 500, selector: 'a,button', ...over });
};
const kid = (text: string, extra: Partial<Spec> = {}): Spec => ({ tag: 'div', text, ...extra });
const link = (text: string, extra: Partial<Spec> = {}): Spec => ({ tag: 'a', text, interactive: true, attrs: { href: '/x' }, ...extra });

describe('orderInPage', () => {
  it('finds nothing in a plain block layout', () => {
    expect(read([{ tag: 'div', children: [kid('a'), kid('b')] }])).toEqual({ reordered: [], truncated: false });
  });
  it('finds nothing in a flex row with no reordering', () => {
    expect(read([{ tag: 'div', style: { display: 'flex' }, children: [kid('a'), kid('b')] }]).reordered).toEqual([]);
  });
  it('finds a reversed flex row and column', () => {
    const f = read([
      { tag: 'div', id: 'row', style: { display: 'flex', flexDirection: 'row-reverse' }, children: [kid('a'), kid('b'), kid('c')] },
      { tag: 'ul', style: { display: 'inline-flex', flexDirection: 'column-reverse' }, children: [kid('a'), kid('b')] },
    ]);
    expect(f.reordered).toEqual([
      { id: 'div#row[0]', kind: 'reverse', children: 3, focusable: 0 },
      { id: 'ul[0]', kind: 'reverse', children: 2, focusable: 0 },
    ]);
  });
  it('finds children moved with the order property, in flex and in grid', () => {
    const f = read([
      { tag: 'div', style: { display: 'flex' }, children: [kid('a', { style: { order: '2' } }), kid('b')] },
      { tag: 'section', style: { display: 'grid' }, children: [kid('a'), kid('b', { style: { order: '-1' } })] },
    ]);
    expect(f.reordered.map((r) => [r.id, r.kind, r.children])).toEqual([
      ['div[0]', 'order', 2],
      ['section[0]', 'order', 2],
    ]);
  });
  it('ignores a container that has one child, and order on a block parent', () => {
    expect(read([{ tag: 'div', style: { display: 'flex', flexDirection: 'row-reverse' }, children: [kid('a')] }]).reordered).toEqual([]);
    expect(read([{ tag: 'div', children: [kid('a', { style: { order: '3' } }), kid('b')] }]).reordered).toEqual([]);
  });
  it('does not call row-reverse on a grid a reversal', () => {
    expect(read([{ tag: 'div', style: { display: 'grid', flexDirection: 'row-reverse' }, children: [kid('a'), kid('b')] }]).reordered).toEqual([]);
  });
  it('counts the focusable controls inside a reversed container, including nested ones', () => {
    const f = read([
      {
        tag: 'div',
        style: { display: 'flex', flexDirection: 'row-reverse' },
        children: [link('one'), { tag: 'div', children: [link('two'), { tag: 'button', text: 'three', interactive: true }] }, kid('plain')],
      },
    ]);
    expect(f.reordered[0]?.focusable).toBe(3);
  });
  it('counts only the focusable controls inside children that were moved', () => {
    const f = read([
      { tag: 'div', style: { display: 'flex' }, children: [link('stays'), link('moves', { style: { order: '5' } })] },
    ]);
    expect(f.reordered[0]).toMatchObject({ kind: 'order', focusable: 1 });
  });
  it('says when the element limit was hit', () => {
    const roots: Spec[] = [{ tag: 'div', style: { display: 'flex', flexDirection: 'row-reverse' }, children: [kid('a'), kid('b')] }];
    expect(read(roots, { maxElements: 1 }).truncated).toBe(true);
    expect(read(roots).truncated).toBe(false);
  });
});

describe('auditOrder', () => {
  it('finds nothing and checks nothing when there are no facts', () => {
    expect(auditOrder(EMPTY_ORDER)).toEqual({ checked: 0, entries: [] });
  });
  it('maps a reversal and a moved child to their rules', () => {
    const r = auditOrder({
      reordered: [
        { id: 'div[0]', kind: 'reverse', children: 3, focusable: 0 },
        { id: 'ul[0]', kind: 'order', children: 4, focusable: 0 },
      ],
      truncated: false,
    });
    expect(r.checked).toBe(2);
    expect(r.entries.map((e) => [e.id, e.rule, e.status, e.check])).toEqual([
      ['div[0]', 'reverse-direction', 'unknown', 'order'],
      ['ul[0]', 'order-property', 'unknown', 'order'],
    ]);
    expect(r.entries[0]?.message.en).toContain('3 children in reverse order');
    expect(r.entries[1]?.message.en).toContain('order property');
  });
  it('mentions focusable controls, singular and plural, in both languages', () => {
    const one = auditOrder({ reordered: [{ id: 'a', kind: 'reverse', children: 2, focusable: 1 }], truncated: false }).entries[0];
    expect(one?.message.en).toContain('1 focusable control sit inside');
    expect(one?.message.fr).toContain('1 contrôle focalisable s’y trouve');
    const many = auditOrder({ reordered: [{ id: 'a', kind: 'reverse', children: 2, focusable: 3 }], truncated: false }).entries[0];
    expect(many?.message.en).toContain('3 focusable controls sit inside');
    expect(many?.message.fr).toContain('3 contrôles focalisables s’y trouvent');
    const none = auditOrder({ reordered: [{ id: 'a', kind: 'reverse', children: 2, focusable: 0 }], truncated: false }).entries[0];
    expect(none?.message.en).not.toContain('focusable');
  });
  it('has both rules with clean French', () => {
    const es = auditOrder({
      reordered: [
        { id: 'a', kind: 'reverse', children: 2, focusable: 2 },
        { id: 'b', kind: 'order', children: 2, focusable: 0 },
      ],
      truncated: false,
    }).entries;
    expect(new Set(es.map((e) => e.rule))).toEqual(new Set(ORDER_RULES));
    noFrIssues(es);
  });
});
