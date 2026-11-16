import { afterEach, describe, expect, it } from 'vitest';
import {
  auditKeyboard,
  focusSigsInPage,
  probeKeyboard,
  readFocusInPage,
  resetFocusInPage,
  type FocusSample,
  type KeyboardPage,
  type KeyboardProbe,
} from './keyboard.js';
import { INTERACTIVE_SELECTOR } from './page.js';
import { auditMotion, motionProbeInPage, PROFILES, selectProfiles } from './profiles.js';
import { installDom, tabNext, type Installed, type Spec } from './testkit.js';

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});

const OUTLINE = { outlineStyle: 'solid', outlineWidth: '3px', outlineColor: 'rgb(0, 95, 204)' };
const btn = (id: string, extra: Partial<Spec> = {}): Spec => ({ tag: 'button', id, text: id, interactive: true, focusStyle: OUTLINE, ...extra });

function tabbingPage(): KeyboardPage {
  return {
    async setViewportSize() {},
    async goto() {},
    async reload() {},
    async evaluate(fn, arg) {
      return fn(arg);
    },
    keyboard: {
      async press(key: string) {
        if (key === 'Tab' && dom) tabNext(dom);
      },
    },
  };
}

const probe = async (specs: Spec[], max = 20): Promise<KeyboardProbe> => {
  dom = installDom(specs);
  return probeKeyboard(tabbingPage(), INTERACTIVE_SELECTOR, max);
};

describe('in-page helpers', () => {
  it('focusSigsInPage reports looks, tabbability and parent look', () => {
    dom = installDom([
      btn('a'),
      btn('b', { attrs: { tabindex: '-1' } }),
      btn('c', { attrs: { disabled: '' } }),
      btn('d', { rect: [0, 0, 0, 0] }),
    ]);
    const sigs = focusSigsInPage({ selector: INTERACTIVE_SELECTOR });
    expect(sigs.map((s) => [s.id, s.tabbable])).toEqual([
      ['button#a[0]', true],
      ['button#b[1]', false],
      ['button#c[2]', false],
      ['button#d[3]', false],
    ]);
    expect(sigs[0]?.sig.split('|')).toHaveLength(3);
  });

  it('readFocusInPage describes the focused control or says focus left the page', () => {
    dom = installDom([btn('a', { rect: [0, 10, 50, 40] })]);
    expect(readFocusInPage({ selector: INTERACTIVE_SELECTOR }).leftPage).toBe(true);
    dom.all[0]?.focus();
    const s = readFocusInPage({ selector: INTERACTIVE_SELECTOR });
    expect(s).toMatchObject({ index: 0, id: 'button#a[0]', leftPage: false, rect: { top: 10, bottom: 40 } });
    expect(s.sig).toContain('solid');
  });

  it('resetFocusInPage removes focus and scrolls to the top', () => {
    dom = installDom([btn('a')]);
    dom.all[0]?.focus();
    resetFocusInPage(null);
    expect(dom.world.active).toBeNull();
    expect(dom.world.scrollTo).toEqual([[0, 0]]);
  });
});

