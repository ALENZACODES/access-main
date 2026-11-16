import { afterEach, describe, expect, it } from 'vitest';
import { auditBypass } from './bypass.js';
import { auditFrames } from './frames.js';
import { auditImages } from './images.js';
import { auditLinks } from './links.js';
import { selfAudit, structureResults } from './run.js';
import { auditTables } from './tables.js';
import { auditTiming } from './timing.js';
import { EMPTY_STRUCTURE, structureInPage, type StructureFacts } from './structure.js';
import { installDom, type Installed, type Spec } from './testkit.js';

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});

function read(roots: Spec[], opts: Parameters<typeof installDom>[1] = {}, maxElements = 500): StructureFacts {
  dom = installDom(roots, opts);
  return structureInPage({ maxElements });
}

const cell = (tag: 'td' | 'th', text: string, attrs: Record<string, string> = {}): Spec => ({ tag, text, attrs });
const row = (...cells: Spec[]): Spec => ({ tag: 'tr', children: cells });

describe('structureInPage: tables', () => {
  it('counts rows, columns and header cells and reads the caption', () => {
    const f = read([
      {
        tag: 'table',
        id: 'hours',
        children: [
          { tag: 'caption', text: 'Opening hours' },
          row(cell('th', 'Day', { scope: 'col' }), cell('th', 'Hours', { scope: 'col' })),
          row(cell('td', 'Mon'), cell('td', '9 to 5')),
          row(cell('td', 'Tue'), cell('td', '9 to 5')),
        ],
      },
    ]);
    expect(f.tables).toEqual([
      { id: 'table#hours[0]', rows: 3, cols: 2, headers: 2, emptyHeaders: 0, caption: true, named: true, role: '', scoped: 2, spans: false, nested: false },
    ]);
  });
  it('counts a header cell with no text as empty, unless it has a name', () => {
    const f = read([{ tag: 'table', children: [row(cell('th', ''), cell('th', '', { 'aria-label': 'Actions' }), cell('th', 'Name')), row(cell('td', 'a'), cell('td', 'b'), cell('td', 'c'))] }]);
    expect(f.tables[0]).toMatchObject({ headers: 2, emptyHeaders: 1 });
  });
  it('reads the role, spans and a name from aria-label', () => {
    const f = read([{ tag: 'table', attrs: { role: 'Presentation', 'aria-label': 'Layout' }, children: [row(cell('td', 'a', { colspan: '2' })), row(cell('td', 'b'), cell('td', 'c'))] }]);
    expect(f.tables[0]).toMatchObject({ role: 'presentation', spans: true, named: true, caption: false, cols: 2 });
  });
  it('reports a table inside another table, and keeps the cells of each apart', () => {
    const f = read([
      { tag: 'table', children: [row({ tag: 'td', children: [{ tag: 'table', children: [row(cell('th', 'x'), cell('th', 'y')), row(cell('td', '1'), cell('td', '2'))] }] })] },
    ]);
    expect(f.tables).toHaveLength(2);
    expect(f.tables[0]).toMatchObject({ nested: false, headers: 0, rows: 1 });
    expect(f.tables[1]).toMatchObject({ nested: true, headers: 2, rows: 2 });
  });
  it('skips a hidden table', () => {
    expect(read([{ tag: 'table', style: { display: 'none' }, children: [row(cell('td', 'a'))] }]).tables).toEqual([]);
    dom?.uninstall();
    expect(read([{ tag: 'div', attrs: { 'aria-hidden': 'true' }, children: [{ tag: 'table', children: [row(cell('td', 'a'))] }] }]).tables).toEqual([]);
  });
});

describe('structureInPage: frames and embeds', () => {
  it('reads the title of a frame and the host of its source', () => {
    const f = read([{ tag: 'iframe', attrs: { title: 'Route map', src: 'https://www.maps.example.org/embed?x=1' } }]);
    expect(f.frames).toEqual([{ id: 'iframe[0]', tag: 'iframe', name: 'Route map', role: '', decorative: false, fallback: false, host: 'maps.example.org' }]);
  });
  it('reads a name from aria-label or aria-labelledby', () => {
    const f = read([
      { tag: 'canvas', attrs: { 'aria-label': 'Chart' } },
      { tag: 'span', id: 'cap', text: 'Chart of visits' },
      { tag: 'canvas', attrs: { 'aria-labelledby': 'cap' } },
      { tag: 'canvas' },
    ]);
    expect(f.frames.map((x) => x.name)).toEqual(['Chart', 'Chart of visits', '']);
  });
  it('treats aria-hidden and presentation as decorative, and drops aria-hidden ones', () => {
    const f = read([{ tag: 'canvas', attrs: { role: 'presentation' } }, { tag: 'canvas', attrs: { role: 'none' } }, { tag: 'canvas', attrs: { 'aria-hidden': 'true' } }]);
    expect(f.frames.map((x) => x.id)).toEqual(['canvas[0]', 'canvas[1]']);
    expect(f.frames.every((x) => x.decorative)).toBe(true);
  });
  it('reads fallback text inside a canvas and the data host of an object', () => {
    const f = read([{ tag: 'canvas', text: 'A chart of visits per day' }, { tag: 'object', attrs: { data: 'http://files.example.org/a.pdf' } }]);
    expect(f.frames.map((x) => [x.tag, x.fallback, x.host])).toEqual([
      ['canvas', true, ''],
      ['object', false, 'files.example.org'],
    ]);
  });
});

