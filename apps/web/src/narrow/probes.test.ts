import { afterEach, describe, expect, it } from 'vitest';
import { auditConsistency, sameRelativeOrder, type RouteFacts } from './consistency.js';
import { frTypographyIssues } from './i18n.js';
import {
  auditControlBoundaries,
  auditDragging,
  auditLinkCues,
  HELP_WORDS,
  probesInPage,
  type ControlFact,
  type LinkFact,
  type PageFacts,
} from './probes.js';
import { installDom, type Installed, type Spec } from './testkit.js';

const link = (over: Partial<LinkFact> = {}): LinkFact => ({
  id: 'a[0]',
  text: 'Opening hours',
  color: 'rgb(0, 0, 238)',
  parentColor: 'rgb(0, 0, 0)',
  decoration: 'none',
  weight: 400,
  parentWeight: 400,
  borderBottomWidth: 0,
  bgLayers: ['rgb(255, 255, 255)'],
  bgImage: false,
  ...over,
});

describe('auditLinkCues', () => {
  it('passes an underlined link whatever its colour', () => {
    expect(auditLinkCues([link({ decoration: 'underline', color: 'rgb(10, 10, 10)' })]).entries).toEqual([]);
  });
  it('passes a link with a bottom border or a much bolder weight', () => {
    expect(auditLinkCues([link({ borderBottomWidth: 1, color: 'rgb(10, 10, 10)' }), link({ weight: 700, color: 'rgb(10, 10, 10)' })]).entries).toEqual([]);
  });
  it('a small weight change is not a cue', () => {
    expect(auditLinkCues([link({ weight: 500, color: 'rgb(10, 10, 10)' })]).entries[0]?.status).toBe('fail');
  });
  it('passes a plain link whose colour is 3:1 away from the text', () => {
    expect(auditLinkCues([link({ color: 'rgb(0, 120, 255)' })]).entries).toEqual([]);
  });
  it('fails the default blue next to black text, which is only about 2.2:1', () => {
    expect(auditLinkCues([link()]).entries[0]?.message.en).toContain('2.2');
  });
  it('fails a plain link that is close in colour to the text, with the ratio', () => {
    const e = auditLinkCues([link({ color: 'rgb(60, 60, 60)' })]).entries[0];
    expect(e).toMatchObject({ check: 'link-cue', status: 'fail', rule: 'colour-only' });
    expect(e?.message.en).toMatch(/colour alone, at \d\.\d\d:1/);
    expect(frTypographyIssues(e?.message.fr ?? ''), e?.message.fr).toEqual([]);
  });
  it('is unknown when a colour is not understood or the backdrop is an image', () => {
    expect(auditLinkCues([link({ color: 'color-mix(in srgb, red, blue)' })]).entries[0]).toMatchObject({ status: 'unknown', rule: 'colour' });
    expect(auditLinkCues([link({ color: 'rgba(0, 0, 238, 0.5)', bgImage: true })]).entries[0]?.status).toBe('unknown');
  });
  it('composites a translucent link colour on its background', () => {
    const faint = link({ color: 'rgba(0, 0, 0, 0.9)', parentColor: 'rgb(0, 0, 0)' });
    expect(auditLinkCues([faint]).entries[0]?.status).toBe('fail');
  });
  it('counts what it looked at', () => {
    expect(auditLinkCues([link(), link({ decoration: 'underline' })]).checked).toBe(2);
    expect(auditLinkCues([]).checked).toBe(0);
  });
});

const control = (over: Partial<ControlFact> = {}): ControlFact => ({
  id: 'input[0]',
  fill: 'rgba(0, 0, 0, 0)',
  sides: [
    { color: 'rgb(118, 118, 118)', width: 1 },
    { color: 'rgb(118, 118, 118)', width: 1 },
    { color: 'rgb(118, 118, 118)', width: 1 },
    { color: 'rgb(118, 118, 118)', width: 1 },
  ],
  bgLayers: ['rgb(255, 255, 255)'],
  bgImage: false,
  ...over,
});
const noBorder = { color: 'rgb(0, 0, 0)', width: 0 };