describe('probeKeyboard and auditKeyboard', () => {
  it('walks every control and reports nothing for a clean page', async () => {
    const p = await probe([btn('a'), btn('b'), btn('c')]);
    expect(p.steps.map((s) => s.id)).toEqual(['button#a[0]', 'button#b[1]', 'button#c[2]', 'body']);
    expect(p.capped).toBe(false);
    const res = auditKeyboard(p);
    expect(res.keyboard).toEqual({ checked: 3, entries: [] });
    expect(res.focusVisible).toEqual({ checked: 3, entries: [] });
  });

  it('fails a control that shows no change when it gets focus', async () => {
    const res = auditKeyboard(await probe([btn('a'), { tag: 'a', id: 'plain', text: 'Plain', interactive: true }]));
    expect(res.focusVisible.entries.map((e) => [e.id, e.status, e.rule])).toEqual([['a#plain[1]', 'fail', 'no-indicator']]);
  });

  it('accepts an indicator on the parent or on ::after', async () => {
    const parent: Spec = { tag: 'li', focusWithinStyle: { backgroundColor: 'rgb(255, 255, 0)' }, children: [{ tag: 'a', id: 'p', interactive: true }] };
    const after: Spec = { tag: 'a', id: 'x', interactive: true, afterFocusStyle: { content: '""', outlineStyle: 'solid' } };
    const res = auditKeyboard(await probe([parent, after]));
    expect(res.focusVisible.entries).toEqual([]);
    expect(res.focusVisible.checked).toBe(2);
  });

  it('fails a control that keeps focus through three Tab presses', async () => {
    const res = auditKeyboard(await probe([btn('a'), btn('trap', { attrs: { 'data-trap': '' } }), btn('c')], 6));
    expect(res.keyboard.entries.map((e) => [e.id, e.status, e.rule])).toEqual([['button#trap[1]', 'fail', 'trap']]);
  });

  it('says a control Tab never reached is unknown, and keeps quiet when the walk was capped', async () => {
    const specs = [btn('a'), btn('hidden-from-tab', { noFocus: true }), btn('c')];
    const full = auditKeyboard(await probe(specs));
    expect(full.keyboard.entries.map((e) => [e.id, e.status, e.rule])).toEqual([['button#hidden-from-tab[1]', 'unknown', 'unreached']]);
    dom?.uninstall();
    const capped = await probe(specs, 1);
    expect(capped.capped).toBe(true);
    expect(auditKeyboard(capped).keyboard.entries).toEqual([]);
  });

  it('stops when Tab comes back to the first control', async () => {
    const wrap: KeyboardPage = { ...tabbingPage() };
    let n = 0;
    dom = installDom([btn('a'), btn('b')]);
    const wrapped: KeyboardPage = {
      ...wrap,
      keyboard: {
        async press() {
          n++;
          if (dom) tabNext(dom);
          if (n === 3 && dom) dom.world.active = dom.all[0] ?? null;
        },
      },
    };
    const p = await probeKeyboard(wrapped, INTERACTIVE_SELECTOR, 20);
    expect(p.steps.map((s) => s.index)).toEqual([0, 1, 0]);
    expect(p.capped).toBe(false);
  });

  it('marks a focus move up the page as unknown', async () => {
    const res = auditKeyboard(await probe([btn('low', { rect: [0, 600, 50, 640] }), btn('high', { rect: [0, 0, 50, 40] })]));
    expect(res.keyboard.entries.map((e) => [e.id, e.status, e.rule])).toEqual([['button#high[1]', 'unknown', 'order']]);
  });

  it('works on hand-made probes', () => {
    const rect = { left: 0, top: 0, right: 1, bottom: 1 };
    const step = (index: number): FocusSample => ({ index, id: `x${index}`, sig: 's', ctx: 'c', rect, leftPage: false });
    const res = auditKeyboard({
      baseline: [{ id: 'x0', sig: 's', ctx: 'c', tabbable: true }],
      steps: [step(0), step(0), step(0)],
      capped: true,
    });
    expect(res.keyboard.entries.map((e) => e.rule)).toEqual(['trap']);
    expect(res.focusVisible.entries.map((e) => e.rule)).toEqual(['no-indicator']);
  });
});

describe('profiles', () => {
  it('has the narrow profile first, and unique ids', () => {
    expect(PROFILES[0]?.id).toBe('narrow');
    expect(PROFILES[0]?.viewport.width).toBe(320);
    expect(new Set(PROFILES.map((p) => p.id)).size).toBe(PROFILES.length);
    expect(PROFILES.find((p) => p.id === 'forced-colors')?.skipContrast).toBe(true);
  });
  it('selects all, a list, or nothing for an unknown id', () => {
    expect(selectProfiles('all')).toHaveLength(PROFILES.length);
    expect(selectProfiles('narrow, dark')?.map((p) => p.id)).toEqual(['narrow', 'dark']);
    expect(selectProfiles('narrow,zoom')).toBeNull();
    expect(selectProfiles('')).toBeNull();
  });
  it('gives each profile an English and a French label', () => {
    for (const p of PROFILES) {
      expect(p.label.en.length).toBeGreaterThan(0);
      expect(p.label.fr.length).toBeGreaterThan(0);
    }
  });
});

describe('motion', () => {
  it('counts running animations in the page', () => {
    dom = installDom([], { animations: [{ iterations: Infinity, target: 'spin' }, { iterations: 1 }] });
    expect(motionProbeInPage(null)).toEqual({ running: 2, infinite: 1, ids: ['div#spin'] });
  });
  it('is zero when the page has no animations', () => {
    dom = installDom([]);
    expect(motionProbeInPage(null)).toEqual({ running: 0, infinite: 0, ids: [] });
  });
  it('fails animations that run under reduced motion', () => {
    const res = auditMotion({ running: 2, infinite: 0, ids: ['div#a'] }, true);
    expect(res.entries.map((e) => [e.status, e.rule])).toEqual([['fail', 'reduced-motion']]);
    expect(auditMotion({ running: 0, infinite: 0, ids: [] }, true).entries).toEqual([]);
  });
  it('only asks for a look at endless animations otherwise', () => {
    expect(auditMotion({ running: 2, infinite: 1, ids: [] }, false).entries.map((e) => [e.status, e.rule])).toEqual([['unknown', 'endless']]);
    expect(auditMotion({ running: 2, infinite: 0, ids: [] }, false).entries).toEqual([]);
  });
});