describe('structureInPage: timing', () => {
  it('finds marquee and blink elements', () => {
    expect(read([{ tag: 'marquee', text: 'News' }, { tag: 'blink', text: 'Sale' }, { tag: 'p', text: 'Fine' }]).timing.marquee).toEqual(['marquee[0]', 'blink[0]']);
  });
  it('finds text whose computed decoration blinks', () => {
    const f = read([{ tag: 'span', text: 'Hi', style: { textDecorationLine: 'underline blink' } }, { tag: 'span', text: 'Ok', style: { textDecorationLine: 'underline' } }]);
    expect(f.timing.blink).toEqual(['span[0]']);
  });
  it('finds a carousel by its class or id and reads whether it has a pause control', () => {
    const f = read([
      { tag: 'div', attrs: { class: 'hero carousel' }, children: [{ tag: 'button', text: 'Next' }] },
      { tag: 'div', id: 'photo-slider', children: [{ tag: 'button', attrs: { 'aria-label': 'Pause slideshow' } }] },
      { tag: 'div', attrs: { class: 'carouselish' } },
    ]);
    expect(f.timing.carousels).toEqual([
      { id: 'div[0]', pause: false },
      { id: 'div#photo-slider[1]', pause: true },
    ]);
  });
  it('accepts a French pause control', () => {
    expect(read([{ tag: 'div', attrs: { class: 'slider' }, children: [{ tag: 'button', text: 'Mettre en pause' }] }]).timing.carousels[0]?.pause).toBe(true);
  });
  it('finds text about a time limit in both languages, and ignores long text and hidden text', () => {
    const f = read([
      { tag: 'p', text: 'Your session will expire in 2 minutes.' },
      { tag: 'p', text: 'Votre session expire dans 2 minutes.' },
      { tag: 'p', text: 'Opening hours are 9 to 5.' },
      { tag: 'p', text: 'You will be logged out soon. ' + 'x'.repeat(420) },
      { tag: 'p', text: 'Your session will expire.', style: { display: 'none' } },
    ]);
    expect(f.timing.expiry).toEqual(['p[0]', 'p[1]']);
  });
});

describe('structureInPage: skip link and top heading', () => {
  const page = (): Spec[] => [
    { tag: 'a', id: 'skip', attrs: { href: '#content' }, text: 'Skip to main content', interactive: true },
    { tag: 'nav', attrs: { 'aria-label': 'Main' }, children: [{ tag: 'a', attrs: { href: '/a' }, text: 'A', interactive: true }, { tag: 'a', attrs: { href: '/b' }, text: 'B', interactive: true }] },
    { tag: 'main', id: 'content', children: [{ tag: 'h1', text: 'Home' }, { tag: 'h2', text: 'Places' }] },
  ];
  it('counts main landmarks, top headings and the links and buttons before main', () => {
    expect(read(page()).bypass).toMatchObject({ mains: 1, h1: ['h1[0]'], controlsBeforeMain: 3 });
  });
  it('finds the skip link, says it is first, and finds its target', () => {
    expect(read(page()).bypass.skip).toEqual({ id: 'a#skip[0]', first: true, targetFound: true });
  });
  it('says the skip link is not first when another control comes before it', () => {
    expect(read([{ tag: 'button', text: 'Menu', interactive: true }, ...page()]).bypass.skip).toMatchObject({ first: false, targetFound: true });
  });
  it('says the target is missing when no element has the id, and decodes the id', () => {
    expect(read([{ tag: 'a', attrs: { href: '#nowhere' }, text: 'Skip to content', interactive: true }, { tag: 'main' }]).bypass.skip).toMatchObject({ targetFound: false });
    dom?.uninstall();
    expect(read([{ tag: 'a', attrs: { href: '#a%20b' }, text: 'Aller au contenu', interactive: true }, { tag: 'div', id: 'a b' }]).bypass.skip).toMatchObject({ targetFound: true });
  });
  it('does not take an ordinary in-page link for a skip link', () => {
    expect(read([{ tag: 'a', attrs: { href: '#top' }, text: 'Back to top', interactive: true }]).bypass.skip).toBeNull();
  });
  it('reads role main, and aria-level 1 on a role heading, and skips a hidden h1', () => {
    const f = read([{ tag: 'div', attrs: { role: 'main' } }, { tag: 'div', attrs: { role: 'heading', 'aria-level': '1' }, text: 'Top' }, { tag: 'h1', text: 'Gone', style: { display: 'none' } }]);
    expect(f.bypass).toMatchObject({ mains: 1, h1: ['div[1]'] });
  });
});

