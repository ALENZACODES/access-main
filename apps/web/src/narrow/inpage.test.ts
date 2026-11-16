import { afterEach, describe, expect, it } from 'vitest';
import { INTERACTIVE_SELECTOR } from './page.js';
import {
  focusProbeInPage,
  snapshotInPage,
  textSpacingProbeInPage,
  TEXT_SPACING_CSS,
  type Snapshot,
} from './inpage.js';
import { installDom, type Installed, type Spec } from './testkit.js';

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});

const snap = (roots: Spec[], opts = {}): Snapshot => {
  dom = installDom(roots, opts);
  return snapshotInPage({ selector: INTERACTIVE_SELECTOR, maxElements: 100 });
};

describe('snapshotInPage', () => {
  it('records names, text, rects and document facts', () => {
    const s = snap(
      [
        { tag: 'button', id: 'save', text: 'Save', interactive: true, attrs: { 'aria-label': 'Save draft' }, rect: [0, 0, 50, 44] },
        { tag: 'input', interactive: true, attrs: { type: 'text' }, labels: ['Email'] },
        { tag: 'img', interactive: true, attrs: { alt: 'Logo' } },
        { tag: 'button', interactive: true, attrs: { disabled: '' } },
        { tag: 'button', interactive: true, rect: [0, 0, 0, 0] },
        { tag: 'a', interactive: true, style: { display: 'none' } },
      ],
      { lang: 'fr', manifest: true, scrollWidth: 400, innerWidth: 360 },
    );
    expect(s.interactive.map((e) => [e.id, e.name, e.text])).toEqual([
      ['button#save[0]', 'Save draft', 'Save'],
      ['input[1]', 'Email', ''],
      ['img[2]', 'Logo', ''],
    ]);
    expect(s.unmeasured).toBe(2);
    expect(s.doc).toEqual({ lang: 'fr', innerWidth: 360, scrollWidth: 400, clientWidth: 320, hasManifest: true });
    expect(s.truncated).toBe(false);
  });

  it('resolves names from aria-labelledby and button input values', () => {
    const s = snap([
      { tag: 'span', id: 'lbl', text: 'Search the map' },
      { tag: 'button', interactive: true, attrs: { 'aria-labelledby': 'lbl' } },
      { tag: 'input', interactive: true, attrs: { type: 'submit', value: 'Go' } },
    ]);
    expect(s.interactive.map((e) => e.name)).toEqual(['Search the map', 'Go']);
  });

  it('collects text with the background layers up to the first opaque one', () => {
    const s = snap([
      {
        tag: 'div',
        style: { backgroundColor: 'rgb(255, 255, 255)', backgroundImage: 'none' },
        children: [
          {
            tag: 'p',
            text: ' Hello ',
            style: { color: 'rgb(119, 119, 119)', backgroundColor: 'rgba(0, 0, 0, 0)', fontWeight: 'bold', fontSize: '20px' },
          },
          { tag: 'p', text: 'Hidden', style: { display: 'none' } },
          { tag: 'script', text: 'var x' },
        ],
      },
    ]);
    expect(s.texts).toHaveLength(1);
    expect(s.texts[0]).toMatchObject({
      text: 'Hello',
      fg: 'rgb(119, 119, 119)',
      bgLayers: ['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)'],
      bgImage: false,
      fontSizePx: 20,
      fontWeight: 700,
    });
  });

  it('flags background images', () => {
    const s = snap([{ tag: 'p', text: 'On photo', style: { backgroundImage: 'url(a.png)' } }]);
    expect(s.texts[0]?.bgImage).toBe(true);
  });

  it('marks truncation at the element cap', () => {
    dom = installDom([{ tag: 'a', interactive: true }, { tag: 'a', interactive: true }, { tag: 'a', interactive: true }]);
    const s = snapshotInPage({ selector: INTERACTIVE_SELECTOR, maxElements: 2 });
    expect(s.truncated).toBe(true);
    expect(s.interactive).toHaveLength(2);
  });
});

describe('focusProbeInPage', () => {
  const header: Spec = {
    tag: 'header',
    style: { position: 'fixed' },
    rect: [0, 0, 320, 60],
    children: [{ tag: 'a', interactive: true, rect: [0, 0, 50, 44] }],
  };

  it('records covers, skips containing headers, and restores focus and scroll', () => {
    dom = installDom([
      header,
      { tag: 'button', interactive: true, rect: [10, 10, 60, 50] },
      { tag: 'button', interactive: true, rect: [10, 100, 60, 150] },
      { tag: 'button', interactive: true, rect: [10, 200, 60, 250], noFocus: true },
    ]);
    const prev = dom.all.find((e) => e.spec.tag === 'button' && e.spec.rect?.[1] === 100);
    prev?.focus();
    const probes = focusProbeInPage({ selector: INTERACTIVE_SELECTOR, max: 10 });
    expect(probes.map((p) => p.focused)).toEqual([true, true, true, false]);
    expect(probes[0]?.covers).toEqual([]);
    expect(probes[1]?.covers).toEqual([{ left: 0, top: 0, right: 320, bottom: 60 }]);
    expect(dom.world.active).toBe(prev);
    expect(dom.world.scrollTo).toEqual([[0, 40]]);
  });

  it('honours the max count', () => {
    dom = installDom([{ tag: 'a', interactive: true }, { tag: 'a', interactive: true }]);
    expect(focusProbeInPage({ selector: INTERACTIVE_SELECTOR, max: 1 })).toHaveLength(1);
  });
});

describe('textSpacingProbeInPage', () => {
  it('reports only elements clipped by the spacing style and removes the style', () => {
    dom = installDom([
      {
        tag: 'div',
        text: 'Already clipped',
        style: { overflowY: 'hidden' },
        scroll: { sw: 100, cw: 100, sh: 60, ch: 20 },
      },
      {
        tag: 'div',
        text: 'Clipped by spacing',
        style: { overflowY: 'hidden' },
        scroll: { sw: 100, cw: 100, sh: 20, ch: 20 },
        scrollAfter: { sw: 100, cw: 100, sh: 40, ch: 20 },
      },
      { tag: 'div', text: 'Fine', style: { overflowY: 'hidden' } },
    ]);
    const res = textSpacingProbeInPage({ css: TEXT_SPACING_CSS, maxElements: 100 });
    expect(res.checked).toBe(3);
    expect(res.newlyClipped.map((c) => c.id)).toEqual(['div[1]']);
    expect(dom.world.styleElements).toBe(0);
    expect(dom.world.spacingOn).toBe(false);
  });
});