describe('auditControlBoundaries', () => {
  it('passes the usual grey border on white', () => {
    expect(auditControlBoundaries([control()]).entries).toEqual([]);
  });
  it('fails a faint border and reports the ratio', () => {
    const faint = control({ sides: Array(4).fill({ color: 'rgb(220, 220, 220)', width: 1 }) });
    const e = auditControlBoundaries([faint]).entries[0];
    expect(e).toMatchObject({ check: 'non-text-contrast', status: 'fail', rule: 'boundary' });
    expect(e?.message.en).toContain('1.3');
    expect(e?.message.fr).toContain('1,3');
    expect(frTypographyIssues(e?.message.fr ?? ''), e?.message.fr).toEqual([]);
  });
  it('fails a field with no border and the same fill as the page', () => {
    expect(auditControlBoundaries([control({ sides: Array(4).fill(noBorder), fill: 'rgb(255, 255, 255)' })]).entries[0]?.status).toBe('fail');
  });
  it('passes a borderless field with a fill that stands out, and a bottom-line field', () => {
    expect(auditControlBoundaries([control({ sides: Array(4).fill(noBorder), fill: 'rgb(40, 40, 40)' })]).entries).toEqual([]);
    const underline = control({ sides: [noBorder, noBorder, { color: 'rgb(90, 90, 90)', width: 2 }, noBorder] });
    expect(auditControlBoundaries([underline]).entries).toEqual([]);
  });
  it('a zero-width or transparent border is not a boundary', () => {
    const none = control({ sides: [{ color: 'rgb(0, 0, 0)', width: 0 }, { color: 'rgba(0, 0, 0, 0)', width: 2 }, noBorder, noBorder] });
    expect(auditControlBoundaries([none]).entries[0]?.status).toBe('fail');
  });
  it('is unknown over an image or when no layer is opaque', () => {
    expect(auditControlBoundaries([control({ bgImage: true })]).entries[0]).toMatchObject({ status: 'unknown', rule: 'backdrop' });
    expect(auditControlBoundaries([control({ bgLayers: ['rgba(0, 0, 0, 0)'] })]).entries[0]?.status).toBe('unknown');
  });
});

describe('auditDragging', () => {
  it('asks about every draggable element and never passes one', () => {
    const r = auditDragging(['div[2]', 'li[4]']);
    expect(r.checked).toBe(2);
    expect(r.entries.map((e) => [e.id, e.status, e.rule])).toEqual([['div[2]', 'unknown', 'draggable'], ['li[4]', 'unknown', 'draggable']]);
    expect(frTypographyIssues(r.entries[0]?.message.fr ?? '')).toEqual([]);
  });
  it('has nothing to report when nothing can be dragged', () => {
    expect(auditDragging([])).toEqual({ checked: 0, entries: [] });
  });
});

describe('probesInPage on a fake page', () => {
  let dom: Installed | null = null;
  afterEach(() => {
    dom?.uninstall();
    dom = null;
  });
  const run = (roots: Spec[], title = 'Hours'): PageFacts => {
    dom = installDom(roots, { lang: 'fr-CA', title });
    return probesInPage({ maxElements: 100, helpPattern: HELP_WORDS.source });
  };
  const page: Spec[] = [
    {
      tag: 'header',
      children: [{ tag: 'a', text: 'Aide', attrs: { href: '/help' } }],
    },
    {
      tag: 'nav',
      children: [
        { tag: 'a', text: 'Map', attrs: { href: '/map' } },
        { tag: 'a', text: 'Tools', attrs: { href: '/tools' } },
      ],
    },
    {
      tag: 'main',
      children: [
        {
          tag: 'p',
          text: 'See the',
          style: { color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)' },
          children: [{ tag: 'a', text: 'schedule', attrs: { href: '/s' }, style: { color: 'rgb(0, 0, 238)', textDecorationLine: 'none' } }],
        },
        { tag: 'input', attrs: { type: 'text' }, style: { borderTopColor: 'rgb(118, 118, 118)', borderTopWidth: '1px' } },
        { tag: 'input', attrs: { type: 'checkbox' } },
        { tag: 'div', attrs: { draggable: 'true' } },
        { tag: 'div', attrs: { draggable: 'false' } },
      ],
    },
  ];
  it('reads title and language', () => {
    const f = run(page);
    expect(f.title).toBe('Hours');
    expect(f.lang).toBe('fr-CA');
  });
  it('lists navigation links in order, and finds the help link and where it is', () => {
    const f = run(page);
    expect(f.nav).toEqual(['Map', 'Tools']);
    expect(f.help).toEqual({ text: 'Aide', region: 'header', afterMain: false });
  });
  it('lists a link inside a sentence, with the colours around it', () => {
    const f = run(page);
    expect(f.links).toHaveLength(1);
    expect(f.links[0]).toMatchObject({ text: 'schedule', color: 'rgb(0, 0, 238)', parentColor: 'rgb(0, 0, 0)', decoration: 'none' });
    expect(f.links[0]?.bgLayers.at(-1)).toBe('rgb(255, 255, 255)');
  });
  it('leaves out links that stand alone, such as menu items', () => {
    const f = run([{ tag: 'ul', children: [{ tag: 'li', children: [{ tag: 'a', text: 'Home', attrs: { href: '/' } }] }] }]);
    expect(f.links).toEqual([]);
  });
  it('lists text fields but not checkboxes, and draggable elements', () => {
    const f = run(page);
    expect(f.controls.map((c) => c.id)).toEqual(['input[0]']);
    expect(f.controls[0]?.sides[0]).toEqual({ color: 'rgb(118, 118, 118)', width: 1 });
    expect(f.draggables).toEqual(['div[0]']);
  });
  it('skips hidden elements', () => {
    const f = run([{ tag: 'div', style: { display: 'none' }, children: [{ tag: 'input', attrs: { type: 'text' } }, { tag: 'div', attrs: { draggable: 'true' } }] }]);
    expect(f.controls).toEqual([]);
    expect(f.draggables).toEqual([]);
  });
  it('marks help that comes after main content', () => {
    const f = run([{ tag: 'main', children: [{ tag: 'p', text: 'x' }] }, { tag: 'footer', children: [{ tag: 'a', text: 'Contact us', attrs: { href: '/c' } }] }]);
    expect(f.help).toEqual({ text: 'Contact us', region: 'footer', afterMain: true });
  });
  it('finds a help button as well as a help link, and reports none when absent', () => {
    expect(run([{ tag: 'button', text: 'Need help?' }]).help?.region).toBe('body');
    expect(run([{ tag: 'p', text: 'Nothing here' }]).help).toBeNull();
  });
  it('reports truncation', () => {
    dom = installDom(page, {});
    expect(probesInPage({ maxElements: 2, helpPattern: HELP_WORDS.source }).truncated).toBe(true);
  });
});

