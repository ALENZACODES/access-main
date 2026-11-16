import type { AuditPage } from './run.js';
import type { CheckResult, Entry, Rect } from './types.js';

/**
 * Keyboard traversal audit. The page is driven with real Tab key presses, and
 * after each press the focused control is compared with how it looked before
 * focus, so a control that shows no change is reported (2.4.7). Repeated
 * focus on one control is reported as a trap (2.1.2).
 */

export interface FocusableSig {
  readonly id: string;
  /** Computed look of the control and its ::before and ::after. */
  readonly sig: string;
  /** Computed look of its parent. */
  readonly ctx: string;
  readonly tabbable: boolean;
}

export interface FocusSample {
  /** Position in the focusable list, or -1 when not in it. */
  readonly index: number;
  readonly id: string;
  readonly sig: string;
  readonly ctx: string;
  readonly rect: Rect;
  /** Focus is on the body or nowhere, so it left the controls of the page. */
  readonly leftPage: boolean;
}

export interface KeyboardProbe {
  readonly baseline: readonly FocusableSig[];
  readonly steps: readonly FocusSample[];
  /** True when the walk ended because it reached the step limit. */
  readonly capped: boolean;
}

export interface KeyboardPage extends AuditPage {
  readonly keyboard: { press(key: string): Promise<unknown> };
}

interface Cs {
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  outlineOffset: string;
  boxShadow: string;
  borderTopColor: string;
  borderTopWidth: string;
  backgroundColor: string;
  color: string;
  textDecorationLine: string;
  content?: string;
}

