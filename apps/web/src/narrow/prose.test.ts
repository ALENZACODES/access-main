import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_PROSE, MAX_BLOCK_CHARS, proseInPage, type ProseFacts } from './prose.js';
import { auditSnapshot, proseResults, selfAudit } from './run.js';
import { auditTextZoom, TEXT_ZOOM_CSS } from './textzoom.js';
import { snapshotInPage, textSpacingProbeInPage } from './inpage.js';
import { INTERACTIVE_SELECTOR } from './page.js';
import { installDom, type Installed, type Spec } from './testkit.js';
import { CHECK_LABELS, CHECK_ORDER, CHECK_SC } from './types.js';
import { noFrIssues } from './expect-fr.js';

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});

const LONG = 'The ramp is on the left side of the main door of the building.';
const args = { maxElements: 500, maxBlocks: 50, maxChars: MAX_BLOCK_CHARS };

function read(roots: Spec[], opts: Parameters<typeof installDom>[1] = {}, over: Partial<typeof args> = {}): ProseFacts {
  dom = installDom(roots, opts);
  return proseInPage({ ...args, ...over });
}

describe('proseInPage', () => {
  it('reads the page language and a block with the language in force on it', () => {
    const f = read([{ tag: 'p', id: 'a', text: LONG }], { lang: 'en-CA' });
    expect(f.pageLang).toBe('en-CA');
    expect(f.blocks).toEqual([{ id: 'p#a[0]', lang: '', own: false, text: LONG }]);
    expect(f.truncated).toBe(false);
  });
  it('reports a lang attribute on the block itself, or on an ancestor', () => {
    const f = read([
      { tag: 'p', attrs: { lang: 'fr' }, text: 'Les heures sont affichées pour vous et pour votre visite.' },
      { tag: 'section', attrs: { lang: 'fr-CA' }, children: [{ tag: 'p', text: 'Les heures sont affichées pour vous et pour votre visite.' }] },
    ]);
    expect(f.blocks.map((b) => [b.id, b.lang, b.own])).toEqual([
      ['p[0]', 'fr', true],
      ['p[1]', 'fr-CA', false],
    ]);
  });
  it('joins the text of inline children into the block of the element that holds them', () => {
    const f = read([
      {
        tag: 'p',
        text: 'Call the office',
        children: [
          { tag: 'a', text: 'or use the form' },
          { tag: 'strong', text: 'before noon today' },
        ],
      },
    ]);
    expect(f.blocks).toHaveLength(1);
    expect(f.blocks[0]?.text).toBe('Call the office or use the form before noon today');
  });
  it('does not make a block of the inline element itself', () => {
    const f = read([{ tag: 'p', text: 'Call the office', children: [{ tag: 'a', text: 'or use the form before noon today please' }] }]);
    expect(f.blocks.map((b) => b.id)).toEqual(['p[0]']);
  });
  it('keeps the text of block children with the children', () => {
    const f = read([
      {
        tag: 'div',
        text: 'Intro text for the whole of this list of items',
        children: [
          { tag: 'p', text: LONG },
          { tag: 'p', text: LONG },
        ],
      },
    ]);
    expect(f.blocks.map((b) => b.id)).toEqual(['div[0]', 'p[0]', 'p[1]']);
    expect(f.blocks[0]?.text).toBe('Intro text for the whole of this list of items');
  });
  it('skips text that is too short, hidden, in code, or marked as not translated', () => {
    const f = read([
      { tag: 'p', text: 'Too short here' },
      { tag: 'p', text: LONG, style: { display: 'none' } },
      { tag: 'p', text: LONG, style: { visibility: 'hidden' } },
      { tag: 'pre', text: LONG },
      { tag: 'code', text: LONG },
      { tag: 'button', text: LONG },
      { tag: 'p', text: LONG, attrs: { translate: 'no' } },
      { tag: 'div', style: { display: 'none' }, children: [{ tag: 'p', text: LONG }] },
    ]);
    expect(f.blocks).toEqual([]);
  });
  it('keeps up to maxChars characters of a block and no more', () => {
    const long = Array.from({ length: 100 }, () => 'word').join(' ');
    const f = read([{ tag: 'p', text: long }], {}, { maxChars: 120 });
    expect(f.blocks[0]?.text).toHaveLength(120);
    const whole = read([{ tag: 'p', text: long }]);
    expect(whole.blocks[0]?.text).toBe(long);
  });
  it('collapses white space', () => {
    const f = read([{ tag: 'p', text: '  The   ramp\n is on\tthe left   side of the door ' }]);
    expect(f.blocks[0]?.text).toBe('The ramp is on the left side of the door');
  });
  it('collects abbr and dfn text that has a title, once', () => {
    const f = read([
      { tag: 'p', text: 'Ask your OT about the grab bars in the bathroom today', children: [{ tag: 'abbr', text: 'OT', attrs: { title: 'occupational therapist' } }] },
      { tag: 'abbr', text: 'PT', attrs: { title: '' } },
      { tag: 'dfn', text: 'SLP', attrs: { title: 'speech-language pathologist' } },
      { tag: 'abbr', text: 'OT', attrs: { title: 'occupational therapist' } },
    ]);
    expect(f.abbrs).toEqual(['OT', 'SLP']);
  });
  it('numbers blocks of the same tag from zero and says when the limits were hit', () => {
    const roots: Spec[] = Array.from({ length: 5 }, () => ({ tag: 'p', text: LONG }));
    const f = read(roots, {}, { maxBlocks: 3 });
    expect(f.blocks.map((b) => b.id)).toEqual(['p[0]', 'p[1]', 'p[2]']);
    expect(f.truncated).toBe(true);
    const g = read(roots, {}, { maxElements: 2 });
    expect(g.blocks).toHaveLength(2);
    expect(g.truncated).toBe(true);
  });
  it('is not truncated when everything fit', () => {
    expect(read([{ tag: 'p', text: LONG }]).truncated).toBe(false);
  });
});

