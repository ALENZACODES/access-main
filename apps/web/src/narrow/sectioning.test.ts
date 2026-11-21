import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { SAMPLE_SECTIONING_HTML } from './samples.js';
import { auditSectioning, SECTIONING_RULES } from './sectioning.js';

const found = (html: string): string[] => auditSectioning(html).entries.map((e) => `${e.rule}`);

describe('sections and articles', () => {
  it('asks about a section or an article with text and no heading or name', () => {
    const e = auditSectioning('<section><p>Opening hours</p></section>\n<article><p>News</p></article>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['section-no-heading', 'unknown', 'section@L1'], ['section-no-heading', 'unknown', 'article@L2']]);
  });
  it('passes one with a heading at any depth, a heading role, or a name', () => {
    expect(found('<section><h2>Hours</h2><p>x</p></section>')).toEqual([]);
    expect(found('<section><div><header><h3>Hours</h3></header></div><p>x</p></section>')).toEqual([]);
    expect(found('<section><div role="heading" aria-level="2">Hours</div><p>x</p></section>')).toEqual([]);
    expect(found('<section aria-label="Hours"><p>x</p></section>')).toEqual([]);
    expect(found('<h2 id="t">Hours</h2><section aria-labelledby="t"><p>x</p></section>')).toEqual([]);
  });
  it('leaves empty and hidden sections alone', () => {
    expect(found('<section id="mount"></section><section hidden><p>x</p></section><div aria-hidden="true"><article><p>x</p></article></div>')).toEqual([]);
  });
});

describe('page header and footer', () => {
  it('asks about a second page header and says how many there are', () => {
    const e = auditSectioning('<header>Site</header>\n<main><h1>x</h1></main>\n<header>Again</header>\n<div role="banner">Third</div>').entries;
    expect(e.map((x) => [x.rule, x.id])).toEqual([['duplicate-banner', 'header@L3']]);
    expect(e[0]?.message.en).toContain('3 page headers');
    expect(e[0]?.message.fr).toContain('3 en-têtes de page');
  });
  it('asks about a second page footer', () => {
    const e = auditSectioning('<footer>One</footer><footer>Two</footer>').entries;
    expect(e.map((x) => x.rule)).toEqual(['duplicate-contentinfo']);
    expect(e[0]?.message.en).toContain('2 page footers');
  });
  it('does not count a header or footer that belongs to a part of the page', () => {
    expect(found('<header>Site</header><main><h1>x</h1><article><header><h2>Post</h2></header><footer>By us</footer></article><section aria-label="s"><header>h</header></section></main><aside aria-label="a"><footer>f</footer></aside><footer>Site</footer>')).toEqual([]);
    expect(found('<header>Site</header><div role="region" aria-label="Map"><header>Map tools</header></div>')).toEqual([]);
  });
  it('does not count a hidden one, or a header with another role', () => {
    expect(found('<header>Site</header><header hidden>Old</header><header role="presentation">Deco</header>')).toEqual([]);
  });
});

describe('main', () => {
  it('asks about a main area inside another part, and names it', () => {
    const e = auditSectioning('<aside aria-label="Side"><main><h1>Help</h1></main></aside>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['main-nested', 'unknown', 'main@L1']]);
    expect(e[0]?.message.en).toContain('inside a aside');
    expect(found('<section aria-label="Wrap"><div role="main"><h1>Help</h1></div></section>')).toEqual(['main-nested']);
    expect(auditSectioning('<div role="navigation"><main><h1>x</h1></main></div>').entries[0]?.message.en).toContain('with the role navigation');
  });
  it('passes a main at the top level or inside plain boxes', () => {
    expect(found('<body><div id="root"><div class="shell"><main><h1>Help</h1></main></div></div></body>')).toEqual([]);
  });
});

describe('regions', () => {
  it('asks about a region with no name', () => {
    const e = auditSectioning('<div role="region"><h2>Map</h2></div>').entries;
    expect(e.map((x) => [x.rule, x.status])).toEqual([['region-no-name', 'unknown']]);
    expect(e[0]?.message.fr).toContain('le rôle region sans nom');
  });
  it('passes a named region', () => {
    expect(found('<div role="region" aria-label="Map"><h2>Map</h2></div>')).toEqual([]);
    expect(found('<h2 id="m">Map</h2><div role="region" aria-labelledby="m"></div>')).toEqual([]);
  });
  it('reports a section with the role region and no heading under both rules', () => {
    expect(found('<section role="region"><p>Text</p></section>')).toEqual(['section-no-heading', 'region-no-name']);
  });
});

describe('the result', () => {
  it('never claims a failure', () => {
    expect(auditSectioning(SAMPLE_SECTIONING_HTML).entries.every((e) => e.status === 'unknown')).toBe(true);
  });
  it('counts the parts it looked at', () => {
    expect(auditSectioning('<header>h</header><main><section><h2>a</h2></section><article><h2>b</h2></article></main><footer>f</footer><p>x</p>')).toEqual({ checked: 5, entries: [] });
    expect(auditSectioning('<p>nothing</p>')).toEqual({ checked: 0, entries: [] });
  });
  it('finds nothing on an ordinary page', () => {
    const page = '<body><a href="#main">Skip</a><header><nav aria-label="Main"><a href="/">Home</a></nav></header><main id="main"><h1>Hours</h1><section><h2>Today</h2><p>9 to 5</p></section></main><footer><a href="/help">Help</a></footer></body>';
    expect(found(page)).toEqual([]);
  });
  it('has a sample for every rule, in clean French', () => {
    const e = auditSectioning(SAMPLE_SECTIONING_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...SECTIONING_RULES].sort());
    noFrIssues(e);
  });
  it('does not throw on broken markup and gives the same answer twice', () => {
    for (const html of ['', '<section', '<main><main><main>', '</header>', '<div role=>']) expect(() => auditSectioning(html)).not.toThrow();
    expect(auditSectioning(SAMPLE_SECTIONING_HTML)).toEqual(auditSectioning(SAMPLE_SECTIONING_HTML));
  });
});
