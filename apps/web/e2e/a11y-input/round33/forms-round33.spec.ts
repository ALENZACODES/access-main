import { expect, test, type Page } from '@playwright/test';
import { inspectControls, inspectIdRelationships, inspectLive, observeActive } from './browser-fixture';
import { auditLiveSnapshot } from './announcements.mjs';

const fixture = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Accessible input</title><style>
body{font:16px system-ui;padding:20px}button,input,select,textarea{margin:8px;min-height:44px;min-width:44px}
:focus-visible{outline:3px solid black;outline-offset:3px}
</style></head><body><main><h1>Accessible input</h1>
<form id="form" novalidate>
<label id="label-name" for="name">Your name</label>
<input id="name" name="name" required aria-describedby="hint-name">
<p id="hint-name">Enter a name to continue.</p>
<label id="label-topic" for="topic">Topic</label>
<select id="topic" name="topic"><option value="a">Access</option><option value="b">Maps</option></select>
<label id="label-note" for="note">Notes</label>
<textarea id="note" name="note"></textarea>
<label for="consent">I agree</label><input id="consent" name="consent" type="checkbox">
<button id="submit" type="submit">Save locally</button>
<button id="reset" type="reset">Reset</button>
</form>
<p id="errors" role="alert" aria-live="assertive" aria-atomic="true">No errors</p>
<p id="status" role="status" aria-live="polite" aria-atomic="true">Ready</p>
</main><script>
const form=document.getElementById('form');
form.addEventListener('submit',(event)=>{
 event.preventDefault();
 const name=document.getElementById('name');
 if(!name.value.trim()){
  name.setAttribute('aria-invalid','true');
  document.getElementById('errors').textContent='Name is required';
  document.getElementById('status').textContent='Needs attention';
 }else{
  name.removeAttribute('aria-invalid');
  document.getElementById('errors').textContent='No errors';
  document.getElementById('status').textContent='Saved locally';
 }
});
form.addEventListener('reset',()=>{
 document.getElementById('name').removeAttribute('aria-invalid');
 document.getElementById('errors').textContent='No errors';
 document.getElementById('status').textContent='Ready';
});
</script></body></html>`;
async function setup(page: Page): Promise<void> { await page.setContent(fixture); }
const codes = (findings: readonly { code: string }[]) => findings.map((entry) => entry.code);
test.describe('P16 Round 33: accessible forms and status feedback', () => {
  test.beforeEach(async ({ page }) => { await setup(page); });
  test('form is exposed as a native form', async ({ page }) => {
    await expect(page.locator('form')).toHaveCount(1);
  });
  test('name field has an accessible label', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: 'Your name' })).toBeVisible();
  });
  test('topic control has an accessible label', async ({ page }) => {
    await expect(page.getByRole('combobox', { name: 'Topic' })).toBeVisible();
  });
  test('notes field has an accessible label', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: 'Notes' })).toBeVisible();
  });
  test('checkbox has an accessible label', async ({ page }) => {
    await expect(page.getByRole('checkbox', { name: 'I agree' })).toBeVisible();
  });
  test('name field description reference resolves', async ({ page }) => {
    expect((await inspectIdRelationships(page)).missing).toEqual([]);
  });
  test('name field is required', async ({ page }) => {
    await expect(page.locator('#name')).toHaveAttribute('required', '');
  });
  test('blank form submission announces required name', async ({ page }) => {
    await page.locator('#submit').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Name is required');
  });
  test('blank form submission sets aria-invalid', async ({ page }) => {
    await page.locator('#submit').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#name')).toHaveAttribute('aria-invalid', 'true');
  });
  test('blank form submission marks status as needing attention', async ({ page }) => {
    await page.locator('#submit').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Needs attention');
  });
  test('valid form submission gives status feedback', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Your name' }).fill('Example');
    await page.locator('#submit').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Saved locally');
  });
  test('valid form submission clears errors', async ({ page }) => {
    await page.locator('#name').fill('Example');
    await page.locator('#submit').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('No errors');
  });
  test('valid form submission clears aria-invalid', async ({ page }) => {
    await page.locator('#submit').focus();
    await page.keyboard.press('Enter');
    await page.locator('#name').fill('Example');
    await page.keyboard.press('Enter');
    await expect(page.locator('#name')).not.toHaveAttribute('aria-invalid', 'true');
  });
  test('reset returns feedback to ready', async ({ page }) => {
    await page.locator('#submit').focus();
    await page.keyboard.press('Enter');
    await page.locator('#reset').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Ready');
  });
  test('reset clears error summary', async ({ page }) => {
    await page.locator('#submit').focus();
    await page.keyboard.press('Enter');
    await page.locator('#reset').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('No errors');
  });
  test('reset clears invalid state', async ({ page }) => {
    await page.locator('#submit').focus();
    await page.keyboard.press('Enter');
    await page.locator('#reset').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#name')).not.toHaveAttribute('aria-invalid', 'true');
  });
  test('Space toggles a native checkbox on', async ({ page }) => {
    await page.locator('#consent').focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox')).toBeChecked();
  });
  test('Space toggles a native checkbox off', async ({ page }) => {
    await page.locator('#consent').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox')).not.toBeChecked();
  });
  test('ArrowDown changes native select option', async ({ page }) => {
    await page.locator('#topic').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#topic')).toHaveValue('b');
  });
  test('form target has a visible focus indicator', async ({ page }) => {
    await page.locator('#name').focus();
    expect((await observeActive(page))?.indicator).toBe(true);
  });
  test('submit target meets minimum size', async ({ page }) => {
    await page.locator('#submit').focus();
    const active = await observeActive(page);
    expect(active?.targetHeight).toBeGreaterThanOrEqual(44);
    expect(active?.targetWidth).toBeGreaterThanOrEqual(44);
  });
  test('reset target meets minimum size', async ({ page }) => {
    await page.locator('#reset').focus();
    const active = await observeActive(page);
    expect(active?.targetHeight).toBeGreaterThanOrEqual(44);
  });
  test('live-region inspector observes error and status', async ({ page }) => {
    expect((await inspectLive(page)).map((entry) => entry.id)).toEqual(['errors', 'status']);
  });
  test('live-region inspector distinguishes alert and status', async ({ page }) => {
    expect((await inspectLive(page)).map((entry) => entry.role)).toEqual(['alert', 'status']);
  });
  test('live-region inspector detects assertive errors', async ({ page }) => {
    expect((await inspectLive(page))[0]?.live).toBe('assertive');
  });
  test('live-region inspector detects polite status', async ({ page }) => {
    expect((await inspectLive(page))[1]?.live).toBe('polite');
  });
  test('live-region audit is clean for valid status elements', async ({ page }) => {
    expect(auditLiveSnapshot(await inspectLive(page))).toEqual([]);
  });
  test('invalid aria-live value is detected', async ({ page }) => {
    await page.locator('#status').evaluate((element) => element.setAttribute('aria-live', 'unknown'));
    expect(codes(auditLiveSnapshot(await inspectLive(page)))).toContain('live.politeness');
  });
  test('status hidden with assertive priority is detected', async ({ page }) => {
    await page.locator('#status').evaluate((element) => {
      element.setAttribute('aria-live', 'assertive'); element.hidden = true;
    });
    expect(codes(auditLiveSnapshot(await inspectLive(page)))).toContain('live.hidden-assertive');
  });
  test('broken description reference is detected', async ({ page }) => {
    await page.locator('#name').evaluate((element) => element.setAttribute('aria-describedby', 'not-present'));
    expect((await inspectIdRelationships(page)).missing).toContain('aria-describedby:not-present');
  });
  test('duplicate error ID is detected', async ({ page }) => {
    await page.locator('#errors').evaluate((element) => {
      const duplicate = element.cloneNode(true);
      element.parentElement?.appendChild(duplicate);
    });
    expect((await inspectIdRelationships(page)).duplicate).toContain('errors');
  });
  test('all form controls are represented in the inspection', async ({ page }) => {
    const ids = (await inspectControls(page)).map((entry) => entry.id);
    expect(ids).toEqual(['name', 'topic', 'note', 'consent', 'submit', 'reset']);
  });
  test('form submission never navigates to a new page', async ({ page }) => {
    await page.locator('#name').fill('Example');
    const before = page.url();
    await page.locator('#submit').focus();
    await page.keyboard.press('Enter');
    expect(page.url()).toBe(before);
  });
});