describe('proseInPage: headings and title', () => {
  it('reads heading levels from the tag and from role and aria-level, and the document title', () => {
    const f = read(
      [
        { tag: 'h1', id: 'top', text: 'Clinic hours' },
        { tag: 'h3', text: 'Parking' },
        { tag: 'div', attrs: { role: 'heading', 'aria-level': '2' }, text: 'Getting here' },
        { tag: 'div', attrs: { role: 'heading' }, text: 'No level given' },
        { tag: 'div', attrs: { role: 'heading', 'aria-level': '9' }, text: 'Level too high' },
      ],
      { title: '  Clinic   hours ' },
    );
    expect(f.title).toBe('Clinic hours');
    expect(f.headings.map((x) => [x.id, x.level, x.text])).toEqual([
      ['h1#top[0]', 1, 'Clinic hours'],
      ['h3[0]', 3, 'Parking'],
      ['div[0]', 2, 'Getting here'],
      ['div[1]', 2, 'No level given'],
      ['div[2]', 6, 'Level too high'],
    ]);
  });
  it('includes the text of inline children and skips hidden headings', () => {
    const f = read([
      { tag: 'h2', text: 'Opening', children: [{ tag: 'span', text: 'hours' }] },
      { tag: 'h2', text: 'Hidden', style: { display: 'none' } },
      { tag: 'section', style: { visibility: 'hidden' }, children: [{ tag: 'h2', text: 'Also hidden' }] },
    ]);
    expect(f.headings.map((x) => x.text)).toEqual(['Opening hours']);
  });
  it('keeps at most 200 characters of a heading and 200 headings', () => {
    const f = read(Array.from({ length: 210 }, () => ({ tag: 'h2', text: 'x'.repeat(300) })), {}, { maxElements: 1000 });
    expect(f.headings).toHaveLength(200);
    expect(f.headings[0]?.text).toHaveLength(200);
  });
  it('has an empty title when the document has none', () => {
    expect(read([{ tag: 'p', text: LONG }]).title).toBe('');
  });
});

describe('proseResults', () => {
  it('runs the three checks on the same facts', () => {
    const f: ProseFacts = {
      ...EMPTY_PROSE,
      pageLang: 'en',
      blocks: [{ id: 'p[0]', lang: '', own: false, text: 'Press the green button before 9 pm on 03/04/2026 and ask your OT about it.' }],
    };
    const r = proseResults(f);
    expect(Object.keys(r).sort()).toEqual(['headings', 'locale', 'plain', 'sensory']);
    expect(r['sensory']?.entries.map((e) => e.rule)).toEqual(['colour']);
    expect(r['locale']?.entries.map((e) => e.rule)).toEqual(['ambiguous-date']);
    expect(r['plain']?.entries.map((e) => e.rule)).toEqual(['abbreviation']);
  });
  it('finds nothing on a page with no running text', () => {
    const r = proseResults(EMPTY_PROSE);
    for (const c of Object.values(r)) expect(c).toEqual({ checked: 0, entries: [] });
  });
});

describe('text zoom', () => {
  it('doubles the base size and says it in the rule', () => {
    expect(TEXT_ZOOM_CSS).toContain('font-size: 200%');
    expect(TEXT_ZOOM_CSS).toContain('html');
  });
  it('fails only the boxes that start to cut text off, and puts the page back', () => {
    dom = installDom([
      { tag: 'div', id: 'card', text: 'Cut at double size', style: { overflowY: 'hidden' }, scroll: { sw: 100, cw: 100, sh: 20, ch: 20 }, scrollAfter: { sw: 100, cw: 100, sh: 60, ch: 20 } },
      { tag: 'div', text: 'Already cut', style: { overflowY: 'hidden' }, scroll: { sw: 100, cw: 100, sh: 40, ch: 20 }, scrollAfter: { sw: 100, cw: 100, sh: 80, ch: 20 } },
      { tag: 'div', text: 'Fine', style: { overflowY: 'hidden' } },
    ]);
    const res = textSpacingProbeInPage({ css: TEXT_ZOOM_CSS, maxElements: 100 });
    const r = auditTextZoom(res);
    expect(r.checked).toBe(3);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ check: 'text-zoom', id: 'div#card[0]', status: 'fail', rule: 'clipped-at-200' });
    expect(dom.world.styleElements).toBe(0);
    noFrIssues(r.entries);
  });
  it('finds nothing when nothing is cut', () => {
    dom = installDom([{ tag: 'p', text: LONG }]);
    expect(auditTextZoom(textSpacingProbeInPage({ css: TEXT_ZOOM_CSS, maxElements: 100 })).entries).toEqual([]);
  });
});

