import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { auditLists, LIST_RULES } from './lists.js';
import { SAMPLE_LISTS_HTML } from './samples.js';

const found = (html: string): string[] => auditLists(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('children of ul, ol and menu', () => {
  it.each(['ul', 'ol', 'menu'])('fails a div directly inside a %s', (tag) => {
    const e = auditLists(`<${tag}><li>Ramp</li>\n<div>Lift</div></${tag}>`).entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['list-child', 'fail', 'div@L2']]);
    expect(e[0]?.message.en).toContain(`directly inside a ${tag}, where only li is allowed`);
    expect(e[0]?.message.fr).toContain(`directement dans un ${tag}, où seul li est permis`);
  });
  it('gives one finding per list and says how many children are wrong', () => {
    const e = auditLists('<ul><div>a</div><p>b</p><span>c</span><li>d</li></ul>').entries;
    expect(e).toHaveLength(1);
    expect(e[0]?.message.en).toContain('3 children of this list are not li');
    expect(e[0]?.message.fr).toContain('3 enfants de cette liste ne sont pas des li');
  });
  it('has its own words for a list nested outside an item', () => {
    const e = auditLists('<ul><li>Entrances</li><ul><li>Side door</li></ul></ul>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['list-child:fail']);
    expect(e[0]?.message.en).toContain('nested list belongs inside the li');
    expect(e[0]?.message.fr).toContain('liste imbriquée');
  });
  it('passes good lists, nested lists inside items, and script or template children', () => {
    expect(found('<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>')).toEqual([]);
    expect(found('<ol><li>a</li><script>x()</script><template><li>t</li></template></ol>')).toEqual([]);
    expect(found('<ul><li>a<li>b<li>c</ul>')).toEqual([]);
  });
  it('accepts a child with the role listitem, and leaves a list with another role to the aria check', () => {
    expect(found('<ul><div role="listitem">a</div></ul>')).toEqual([]);
    expect(found('<ul role="tablist"><button role="tab">a</button></ul>')).toEqual([]);
    expect(found('<ul role="presentation"><div>a</div></ul>')).toEqual([]);
    expect(found('<ul role="list"><div>a</div></ul>')).toEqual(['list-child:fail']);
  });
});

describe('empty lists', () => {
  it('asks about a list with no item', () => {
    const e = auditLists('<ul id="results"></ul>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['empty-list', 'unknown', 'ul#results@L1']]);
  });
  it('does not ask twice about a list that already failed, or about a list with items', () => {
    expect(found('<ul><div>a</div></ul>')).toEqual(['list-child:fail']);
    expect(found('<ul><li></li></ul>')).toEqual([]);
  });
});

describe('description lists', () => {
  it('passes dt and dd, with or without a grouping div', () => {
    expect(found('<dl><dt>Ramp</dt><dd>Side door</dd><dt>Lift</dt><dd>Back hall</dd></dl>')).toEqual([]);
    expect(found('<dl><div><dt>Ramp</dt><dd>Side door</dd></div><div><dt>Lift</dt><dd>Back hall</dd></div></dl>')).toEqual([]);
  });
  it('fails other children, directly or inside the grouping div', () => {
    expect(found('<dl><p>Note</p><dt>Ramp</dt><dd>Side door</dd></dl>')).toEqual(['dl-child:fail']);
    const e = auditLists('<dl><div><dt>Ramp</dt>\n<span>x</span><dd>Side door</dd></div></dl>').entries;
    expect(e.map((x) => [x.rule, x.id])).toEqual([['dl-child', 'span@L2']]);
    expect(found('<dl><li>Ramp</li></dl>')).toEqual(['dl-child:fail']);
  });
  it('fails a term or a description outside any dl', () => {
    const e = auditLists('<div><dt>Ramp</dt>\n<dd>Side door</dd></div>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['term-outside-list', 'fail', 'dt@L1'], ['term-outside-list', 'fail', 'dd@L2']]);
    expect(e[0]?.message.en).toContain('its description is not tied');
    expect(e[1]?.message.en).toContain('its term is not tied');
    expect(e[0]?.message.fr).toContain('sa description');
    expect(e[1]?.message.fr).toContain('son terme');
  });
  it('asks when a list has terms only or descriptions only, with words for each', () => {
    const terms = auditLists('<dl><dt>Ramp</dt><dt>Lift</dt></dl>').entries;
    expect(terms.map((x) => `${x.rule}:${x.status}`)).toEqual(['term-without-description:unknown']);
    expect(terms[0]?.message.en).toContain('terms (dt) and no description');
    const descriptions = auditLists('<dl><dd>Side door</dd></dl>').entries;
    expect(descriptions[0]?.message.en).toContain('descriptions (dd) and no term');
    expect(found('<dl></dl>')).toEqual([]);
  });
  it('copes with end tags left out', () => {
    expect(found('<dl><dt>Ramp<dd>Side door<dt>Lift<dd>Back hall</dl>')).toEqual([]);
  });
  it('leaves a dl or its parts with a role alone', () => {
    expect(found('<dl role="presentation"><p>x</p></dl>')).toEqual([]);
    expect(found('<dt role="term">Ramp</dt>')).toEqual([]);
  });
});

describe('the result', () => {
  it('counts lists, terms and descriptions', () => {
    expect(auditLists('<ul><li>a</li></ul><ol><li>b</li></ol><dl><dt>c</dt><dd>d</dd></dl><p>e</p>').checked).toBe(5);
    expect(auditLists('<p>nothing</p>')).toEqual({ checked: 0, entries: [] });
  });
  it('keeps the order of the file', () => {
    const e = auditLists('<dt>a</dt>\n<ul><p>b</p></ul>\n<ol></ol>').entries;
    expect(e.map((x) => x.id)).toEqual(['dt@L1', 'p@L2', 'ol@L3']);
  });
  it('has a sample for every rule, in clean French', () => {
    const e = auditLists(SAMPLE_LISTS_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...LIST_RULES].sort());
    noFrIssues(e);
  });
  it('does not throw on broken or deep markup', () => {
    for (const html of ['', '<ul', '<ul><ul><ul>', '</dl>', '<dl><div>']) expect(() => auditLists(html)).not.toThrow();
    expect(() => auditLists('<ul><li>'.repeat(400))).not.toThrow();
  });
  it('copes with a long list', () => {
    const big = `<ul>${'<li>Item</li>'.repeat(5000)}</ul>`;
    const started = Date.now();
    expect(auditLists(big)).toEqual({ checked: 1, entries: [] });
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
