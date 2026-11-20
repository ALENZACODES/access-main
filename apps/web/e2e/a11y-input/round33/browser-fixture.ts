/** Browser-only read model; never changes the application's DOM. */
import type { Page } from '@playwright/test';
export interface FocusObservation {
  readonly id: string;
  readonly visible: boolean;
  readonly indicator: boolean;
  readonly occluded: boolean;
  readonly targetWidth: number;
  readonly targetHeight: number;
}
export interface LiveObservation {
  readonly id: string;
  readonly role: string;
  readonly live: string;
  readonly atomic: boolean;
  readonly hidden: boolean;
  readonly busy: boolean;
  readonly messageChanged: boolean;
  readonly content: string;
}
export interface AccessibleObservation {
  readonly id: string;
  readonly role: string;
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly focusable: boolean;
  readonly tabIndex: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly labelledBy: readonly string[];
  readonly describedBy: readonly string[];
  readonly targetId?: string;
}
const CONTROL = [
  'button', 'a[href]', 'input:not([type="hidden"])', 'textarea', 'select',
  'summary', '[role="button"]', '[role="switch"]', '[role="radio"]',
  '[role="tab"]', '[role="option"]', '[role="menuitem"]',
].join(',');
/** Snapshot actual rendered controls, not element copy or private values. */
export async function inspectControls(page: Page): Promise<AccessibleObservation[]> {
  return page.evaluate((selector) => {
    const all = Array.from(document.querySelectorAll<HTMLElement>(selector));
    return all.map((element, index) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const tag = element.localName;
      const role = element.getAttribute('role') ??
        (tag === 'a' ? 'link' : tag === 'input' ? 'textbox' : tag);
      const enabled = !(element as HTMLButtonElement).disabled && element.getAttribute('aria-disabled') !== 'true';
      const visible = box.width > 0 && box.height > 0 && style.display !== 'none' &&
        style.visibility !== 'hidden' && !element.closest('[hidden],[inert],[aria-hidden="true"]');
      const focusable = element.tabIndex >= 0;
      return {
        id: element.id || `control-${index}`,
        role,
        enabled,
        visible,
        focusable,
        tabIndex: element.tabIndex,
        targetWidth: box.width,
        targetHeight: box.height,
        labelledBy: (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean),
        describedBy: (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean),
        targetId: element.getAttribute('aria-controls') ?? undefined,
      };
    });
  }, CONTROL);
}
/** Snapshot a focused target after a real keyboard event. */
export async function observeActive(page: Page): Promise<FocusObservation | null> {
  return page.evaluate(() => {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement) || node === document.body || node === document.documentElement) return null;
    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const centerX = Math.min(innerWidth - 1, Math.max(0, box.left + box.width / 2));
    const centerY = Math.min(innerHeight - 1, Math.max(0, box.top + box.height / 2));
    const hit = document.elementFromPoint(centerX, centerY);
    const indicator = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 ||
      style.boxShadow !== 'none' || style.textDecorationLine.includes('underline');
    const visible = box.width > 0 && box.height > 0 && style.visibility !== 'hidden' &&
      style.display !== 'none' && box.top < innerHeight && box.left < innerWidth &&
      box.right > 0 && box.bottom > 0;
    return {
      id: node.id || 'unidentified-focus',
      visible,
      indicator,
      occluded: Boolean(hit && hit !== node && !node.contains(hit) && !hit.contains(node)),
      targetWidth: box.width,
      targetHeight: box.height,
    };
  });
}
/** Observe the native Tab sequence without synthetic focusing of each control. */
export async function walkTabs(page: Page, count: number): Promise<FocusObservation[]> {
  if (!Number.isSafeInteger(count) || count < 0 || count > 500) throw new TypeError('invalid tab count');
  const visits: FocusObservation[] = [];
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press('Tab');
    const item = await observeActive(page);
    if (item) visits.push(item);
  }
  return visits;
}
/** Observe reverse keyboard order, starting from the currently focused control. */
export async function walkReverse(page: Page, count: number): Promise<FocusObservation[]> {
  if (!Number.isSafeInteger(count) || count < 0 || count > 500) throw new TypeError('invalid reverse count');
  const visits: FocusObservation[] = [];
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press('Shift+Tab');
    const item = await observeActive(page);
    if (item) visits.push(item);
  }
  return visits;
}
/** Inspect roles and ARIA settings, never speech rendered by an assistive device. */
export async function inspectLive(page: Page): Promise<LiveObservation[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(
    '[role="status"],[role="alert"],[role="log"],[role="timer"],[role="progressbar"],[aria-live]',
  )).map((element, index) => {
    const style = getComputedStyle(element);
    return {
      id: element.id || `live-${index}`,
      role: element.getAttribute('role') ?? 'status',
      live: element.getAttribute('aria-live') ?? (element.getAttribute('role') === 'alert' ? 'assertive' : 'polite'),
      atomic: element.getAttribute('aria-atomic') === 'true',
      hidden: style.visibility === 'hidden' || style.display === 'none' ||
        element.closest('[hidden],[aria-hidden="true"],[inert]') !== null,
      busy: element.getAttribute('aria-busy') === 'true',
      messageChanged: false,
      content: element.textContent?.trim().slice(0, 3000) ?? '',
    };
  }));
}
/** Native modal focus may temporarily park on the dialog or body. */
export async function modalFocusContained(page: Page, dialogId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const modal = document.getElementById(id);
    if (!(modal instanceof HTMLDialogElement) || !modal.open) return false;
    const focused = document.activeElement;
    return focused === modal || focused === document.body || modal.contains(focused);
  }, dialogId);
}
/** Return structural relationships, not spoken text or personal values. */
export async function inspectIdRelationships(page: Page): Promise<{ duplicate: string[]; missing: string[] }> {
  return page.evaluate(() => {
    const ids = new Map<string, number>();
    const missing: string[] = [];
    const selectors = Array.from(document.querySelectorAll<HTMLElement>('[id]'));
    for (const element of selectors) ids.set(element.id, (ids.get(element.id) ?? 0) + 1);
    const attributes = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant'];
    for (const element of document.querySelectorAll<HTMLElement>('*')) {
      for (const attr of attributes) {
        for (const id of (element.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) {
          if (!ids.has(id)) missing.push(`${attr}:${id}`);
        }
      }
    }
    return { duplicate: [...ids].filter(([, count]) => count > 1).map(([id]) => id).sort(), missing: missing.sort() };
  });
}