const facts = (over: Partial<PageFacts> = {}): PageFacts => ({
  title: 'Home',
  lang: 'en',
  links: [],
  controls: [],
  draggables: [],
  nav: ['Map', 'Tools', 'About'],
  help: { text: 'Help', region: 'footer', afterMain: true },
  truncated: false,
  ...over,
});
const pages = (...f: Array<[string, Partial<PageFacts>]>): RouteFacts[] => f.map(([route, o]) => ({ route, facts: facts(o) }));

describe('sameRelativeOrder', () => {
  it('compares only the shared items', () => {
    expect(sameRelativeOrder(['A', 'B', 'C'], ['A', 'X', 'C'])).toBe(true);
    expect(sameRelativeOrder(['A', 'B', 'C'], ['C', 'B', 'A'])).toBe(false);
    expect(sameRelativeOrder(['a', 'b'], ['B', 'A'])).toBe(false);
    expect(sameRelativeOrder(['A'], ['B'])).toBe(true);
  });
});

describe('auditConsistency', () => {
  it('needs two pages', () => {
    expect(auditConsistency(pages(['/a', {}]))).toEqual({ checked: 1, entries: [] });
  });
  it('passes pages that agree', () => {
    const r = auditConsistency(pages(['/a', { title: 'A' }], ['/b', { title: 'B', nav: ['Map', 'Tools', 'About', 'Extra'] }]));
    expect(r.entries).toEqual([]);
    expect(r.checked).toBe(2);
  });
  it('fails navigation links in a different order, naming the other page', () => {
    const r = auditConsistency(pages(['/a', { title: 'A' }], ['/b', { title: 'B', nav: ['Tools', 'Map', 'About'] }]));
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ id: '/b', status: 'fail', rule: 'nav-order' });
    expect(r.entries[0]?.message.en).toContain('/a');
    expect(frTypographyIssues(r.entries[0]?.message.fr ?? '')).toEqual([]);
  });
  it('does not compare pages that share fewer than two links', () => {
    expect(auditConsistency(pages(['/a', { title: 'A' }], ['/b', { title: 'B', nav: ['Map', 'Other'].reverse() }])).entries).toEqual([]);
  });
  it('fails help in a different place and says where', () => {
    const r = auditConsistency(pages(['/a', { title: 'A' }], ['/b', { title: 'B', help: { text: 'Aide', region: 'header', afterMain: false } }]));
    expect(r.entries[0]).toMatchObject({ id: '/b', status: 'fail', rule: 'help-place' });
    expect(r.entries[0]?.message.en).toContain('the header');
    expect(r.entries[0]?.message.en).toContain('the footer');
  });
  it('help missing on one page is unknown, not a failure', () => {
    const r = auditConsistency(pages(['/a', { title: 'A' }], ['/b', { title: 'B', help: null }]));
    expect(r.entries).toEqual([expect.objectContaining({ id: '/b', status: 'unknown', rule: 'help-missing' })]);
  });
  it('no help anywhere reports nothing', () => {
    expect(auditConsistency(pages(['/a', { title: 'A', help: null }], ['/b', { title: 'B', help: null }])).entries).toEqual([]);
  });
  it('repeated titles are unknown and name the first page', () => {
    const r = auditConsistency(pages(['/a', {}], ['/b', {}], ['/c', { title: 'Other' }]));
    expect(r.entries.map((e) => [e.id, e.rule, e.status])).toEqual([['/b', 'title-repeat', 'unknown']]);
    expect(r.entries[0]?.message.en).toContain('/a');
  });
  it('ignores empty titles here, since the markup check reports them', () => {
    expect(auditConsistency(pages(['/a', { title: '' }], ['/b', { title: '' }])).entries).toEqual([]);
  });
  it('a different language is an unknown for a person to confirm', () => {
    const r = auditConsistency(pages(['/a', { title: 'A' }], ['/b', { title: 'B', lang: 'fr-CA' }]));
    expect(r.entries).toEqual([expect.objectContaining({ id: '/b', rule: 'lang-differs', status: 'unknown' })]);
    expect(frTypographyIssues(r.entries[0]?.message.fr ?? '')).toEqual([]);
  });
  it('the same language with another region is not flagged', () => {
    expect(auditConsistency(pages(['/a', { title: 'A', lang: 'en-CA' }], ['/b', { title: 'B', lang: 'en-GB' }])).entries).toEqual([]);
  });
});