describe('check tables', () => {
  it('have an order, a label in both languages and a criterion entry for each new check', () => {
    for (const id of ['plain', 'locale', 'sensory', 'text-zoom'] as const) {
      expect(CHECK_ORDER).toContain(id);
      expect(CHECK_LABELS[id].en).not.toBe('');
      expect(CHECK_LABELS[id].fr).not.toBe(CHECK_LABELS[id].en);
      expect(id in CHECK_SC).toBe(true);
    }
    expect(CHECK_SC.plain).toBe('3.1.5');
    expect(CHECK_SC.sensory).toBe('1.3.3');
    expect(CHECK_SC['text-zoom']).toBe('1.4.4');
    expect(CHECK_SC.locale).toBeNull();
  });
});

describe('auditSnapshot with prose and textZoom', () => {
  const snapshot = (): ReturnType<typeof snapshotInPage> => snapshotInPage({ selector: INTERACTIVE_SELECTOR, maxElements: 100 });
  it('adds the four checks to a route audit only when their facts are given', () => {
    dom = installDom([{ tag: 'p', text: LONG }]);
    const base = auditSnapshot('/x', 320, { snapshot: snapshot() });
    expect(base.checks.map((c) => c.check)).not.toContain('plain');
    const prose: ProseFacts = { ...EMPTY_PROSE, pageLang: 'en', blocks: [{ id: 'p[0]', lang: '', own: false, text: 'Press the green button when you have checked your answers.' }] };
    const full = auditSnapshot('/x', 320, { snapshot: snapshot(), prose, textZoom: { checked: 3, newlyClipped: [{ id: 'div[1]', scrollWidth: 1, clientWidth: 1, scrollHeight: 60, clientHeight: 20 }] } });
    const names = full.checks.map((c) => c.check);
    expect(names).toEqual(expect.arrayContaining(['plain', 'locale', 'sensory', 'text-zoom']));
    expect(full.entries.filter((e) => e.check === 'sensory')).toHaveLength(1);
    expect(full.entries.filter((e) => e.check === 'text-zoom').map((e) => e.status)).toEqual(['fail']);
  });
});

describe('selfAudit', () => {
  it('runs the prose checks on the live document', () => {
    dom = installDom([
      { tag: 'main', children: [{ tag: 'h1', text: 'Help' }, { tag: 'p', text: 'Press the green button when you have checked all of your answers.' }] },
    ]);
    const report = selfAudit(new Date('2026-11-16T12:00:00Z'));
    const route = report.routes[0];
    expect(route?.checks.map((c) => c.check)).toEqual(expect.arrayContaining(['plain', 'locale', 'sensory']));
    expect(route?.entries.filter((e) => e.check === 'sensory').map((e) => e.status)).toEqual(['unknown']);
  });
});

describe('the sample set covers every text rule in both languages', () => {
  it('has a sample entry for each plain, locale and sensory rule, with French that follows the typography rules', async () => {
    const { sampleEntries } = await import('./samples.js');
    const { PLAIN_RULES } = await import('./plain.js');
    const { LOCALE_RULES } = await import('./locale.js');
    const { SENSORY_RULES } = await import('./sensory.js');
    const { HEADING_RULES } = await import('./headings.js');
    const all = sampleEntries();
    const ruleSet = (check: string): Set<string | undefined> => new Set(all.filter((e) => e.check === check).map((e) => e.rule));
    for (const r of PLAIN_RULES) expect(ruleSet('plain').has(r), `plain ${r}`).toBe(true);
    for (const r of LOCALE_RULES) expect(ruleSet('locale').has(r), `locale ${r}`).toBe(true);
    for (const r of SENSORY_RULES) expect(ruleSet('sensory').has(r), `sensory ${r}`).toBe(true);
    for (const r of HEADING_RULES) expect(ruleSet('headings').has(r), `headings ${r}`).toBe(true);
    expect(ruleSet('text-zoom').has('clipped-at-200')).toBe(true);
    noFrIssues(all.filter((e) => ['plain', 'locale', 'sensory', 'text-zoom', 'headings'].includes(e.check)));
  });
});