/** Runs in the page. Looks of every control in the selector list, before focus. */
export function focusSigsInPage(args: { readonly selector: string }): FocusableSig[] {
  interface El {
    id: string;
    tagName: string;
    tabIndex: number;
    parentElement: El | null;
    getAttribute(n: string): string | null;
    getBoundingClientRect(): { width: number; height: number };
  }
  const g = globalThis as unknown as {
    document: { querySelectorAll(s: string): ArrayLike<El> };
    getComputedStyle(e: El, pseudo?: string): Cs;
  };
  const sigOf = (e: El): string => {
    const parts: string[] = [];
    for (const pseudo of [undefined, '::before', '::after']) {
      const c = g.getComputedStyle(e, pseudo);
      parts.push(
        [
          // An outline that is not drawn counts as none, whatever its offset or colour.
          c.outlineStyle === 'none' || c.outlineWidth === '0px' ? 'none' : `${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor} ${c.outlineOffset}`,
          c.boxShadow,
          c.borderTopColor,
          c.borderTopWidth,
          c.backgroundColor,
          c.color,
          c.textDecorationLine,
          pseudo ? (c.content ?? '') : '',
        ].join(','),
      );
    }
    return parts.join('|');
  };
  const out: FocusableSig[] = [];
  const found = g.document.querySelectorAll(args.selector);
  for (let i = 0; i < found.length; i++) {
    const el = found[i];
    if (!el) continue;
    const r = el.getBoundingClientRect();
    out.push({
      id: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${i}]`,
      sig: sigOf(el),
      ctx: el.parentElement ? sigOf(el.parentElement) : '',
      tabbable: el.tabIndex >= 0 && el.getAttribute('disabled') === null && r.width > 0 && r.height > 0,
    });
  }
  return out;
}

/** Runs in the page. Describes the element that has focus right now. */
export function readFocusInPage(args: { readonly selector: string }): FocusSample {
  interface El {
    id: string;
    tagName: string;
    parentElement: El | null;
    getBoundingClientRect(): { left: number; top: number; right: number; bottom: number };
  }
  const g = globalThis as unknown as {
    document: { activeElement: El | null; body: El | null; querySelectorAll(s: string): ArrayLike<El> };
    getComputedStyle(e: El, pseudo?: string): Cs;
  };
  const sigOf = (e: El): string => {
    const parts: string[] = [];
    for (const pseudo of [undefined, '::before', '::after']) {
      const c = g.getComputedStyle(e, pseudo);
      parts.push(
        [
          // An outline that is not drawn counts as none, whatever its offset or colour.
          c.outlineStyle === 'none' || c.outlineWidth === '0px' ? 'none' : `${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor} ${c.outlineOffset}`,
          c.boxShadow,
          c.borderTopColor,
          c.borderTopWidth,
          c.backgroundColor,
          c.color,
          c.textDecorationLine,
          pseudo ? (c.content ?? '') : '',
        ].join(','),
      );
    }
    return parts.join('|');
  };
  const a = g.document.activeElement;
  const empty = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!a || a === g.document.body || a.tagName.toLowerCase() === 'html') {
    return { index: -1, id: 'body', sig: '', ctx: '', rect: empty, leftPage: true };
  }
  const found = g.document.querySelectorAll(args.selector);
  let index = -1;
  for (let i = 0; i < found.length; i++) {
    if (found[i] === a) {
      index = i;
      break;
    }
  }
  const r = a.getBoundingClientRect();
  return {
    index,
    id: index >= 0 ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}[${index}]` : `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}`,
    sig: sigOf(a),
    ctx: a.parentElement ? sigOf(a.parentElement) : '',
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
    leftPage: false,
  };
}

/**
 * Runs in the page. Takes focus off whatever has it, scrolls to the top, and
 * moves the browser's Tab starting point to the top of the page. Without that,
 * the next Tab press continues from the last control that had focus.
 */
export function resetFocusInPage(_arg: null): void {
  void _arg;
  interface Body {
    getAttribute(n: string): string | null;
    setAttribute(n: string, v: string): void;
    removeAttribute(n: string): void;
    focus?(): void;
    blur?(): void;
  }
  const g = globalThis as unknown as {
    document: { activeElement: { blur?(): void } | null; body?: Body | null };
    scrollTo?(x: number, y: number): void;
  };
  g.document.activeElement?.blur?.();
  const body = g.document.body;
  if (body && body.setAttribute && body.focus) {
    const had = body.getAttribute('tabindex');
    body.setAttribute('tabindex', '-1');
    body.focus();
    body.blur?.();
    if (had === null) body.removeAttribute('tabindex');
    else body.setAttribute('tabindex', had);
  }
  g.scrollTo?.(0, 0);
}

/** Presses Tab up to max times and records where focus goes. */
export async function probeKeyboard(page: KeyboardPage, selector: string, max: number): Promise<KeyboardProbe> {
  // Earlier probes may have left a control focused, which would hide its focus style from the baseline.
  await page.evaluate(resetFocusInPage, null);
  const baseline = await page.evaluate(focusSigsInPage, { selector });
  await page.evaluate(resetFocusInPage, null);
  const steps: FocusSample[] = [];
  let capped = true;
  for (let n = 0; n < max; n++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(readFocusInPage, { selector });
    steps.push(s);
    const first = steps[0];
    if (s.leftPage || (n > 0 && first && s.index >= 0 && s.index === first.index)) {
      capped = false;
      break;
    }
  }
  await page.evaluate(resetFocusInPage, null);
  return { baseline, steps, capped };
}

const BACKWARD_JUMP_PX = 120;

export function auditKeyboard(probe: KeyboardProbe): { readonly keyboard: CheckResult; readonly focusVisible: CheckResult } {
  const keyboard: Entry[] = [];
  const visible: Entry[] = [];
  const tabbable = probe.baseline.filter((b) => b.tabbable);
  const reached = new Set<number>();
  const checkedVisible = new Set<number>();
  let run = 0;
  let prev: FocusSample | null = null;
  for (const s of probe.steps) {
    if (prev && s.index >= 0 && s.index === prev.index) run++;
    else run = 1;
    if (run === 3 && s.index >= 0) {
      keyboard.push({
        check: 'keyboard',
        id: s.id,
        status: 'fail',
        rule: 'trap',
        message: {
          en: 'Focus stayed on this control after three Tab presses.',
          fr: 'Le focus est resté sur ce contrôle après trois appuis sur Tab.',
        },
      });
    }
    if (s.index >= 0) {
      reached.add(s.index);
      const base = probe.baseline[s.index];
      if (base && !checkedVisible.has(s.index)) {
        checkedVisible.add(s.index);
        if (base.sig === s.sig && base.ctx === s.ctx) {
          visible.push({
            check: 'focus-visible',
            id: s.id,
            status: 'fail',
            rule: 'no-indicator',
            message: {
              en: 'No visible change was detected on this control or its parent when it received focus.',
              fr: 'Aucun changement visible n’a été détecté sur ce contrôle ni sur son parent lorsqu’il a reçu le focus.',
            },
          });
        }
      }
      if (prev && prev.index >= 0 && prev.index !== s.index && s.rect.top < prev.rect.top - BACKWARD_JUMP_PX) {
        keyboard.push({
          check: 'keyboard',
          id: s.id,
          status: 'unknown',
          rule: 'order',
          message: {
            en: 'Focus moved up the page from the previous control. Check that the order makes sense.',
            fr: 'Le focus est remonté dans la page par rapport au contrôle précédent. Assurez-vous que l’ordre est logique.',
          },
        });
      }
    }
    prev = s;
  }
  if (!probe.capped) {
    probe.baseline.forEach((b, i) => {
      if (b.tabbable && !reached.has(i)) {
        keyboard.push({
          check: 'keyboard',
          id: b.id,
          status: 'unknown',
          rule: 'unreached',
          message: {
            en: 'Tab did not reach this control. Check that it can be reached another way.',
            fr: 'Tab n’a pas atteint ce contrôle. Assurez-vous qu’il est accessible autrement.',
          },
        });
      }
    });
  }
  return {
    keyboard: { checked: tabbable.length, entries: keyboard },
    focusVisible: { checked: checkedVisible.size, entries: visible },
  };
}
