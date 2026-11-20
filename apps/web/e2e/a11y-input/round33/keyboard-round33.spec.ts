import { expect, test, type Page } from '@playwright/test';
import { inspectControls, observeActive, walkTabs, walkReverse, inspectIdRelationships } from './browser-fixture';
import { auditFocusWalk, auditReverseWalk } from './switch.mjs';

const documentFixture = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><title>Keyboard journey</title>
<style>
body{font:16px system-ui;margin:0;padding:20px}
button,input,select,textarea,a{min-width:44px;min-height:44px;margin:4px}
:focus-visible{outline:3px solid #111;outline-offset:3px}
</style></head><body><main>
<h1>Keyboard journey</h1>
<button id="first">First action</button>
<button id="second">Second action</button>
<a id="third" href="#destination">Third action</a>
<section id="destination"><h2>Destination</h2></section>
</main></body></html>`;
const roleName = (id: string) => ({ en: id, fr: id });
const controlRecord = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, role: id === 'third' ? 'link' : 'button', name: roleName(id),
  enabled: true, visible: true, focusable: true, tabIndex: 0,
  targetWidth: 44, targetHeight: 44, ...overrides,
});
const routeModel = (overrides: Record<string, unknown> = {}) => ({
  id: 'keyboard-route', title: roleName('Keyboard'),
  controls: [controlRecord('first'), controlRecord('second'), controlRecord('third')],
  state: 'UNKNOWN', ...overrides,
});
const codes = (items: readonly { code: string }[]) => items.map((item) => item.code);
async function prepare(page: Page): Promise<void> {
  await page.setContent(documentFixture);
  await page.locator('body').evaluate((element) => {
    const prior = element.getAttribute('tabindex');
    element.setAttribute('tabindex', '-1');
    element.focus();
    if (prior === null) element.removeAttribute('tabindex');
    else element.setAttribute('tabindex', prior);
  });
}
test.describe('P16 Round 33: native keyboard journey', () => {
  test.beforeEach(async ({ page }) => { await prepare(page); });
  test('first Tab focuses the first button', async ({ page }) => {
    await page.keyboard.press('Tab');
    await expect(page.locator('#first')).toBeFocused();
  });
  test('second Tab focuses the second button', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator('#second')).toBeFocused();
  });
  test('third Tab reaches the link', async ({ page }) => {
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab');
    await expect(page.locator('#third')).toBeFocused();
  });
  test('reverse Tab reaches the previous control', async ({ page }) => {
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#second')).toBeFocused();
  });
  test('reverse Tab from second reaches first', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#first')).toBeFocused();
  });
  test('sequential Tab observations follow authored order', async ({ page }) => {
    const observations = await walkTabs(page, 3);
    expect(observations.map((item) => item.id)).toEqual(['first', 'second', 'third']);
  });
  test('reverse observations follow preceding order', async ({ page }) => {
    const forward = await walkTabs(page, 3);
    const backward = await walkReverse(page, 2);
    expect(auditReverseWalk(forward, backward)).toEqual([]);
  });
  test('visible focus indicator is detected after Tab', async ({ page }) => {
    await page.keyboard.press('Tab');
    const active = await observeActive(page);
    expect(active?.indicator).toBe(true);
  });
  test('focused control has visible geometry', async ({ page }) => {
    await page.keyboard.press('Tab');
    const active = await observeActive(page);
    expect(active?.visible).toBe(true);
    expect(active?.targetWidth).toBeGreaterThanOrEqual(44);
  });
  test('no overlay obscures focused target', async ({ page }) => {
    await page.keyboard.press('Tab');
    expect((await observeActive(page))?.occluded).toBe(false);
  });
  test('focus observation is null when body is focused', async ({ page }) => {
    expect(await observeActive(page)).toBeNull();
  });
  test('inspector returns semantic button roles', async ({ page }) => {
    const controls = await inspectControls(page);
    expect(controls.slice(0, 2).map((item) => item.role)).toEqual(['button', 'button']);
  });
  test('inspector returns semantic link role', async ({ page }) => {
    const controls = await inspectControls(page);
    expect(controls[2]?.role).toBe('link');
  });
  test('inspector enumerates all three controls', async ({ page }) => {
    expect(await inspectControls(page)).toHaveLength(3);
  });
  test('inspector preserves stable IDs', async ({ page }) => {
    expect((await inspectControls(page)).map((item) => item.id)).toEqual(['first', 'second', 'third']);
  });
  test('inspector sees enabled targets', async ({ page }) => {
    expect((await inspectControls(page)).every((item) => item.enabled)).toBe(true);
  });
  test('inspector sees visible targets', async ({ page }) => {
    expect((await inspectControls(page)).every((item) => item.visible)).toBe(true);
  });
  test('invalid walk observations produce missing-item findings', async ({ page }) => {
    const model = routeModel();
    const observed = await walkTabs(page, 2);
    expect(codes(auditFocusWalk(model, observed))).toContain('walk.missing');
  });
  test('complete native walk meets focus model', async ({ page }) => {
    const observations = await walkTabs(page, 3);
    expect(auditFocusWalk(routeModel(), observations)).toEqual([]);
  });
  test('changing Tab order produces detectable issue', async ({ page }) => {
    await page.locator('#third').evaluate((element) => element.setAttribute('tabindex', '0'));
    const observations = await walkTabs(page, 3);
    const reordered = routeModel({ controls: [controlRecord('third'), controlRecord('second'), controlRecord('first')] });
    expect(codes(auditFocusWalk(reordered, observations))).toContain('walk.order');
  });
  test('duplicate DOM IDs are reported', async ({ page }) => {
    await page.locator('main').evaluate((element) => {
      const extra = document.createElement('button');
      extra.id = 'first';
      extra.textContent = 'Duplicate control';
      element.appendChild(extra);
    });
    expect((await inspectIdRelationships(page)).duplicate).toContain('first');
  });
  test('a dangling labelledby reference is reported', async ({ page }) => {
    await page.locator('#second').evaluate((element) => element.setAttribute('aria-labelledby', 'missing-label'));
    expect((await inspectIdRelationships(page)).missing).toContain('aria-labelledby:missing-label');
  });
  test('a dangling description reference is reported', async ({ page }) => {
    await page.locator('#second').evaluate((element) => element.setAttribute('aria-describedby', 'missing-description'));
    expect((await inspectIdRelationships(page)).missing).toContain('aria-describedby:missing-description');
  });
  test('a dangling controls reference is reported', async ({ page }) => {
    await page.locator('#second').evaluate((element) => element.setAttribute('aria-controls', 'missing-dialog'));
    expect((await inspectIdRelationships(page)).missing).toContain('aria-controls:missing-dialog');
  });
  test('a real labelledby reference resolves cleanly', async ({ page }) => {
    await page.locator('#second').evaluate((element) => element.setAttribute('aria-labelledby', 'destination'));
    expect((await inspectIdRelationships(page)).missing).toEqual([]);
  });
  test('a real description reference resolves cleanly', async ({ page }) => {
    await page.locator('#second').evaluate((element) => element.setAttribute('aria-describedby', 'destination'));
    expect((await inspectIdRelationships(page)).missing).toEqual([]);
  });
  test('disable removes a button from native Tab traversal', async ({ page }) => {
    await page.locator('#second').evaluate((element) => (element as HTMLButtonElement).disabled = true);
    const observations = await walkTabs(page, 2);
    expect(observations.map((item) => item.id)).toEqual(['first', 'third']);
  });
  test('hidden button is excluded from sequential Tab', async ({ page }) => {
    await page.locator('#second').evaluate((element) => (element.hidden = true));
    const observations = await walkTabs(page, 2);
    expect(observations.map((item) => item.id)).toEqual(['first', 'third']);
  });
  test('inert ancestor excludes its control from Tab', async ({ page }) => {
    await page.locator('#second').evaluate((element) => {
      const wrapper = document.createElement('section');
      wrapper.inert = true;
      element.replaceWith(wrapper);
      wrapper.appendChild(element);
    });
    const observations = await walkTabs(page, 2);
    expect(observations.map((item) => item.id)).toEqual(['first', 'third']);
  });
  test('Enter activates a native button', async ({ page }) => {
    await page.locator('#first').evaluate((element) => {
      element.addEventListener('click', () => element.setAttribute('data-activated', 'yes'));
    });
    await page.locator('#first').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#first')).toHaveAttribute('data-activated', 'yes');
  });
  test('Space activates a native button', async ({ page }) => {
    await page.locator('#first').evaluate((element) => {
      element.addEventListener('click', () => element.setAttribute('data-activated', 'yes'));
    });
    await page.locator('#first').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#first')).toHaveAttribute('data-activated', 'yes');
  });
  test('disabled button cannot activate by Enter', async ({ page }) => {
    await page.locator('#first').evaluate((element) => {
      (element as HTMLButtonElement).disabled = true;
      element.addEventListener('click', () => element.setAttribute('data-activated', 'yes'));
    });
    await page.keyboard.press('Enter');
    await expect(page.locator('#first')).not.toHaveAttribute('data-activated', 'yes');
  });
  test('size guards reject unbounded Tab walks', async ({ page }) => {
    await expect(walkTabs(page, 501)).rejects.toThrow('invalid tab count');
  });
  test('size guards reject unbounded reverse walks', async ({ page }) => {
    await expect(walkReverse(page, 501)).rejects.toThrow('invalid reverse count');
  });
});
