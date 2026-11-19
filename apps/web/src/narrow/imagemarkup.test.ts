import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { auditImageMarkup, IMAGE_MARKUP_RULES } from './imagemarkup.js';
import { SAMPLE_IMAGE_MARKUP_HTML } from './samples.js';

const found = (html: string): string[] => auditImageMarkup(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('picture', () => {
  it('fails a picture with sources and no img', () => {
    const e = auditImageMarkup('<picture><source srcset="a.webp" type="image/webp"><source srcset="a.png"></picture>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['picture-no-img', 'fail', 'picture@L1']]);
    expect(found('<picture></picture>')).toEqual(['picture-no-img:fail']);
  });
  it('passes a picture with an img', () => {
    expect(found('<picture><source srcset="a.webp" type="image/webp"><img src="a.png" alt="Ramp"></picture>')).toEqual([]);
  });
  it('needs the img as a direct child', () => {
    expect(found('<picture><div><img src="a.png" alt="Ramp"></div></picture>')).toEqual(['picture-no-img:fail']);
  });
});

describe('image map areas', () => {
  it('fails a linked area with no alt and shows where it goes', () => {
    const e = auditImageMarkup('<map name="plan"><area href="/east" shape="rect" coords="0,0,9,9"></map>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['area-no-alt', 'fail', 'area@L1']]);
    expect(e[0]?.message.en).toContain('“/east”');
    expect(found('<map name="m"><area href="/a" alt=""></map>')).toEqual(['area-no-alt:fail']);
  });
  it('passes an area with an alt or an ARIA name, and an area that is not a link', () => {
    expect(found('<map name="m"><area href="/a" alt="East wing"><area href="/b" aria-label="West wing"><area shape="rect" coords="0,0,1,1"></map>')).toEqual([]);
  });
});

describe('figure captions', () => {
  it('fails a second caption and counts them', () => {
    const e = auditImageMarkup('<figure><figcaption>One</figcaption><img src="a.png" alt="Ramp">\n<figcaption>Two</figcaption></figure>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['figcaption-misplaced', 'fail', 'figcaption@L2']]);
    expect(e[0]?.message.en).toContain('has 2 captions');
    expect(e[0]?.message.fr).toContain('a 2 légendes');
  });
  it('fails a caption in the middle', () => {
    const e = auditImageMarkup('<figure><img src="a.png" alt="A"><figcaption>Middle</figcaption><img src="b.png" alt="B"></figure>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['figcaption-misplaced:fail']);
    expect(e[0]?.message.en).toContain('in the middle of its figure');
  });
  it('passes a caption first or last, a figure with none, and ignores script children', () => {
    expect(found('<figure><figcaption>Top</figcaption><img src="a.png" alt="A"><img src="b.png" alt="B"></figure>')).toEqual([]);
    expect(found('<figure><img src="a.png" alt="A"><p>Note</p><figcaption>Bottom</figcaption></figure>')).toEqual([]);
    expect(found('<figure><img src="a.png" alt="A"></figure>')).toEqual([]);
    expect(found('<figure><img src="a.png" alt="A"><p>Note</p><figcaption>Bottom</figcaption><script>x()</script></figure>')).toEqual([]);
  });
});

describe('decoration that also has a name', () => {
  it('asks about an empty alt with a title or an ARIA name, and says which', () => {
    const e = auditImageMarkup('<img src="deco.png" alt="" title="Swirl">').entries;
    expect(e.map((x) => [x.rule, x.status])).toEqual([['decorative-conflict', 'unknown']]);
    expect(e[0]?.message.en).toContain('(an empty alt) and also has title');
    expect(e[0]?.message.fr).toContain('(un alt vide) et porte aussi title');
    expect(auditImageMarkup('<img src="d.png" alt="" aria-label="Swirl" title="Swirl">').entries[0]?.message.en).toContain('aria-label and title');
  });
  it('asks about a presentation role with a real alt', () => {
    const e = auditImageMarkup('<img src="deco.png" role="presentation" alt="Ramp at the side door">').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['decorative-conflict:unknown']);
    expect(e[0]?.message.en).toContain('(role presentation) and also has alt');
    expect(found('<img src="deco.png" role="none" alt="Ramp">')).toEqual(['decorative-conflict:unknown']);
  });
  it('passes plain decoration and plain content images', () => {
    expect(found('<img src="deco.png" alt=""><img src="deco.png" role="presentation" alt=""><img src="a.png" alt="Ramp" title="Ramp"><img src="b.png">')).toEqual([]);
  });
});

describe('longdesc', () => {
  it('asks about the obsolete attribute', () => {
    expect(found('<img src="chart.png" alt="Visits by month" longdesc="chart.html">')).toEqual(['longdesc:unknown']);
    expect(found('<img src="chart.png" alt="Visits by month" longdesc="">')).toEqual([]);
  });
});

describe('the result', () => {
  it('counts pictures, areas, figures and images, and skips hidden ones', () => {
    expect(auditImageMarkup('<picture><img src="a.png" alt="A"></picture><figure><img src="b.png" alt="B"></figure><map name="m"><area href="/x" alt="X"></map><div hidden><picture></picture></div><p>t</p>')).toEqual({ checked: 5, entries: [] });
  });
  it('keeps the order of the file', () => {
    const e = auditImageMarkup('<img src="a.png" alt="" title="t">\n<picture></picture>\n<img src="b.png" alt="B" longdesc="x">').entries;
    expect(e.map((x) => x.id)).toEqual(['img@L1', 'picture@L2', 'img@L3']);
  });
  it('has a sample for every rule, in clean French, and fails only what it measured', () => {
    const e = auditImageMarkup(SAMPLE_IMAGE_MARKUP_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...IMAGE_MARKUP_RULES].sort());
    noFrIssues(e);
    for (const x of e) expect(x.status, x.rule).toBe(x.rule === 'decorative-conflict' || x.rule === 'longdesc' ? 'unknown' : 'fail');
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<picture', '<figure><figcaption>', '<area href', '<img alt=']) expect(() => auditImageMarkup(html)).not.toThrow();
  });
});
