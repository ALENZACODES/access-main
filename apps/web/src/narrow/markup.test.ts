import { describe, expect, it } from 'vitest';
import { parseHtml } from './htmllint.js';
import { ancestorsOf, attrOf, idIndex, inFileOrder, isHiddenNode, lineOfEntry, listBoth, nodeLabel, tokensOf } from './markup.js';
import type { Entry } from './types.js';

const nodesOf = (html: string) => parseHtml(html).nodes;
const byTag = (html: string, tag: string) => {
  const nodes = nodesOf(html);
  const n = nodes.find((x) => x.tag === tag);
  if (!n) throw new Error(`no ${tag}`);
  return { nodes, n };
};
const entry = (id: string): Entry => ({ check: 'aria', id, status: 'unknown', message: { en: 'e', fr: 'f' } });

describe('nodeLabel and attrOf', () => {
  it('names the tag, the id and the line', () => {
    expect(nodeLabel(byTag('<p>a</p>\n<button id="save">b</button>', 'button').n)).toBe('button#save@L2');
    expect(nodeLabel(byTag('<p>a</p>', 'p').n)).toBe('p@L1');
  });
  it('trims the value and gives an empty string for a missing attribute', () => {
    const { n } = byTag('<a href="  /x  " download>x</a>', 'a');
    expect(attrOf(n, 'href')).toBe('/x');
    expect(attrOf(n, 'download')).toBe('');
    expect(attrOf(n, 'rel')).toBe('');
  });
});

describe('ancestorsOf', () => {
  it('lists the ancestors nearest first', () => {
    const { nodes, n } = byTag('<main><section><p><b>x</b></p></section></main>', 'b');
    expect(ancestorsOf(nodes, n).map((a) => a.tag)).toEqual(['p', 'section', 'main']);
  });
  it('is empty for a top element', () => {
    const { nodes, n } = byTag('<main></main>', 'main');
    expect(ancestorsOf(nodes, n)).toEqual([]);
  });
  it('stops when parent links loop', () => {
    const a = { index: 0, tag: 'a', attrs: {}, line: 1, parent: 1, children: [], text: '', own: '' };
    const b = { index: 1, tag: 'b', attrs: {}, line: 1, parent: 0, children: [], text: '', own: '' };
    expect(ancestorsOf([a, b], a).map((x) => x.tag)).toEqual(['b']);
  });
});

describe('idIndex', () => {
  it('keeps the first element of a repeated id and skips empty ids', () => {
    const map = idIndex(nodesOf('<p id="a">1</p><div id="a">2</div><span id="">3</span><i id="b">4</i>'));
    expect([...map.keys()]).toEqual(['a', 'b']);
    expect(map.get('a')?.tag).toBe('p');
  });
});

describe('isHiddenNode', () => {
  it('is true for hidden and aria-hidden on the element or an ancestor', () => {
    expect(isHiddenNode(...Object.values(byTag('<div hidden><p>x</p></div>', 'p')) as [ReturnType<typeof nodesOf>, ReturnType<typeof nodesOf>[number]])).toBe(true);
    const a = byTag('<div aria-hidden="TRUE"><p>x</p></div>', 'p');
    expect(isHiddenNode(a.nodes, a.n)).toBe(true);
    const b = byTag('<p hidden>x</p>', 'p');
    expect(isHiddenNode(b.nodes, b.n)).toBe(true);
  });
  it('is false for aria-hidden false and for a visible element', () => {
    const a = byTag('<div aria-hidden="false"><p>x</p></div>', 'p');
    expect(isHiddenNode(a.nodes, a.n)).toBe(false);
    const b = byTag('<div><p>x</p></div><div hidden></div>', 'p');
    expect(isHiddenNode(b.nodes, b.n)).toBe(false);
  });
});

describe('file order', () => {
  it('reads the line from element ids and from style rule ids', () => {
    expect(lineOfEntry(entry('button#go@L12'))).toBe(12);
    expect(lineOfEntry(entry('style@L7:a:focus'))).toBe(7);
    expect(lineOfEntry(entry('no line here'))).toBe(0);
  });
  it('sorts by line and keeps the order of entries on one line', () => {
    const sorted = inFileOrder([entry('c@L3'), entry('a@L1'), entry('x@L2'), entry('y@L2'), entry('b@L1')]);
    expect(sorted.map((e) => e.id)).toEqual(['a@L1', 'b@L1', 'x@L2', 'y@L2', 'c@L3']);
  });
  it('does not change the list it is given', () => {
    const list = [entry('b@L2'), entry('a@L1')];
    inFileOrder(list);
    expect(list.map((e) => e.id)).toEqual(['b@L2', 'a@L1']);
  });
});

describe('tokensOf and listBoth', () => {
  it('splits on any white space and drops empty tokens', () => {
    expect(tokensOf('  a\tb\n c  ')).toEqual(['a', 'b', 'c']);
    expect(tokensOf('')).toEqual([]);
  });
  it('joins code words for both languages', () => {
    expect(listBoth([])).toEqual({ en: '', fr: '' });
    expect(listBoth(['a'])).toEqual({ en: 'a', fr: 'a' });
    expect(listBoth(['a', 'b'])).toEqual({ en: 'a and b', fr: 'a et b' });
    expect(listBoth(['a', 'b', 'c'])).toEqual({ en: 'a, b and c', fr: 'a, b et c' });
  });
});