describe('structureInPage: links', () => {
  it('reads the name from text, aria-label, title or the alt of an image', () => {
    const f = read([
      { tag: 'a', attrs: { href: '/a' }, text: 'Hours' },
      { tag: 'a', attrs: { href: '/b', 'aria-label': 'Contact us' } },
      { tag: 'a', attrs: { href: '/c', title: 'Help' } },
      { tag: 'a', attrs: { href: '/d' }, children: [{ tag: 'img', attrs: { alt: 'Home page', src: 'x.png' } }] },
    ]);
    expect(f.links.map((l) => l.name)).toEqual(['Hours', 'Contact us', 'Help', 'Home page']);
  });
  it('skips an a element with no href and a hidden link', () => {
    expect(read([{ tag: 'a', text: 'Anchor' }, { tag: 'a', attrs: { href: '/x' }, text: 'Hidden', style: { display: 'none' } }]).links).toEqual([]);
  });
  it('reads target blank and whether the text or title says new tab, in both languages', () => {
    const f = read([
      { tag: 'a', attrs: { href: '/a', target: '_blank' }, text: 'Map' },
      { tag: 'a', attrs: { href: '/b', target: '_blank' }, text: 'Map (opens in a new tab)' },
      { tag: 'a', attrs: { href: '/c', target: '_blank', title: 'Nouvel onglet' }, text: 'Carte' },
      { tag: 'a', attrs: { href: '/d' }, text: 'Plain' },
    ]);
    expect(f.links.map((l) => [l.newTab, l.announcesNewTab])).toEqual([[true, false], [true, true], [true, true], [false, false]]);
  });
  it('reads a file from the extension or the download attribute, and whether the name says so', () => {
    const f = read([
      { tag: 'a', attrs: { href: '/r.PDF?x=1' }, text: 'Report' },
      { tag: 'a', attrs: { href: '/r.pdf' }, text: 'Report (PDF)' },
      { tag: 'a', attrs: { href: '/form', download: '' }, text: 'Form' },
      { tag: 'a', attrs: { href: '/s.zip' }, text: 'Télécharger les données' },
      { tag: 'a', attrs: { href: '/page' }, text: 'Page' },
    ]);
    expect(f.links.map((l) => [l.file, l.announcesFile])).toEqual([['pdf', false], ['pdf', true], ['file', false], ['zip', true], [null, false]]);
  });
  it('stops at 400 links', () => {
    const roots: Spec[] = Array.from({ length: 420 }, (_, i) => ({ tag: 'a', attrs: { href: `/${i}` }, text: `L${i}` }));
    expect(read(roots, {}, 1000).links).toHaveLength(400);
  });
});

describe('structureInPage: images', () => {
  it('reads alt, and null when there is none', () => {
    const f = read([{ tag: 'img', attrs: { alt: 'Ramp', src: 'a.png' } }, { tag: 'img', attrs: { alt: '', src: 'b.png' } }, { tag: 'img', attrs: { src: 'c.png' } }]);
    expect(f.images.map((i) => i.alt)).toEqual(['Ramp', '', null]);
  });
  it('says an image is broken only when the browser finished and found no image', () => {
    const f = read([
      { tag: 'img', attrs: { src: 'a.png' }, props: { complete: true, naturalWidth: 0 } },
      { tag: 'img', attrs: { src: 'b.png' }, props: { complete: false, naturalWidth: 0 } },
      { tag: 'img', attrs: { src: 'c.png' }, props: { complete: true, naturalWidth: 64 } },
      { tag: 'img', props: { complete: true, naturalWidth: 0 } },
    ]);
    expect(f.images.map((i) => i.broken)).toEqual([true, false, false, false]);
  });
  it('reads the text of the link around an image', () => {
    const f = read([{ tag: 'a', attrs: { href: '/x' }, text: 'Opening hours', children: [{ tag: 'img', attrs: { alt: 'Opening hours', src: 'a.png' } }] }, { tag: 'img', attrs: { alt: 'Free', src: 'b.png' } }]);
    expect(f.images.map((i) => i.linkText)).toEqual(['Opening hours', '']);
  });
  it('skips a hidden image', () => {
    expect(read([{ tag: 'img', attrs: { src: 'a.png' }, style: { display: 'none' } }]).images).toEqual([]);
  });
});

