import { expect, test, type Page } from '@playwright/test';
import { inspectControls, observeActive } from './browser-fixture';
import { scanTargets, replayScan, auditSwitchSelection } from './switch.mjs';

const content = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Switch alternatives</title><style>
body{font:16px system-ui;padding:20px}button{min-height:44px;min-width:44px}
:focus-visible{outline:3px solid black}
#drop-target{border:2px solid black;padding:12px}
</style></head><body><main><h1>Switch alternatives</h1>
<div role="group" aria-label="Choices" id="choices">
<button id="one" type="button">One</button>
<button id="two" type="button">Two</button>
<button id="three" type="button">Three</button>
</div>
<div id="drop-target" tabindex="-1">Drop target</div>
<button id="move" type="button" aria-controls="drop-target" data-a11y-drag-alternative="true">Move selected</button>
<button id="cancel" type="button">Cancel</button>
<div id="status" role="status" aria-live="polite" aria-atomic="true"></div>
</main><script>
let selected = null;
for(const id of ['one','two','three']) {
 document.getElementById(id).addEventListener('click',()=>{
 selected = id; document.getElementById('status').textContent='Selected '+id;
 });
}
document.getElementById('move').addEventListener('click',()=>{
 if(selected)document.getElementById('drop-target').textContent='Moved '+selected;
});
document.getElementById('cancel').addEventListener('click',()=>{
 selected = null;document.getElementById('status').textContent='Cancelled';
});
</script></body></html>`;
function model() {
  const values = ['one', 'two', 'three', 'move', 'cancel'];
  return { id: 'switch-route', title: { en: 'Switch options', fr: 'Options du contacteur' },
    controls: values.map((id) => ({ id, role: 'button', name: { en: id, fr: id },
      enabled: true, visible: true, focusable: true, tabIndex: 0,
      targetWidth: 44, targetHeight: 44, group: id === 'move' || id === 'cancel' ? 'actions' : 'choices' })),
    state: 'UNKNOWN' };
}
async function setup(page: Page): Promise<void> {
  await page.setContent(content);
}
test.describe('P16 Round 33: switch navigation and keyboard alternatives', () => {
  test.beforeEach(async ({ page }) => { await setup(page); });
  test('all five native controls are keyboard focusable', async ({ page }) => {
    const list = await inspectControls(page);
    expect(list.filter((item) => item.focusable && item.visible)).toHaveLength(5);
  });
  test('choices have visible names', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'One' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Two' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Three' })).toBeVisible();
  });
  test('choice group is available by role', async ({ page }) => {
    await expect(page.getByRole('group', { name: 'Choices' })).toBeVisible();
  });
  test('switch alternative is declared explicitly', async ({ page }) => {
    await expect(page.locator('#move')).toHaveAttribute('data-a11y-drag-alternative', 'true');
  });
  test('switch alternative refers to a real target', async ({ page }) => {
    await expect(page.locator('#move')).toHaveAttribute('aria-controls', 'drop-target');
    await expect(page.locator('#drop-target')).toBeVisible();
  });
  test('Enter selects the first choice', async ({ page }) => {
    await page.locator('#one').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Selected one');
  });
  test('Space selects the second choice', async ({ page }) => {
    await page.locator('#two').focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('status')).toHaveText('Selected two');
  });
  test('Enter selects the third choice', async ({ page }) => {
    await page.locator('#three').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Selected three');
  });
  test('move action works with Enter rather than drag', async ({ page }) => {
    await page.locator('#one').focus();
    await page.keyboard.press('Enter');
    await page.locator('#move').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#drop-target')).toHaveText('Moved one');
  });
  test('move action works with Space rather than drag', async ({ page }) => {
    await page.locator('#two').focus();
    await page.keyboard.press('Space');
    await page.locator('#move').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#drop-target')).toHaveText('Moved two');
  });
  test('move without a selection does not invent an action', async ({ page }) => {
    await page.locator('#move').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#drop-target')).toHaveText('Drop target');
  });
  test('cancel clears a prior selection', async ({ page }) => {
    await page.locator('#one').focus();
    await page.keyboard.press('Enter');
    await page.locator('#cancel').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Cancelled');
  });
  test('cancel prevents subsequent move without reselecting', async ({ page }) => {
    await page.locator('#one').focus();
    await page.keyboard.press('Enter');
    await page.locator('#cancel').focus();
    await page.keyboard.press('Enter');
    await page.locator('#move').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#drop-target')).toHaveText('Drop target');
  });
  test('Tab moves from choices into move alternative', async ({ page }) => {
    await page.locator('#three').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#move')).toBeFocused();
  });
  test('Shift+Tab returns from move alternative to choices', async ({ page }) => {
    await page.locator('#move').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#three')).toBeFocused();
  });
  test('move action has a visible focus indicator', async ({ page }) => {
    await page.locator('#move').focus();
    const focus = await observeActive(page);
    expect(focus?.indicator).toBe(true);
  });
  test('cancel has a visible focus indicator', async ({ page }) => {
    await page.locator('#cancel').focus();
    const focus = await observeActive(page);
    expect(focus?.indicator).toBe(true);
  });
  test('switch targets preserve authored choice order', () => {
    expect(scanTargets(model()).map((item) => item.id)).toEqual(['one', 'two', 'three', 'move', 'cancel']);
  });
  test('group targets combine choices and commands', () => {
    expect(scanTargets(model(), { mode: 'GROUP' }).map((item) => item.id)).toEqual(['choices', 'actions']);
  });
  test('switch selection matches a real focus target', () => {
    const result = replayScan(model(), ['NEXT', 'SELECT']);
    expect(result.selected).toBe('two');
    expect(auditSwitchSelection(model(), result)).toEqual([]);
  });
  test('switch group selection matches declared group', () => {
    const result = replayScan(model(), ['SELECT'], { mode: 'GROUP' });
    expect(result.selected).toBe('choices');
    expect(auditSwitchSelection(model(), result)).toEqual([]);
  });
  test('switch cancellation does not retain a selection', () => {
    const result = replayScan(model(), ['SELECT', 'CANCEL']);
    expect(result.selected).toBeNull();
  });
  test('switch scanner reverses to previous target', () => {
    const result = replayScan(model(), ['NEXT', 'NEXT', 'PREVIOUS']);
    expect(result.targets[result.index]?.id).toBe('two');
  });
  test('switch scanner wraps at the boundary', () => {
    const result = replayScan(model(), ['PREVIOUS']);
    expect(result.targets[result.index]?.id).toBe('cancel');
  });
  test('switch scanner does not silently upgrade unknown evidence', () => {
    const result = replayScan(model(), ['SELECT']);
    expect(model().state).toBe('UNKNOWN');
    expect(result.selected).toBe('one');
  });
  test('a disabled choice is excluded from target inspection', async ({ page }) => {
    await page.locator('#two').evaluate((element) => { (element as HTMLButtonElement).disabled = true; });
    const inspected = await inspectControls(page);
    expect(inspected.find((item) => item.id === 'two')?.enabled).toBe(false);
  });
  test('a hidden choice is excluded from target inspection', async ({ page }) => {
    await page.locator('#two').evaluate((element) => { element.hidden = true; });
    const inspected = await inspectControls(page);
    expect(inspected.find((item) => item.id === 'two')?.visible).toBe(false);
  });
  test('removed alternative remains detectable in the DOM', async ({ page }) => {
    await page.locator('#move').evaluate((element) => element.remove());
    expect((await inspectControls(page)).some((item) => item.id === 'move')).toBe(false);
  });
});