describe('structureInPage: limits', () => {
  it('stops at the element limit and says it did', () => {
    const roots: Spec[] = Array.from({ length: 10 }, () => ({ tag: 'p', text: 'x' }));
    expect(read(roots, {}, 4).truncated).toBe(true);
    dom?.uninstall();
    expect(read(roots, {}, 50).truncated).toBe(false);
  });
  it('an empty page gives the empty facts', () => {
    expect(read([])).toEqual(EMPTY_STRUCTURE);
  });
});

describe('structure facts through the checks', () => {
  it('a clean page gives no entries', () => {
    const f = read([
      { tag: 'a', attrs: { href: '#c' }, text: 'Skip to content', interactive: true },
      {
        tag: 'main',
        id: 'c',
        children: [
          { tag: 'h1', text: 'Home' },
          { tag: 'table', attrs: { 'aria-label': 'Hours' }, children: [row(cell('th', 'Day', { scope: 'col' }), cell('th', 'Hours', { scope: 'col' })), row(cell('td', 'Mon'), cell('td', '9'))] },
          { tag: 'img', attrs: { alt: 'Step-free entrance', src: 'a.png' }, props: { complete: true, naturalWidth: 10 } },
        ],
      },
    ]);
    const r = structureResults(f);
    for (const key of ['timing', 'tables', 'frames', 'bypass', 'links', 'images'] as const) expect(r[key]?.entries, key).toEqual([]);
    expect(r.tables?.checked).toBe(1);
    expect(r.images?.checked).toBe(1);
    expect(r.links?.checked).toBe(1);
  });
  it('a page with several problems gives each of them', () => {
    const f = read([
      { tag: 'marquee', text: 'News' },
      { tag: 'iframe', attrs: { title: 'frame', src: 'https://w.example.org/x' } },
      { tag: 'table', children: [row(cell('th', ''), cell('th', 'b')), row(cell('td', 'c'), cell('td', 'd'))] },
      { tag: 'a', attrs: { href: '/r.pdf', target: '_blank' }, text: 'Report' },
      { tag: 'img', attrs: { alt: 'IMG_0001.jpg', src: 'a.png' }, props: { complete: true, naturalWidth: 0 } },
    ]);
    expect(auditTiming(f.timing).entries.map((e) => e.rule)).toEqual(['marquee']);
    expect(auditFrames(f.frames).entries.map((e) => e.rule)).toEqual(['frame-title-weak']);
    expect(auditTables(f.tables).entries.map((e) => e.rule)).toEqual(['empty-header']);
    expect(auditLinks(f.links).entries.map((e) => e.rule)).toEqual(['new-tab-unannounced', 'file-unannounced']);
    expect(auditImages(f.images).entries.map((e) => e.rule)).toEqual(['broken', 'alt-filename']);
    expect(auditBypass(f.bypass).entries).toEqual([]);
  });
});

describe('the live panel runs the structure checks', () => {
  it('selfAudit reports the seven new checks for the page it runs in', () => {
    dom = installDom([
      { tag: 'marquee', text: 'News' },
      { tag: 'img', attrs: { alt: 'IMG_0001.jpg', src: 'a.png' }, props: { complete: true, naturalWidth: 0 } },
      { tag: 'a', attrs: { href: '/r.pdf' }, text: 'Report' },
    ]);
    const route = selfAudit(new Date('2026-11-15T20:00:00Z')).routes[0];
    const ids = route?.checks.map((c) => c.check) ?? [];
    for (const id of ['timing', 'purpose', 'tables', 'frames', 'bypass', 'links', 'images']) expect(ids, id).toContain(id);
    const rules = (route?.entries ?? []).map((e) => `${e.check}/${e.rule}`);
    expect(rules).toContain('timing/marquee');
    expect(rules).toContain('images/broken');
    expect(rules).toContain('images/alt-filename');
    expect(rules).toContain('links/file-unannounced');
  });
});
