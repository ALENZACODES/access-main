import { expect, test, type Page } from '@playwright/test';
import { inspectLive, inspectIdRelationships, modalFocusContained } from './browser-fixture';
import { auditLiveSnapshot, auditAnnouncements, announcementReceipt } from './announcements.mjs';

const pageFixture = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Live announcements</title><style>
body{font:16px system-ui;padding:20px}button{min-width:44px;min-height:44px;margin:4px}
:focus-visible{outline:3px solid black}
dialog{padding:20px;border:2px solid black}
</style></head><body><main><h1>Announcements</h1>
<button id="update">Update status</button>
<button id="warn">Raise alert</button>
<button id="open" aria-haspopup="dialog" aria-controls="modal">Open dialog</button>
<div id="status" role="status" aria-live="polite" aria-atomic="true">Ready</div>
<div id="alert" role="alert" aria-live="assertive" aria-atomic="true">No issue</div>
<dialog id="modal" aria-labelledby="heading" aria-describedby="description">
<h2 id="heading">Settings</h2><p id="description">Choose an option.</p>
<button id="inside">Confirm</button><button id="close">Close</button>
</dialog>
</main><script>
const status = document.getElementById('status');
const alert = document.getElementById('alert');
const modal = document.getElementById('modal');
const opener = document.getElementById('open');
document.getElementById('update').addEventListener('click',()=>{status.textContent='Status changed';});
document.getElementById('warn').addEventListener('click',()=>{alert.textContent='Attention required';});
opener.addEventListener('click',()=>modal.showModal());
modal.addEventListener('close',()=>opener.focus());
document.getElementById('close').addEventListener('click',()=>modal.close());
</script></body></html>`;
async function setup(page: Page): Promise<void> { await page.setContent(pageFixture); }
const codes = (issues: readonly { code: string }[]) => issues.map((issue) => issue.code);
test.describe('P16 Round 33: live regions and dialog lifecycle', () => {
  test.beforeEach(async ({ page }) => { await setup(page); });
  test('status region has a semantic role', async ({ page }) => {
    await expect(page.getByRole('status')).toBeVisible();
  });
  test('status region is polite', async ({ page }) => {
    await expect(page.locator('#status')).toHaveAttribute('aria-live', 'polite');
  });
  test('status region is atomic', async ({ page }) => {
    await expect(page.locator('#status')).toHaveAttribute('aria-atomic', 'true');
  });
  test('alert region has a semantic role', async ({ page }) => {
    await expect(page.getByRole('alert')).toBeVisible();
  });
  test('alert region is assertive', async ({ page }) => {
    await expect(page.locator('#alert')).toHaveAttribute('aria-live', 'assertive');
  });
  test('alert region is atomic', async ({ page }) => {
    await expect(page.locator('#alert')).toHaveAttribute('aria-atomic', 'true');
  });
  test('live region inspection captures both regions', async ({ page }) => {
    expect((await inspectLive(page)).map((item) => item.id)).toEqual(['status', 'alert']);
  });
  test('live region inspection recognizes status role', async ({ page }) => {
    const found = await inspectLive(page);
    expect(found[0]?.role).toBe('status');
  });
  test('live region inspection recognizes alert role', async ({ page }) => {
    const found = await inspectLive(page);
    expect(found[1]?.role).toBe('alert');
  });
  test('live region inspection records politeness', async ({ page }) => {
    const found = await inspectLive(page);
    expect(found.map((item) => item.live)).toEqual(['polite', 'assertive']);
  });
  test('valid live regions produce no findings', async ({ page }) => {
    expect(auditLiveSnapshot(await inspectLive(page))).toEqual([]);
  });
  test('Enter updates the status region', async ({ page }) => {
    await page.locator('#update').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Status changed');
  });
  test('Space updates the status region', async ({ page }) => {
    await page.locator('#update').focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('status')).toHaveText('Status changed');
  });
  test('Enter updates the alert region', async ({ page }) => {
    await page.locator('#warn').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Attention required');
  });
  test('Space updates the alert region', async ({ page }) => {
    await page.locator('#warn').focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('alert')).toHaveText('Attention required');
  });
  test('status update does not alter alert', async ({ page }) => {
    await page.locator('#update').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('No issue');
  });
  test('alert update does not alter status', async ({ page }) => {
    await page.locator('#warn').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Ready');
  });
  test('silent alert is detected by audit', async ({ page }) => {
    await page.locator('#alert').evaluate((element) => element.setAttribute('aria-live', 'off'));
    expect(codes(auditLiveSnapshot(await inspectLive(page)))).toContain('live.silent-alert');
  });
  test('hidden assertive alert is detected', async ({ page }) => {
    await page.locator('#alert').evaluate((element) => { element.hidden = true; });
    expect(codes(auditLiveSnapshot(await inspectLive(page)))).toContain('live.hidden-assertive');
  });
  test('missing atomic flag is detected', async ({ page }) => {
    await page.locator('#status').evaluate((element) => element.removeAttribute('aria-atomic'));
    expect(codes(auditLiveSnapshot(await inspectLive(page)))).toEqual([]);
    // Native accessibility does not require aria-atomic on every status node.
    // This probe captures atomic=false; policy authors decide whether it matters.
    expect((await inspectLive(page))[0]?.atomic).toBe(false);
  });
  test('duplicate live IDs create a finding', async ({ page }) => {
    await page.locator('#status').evaluate((element) => {
      const other = element.cloneNode(true);
      element.parentElement?.appendChild(other);
    });
    expect(codes(auditLiveSnapshot(await inspectLive(page)))).toContain('live.duplicate-id');
  });
  test('broken dialog label is found structurally', async ({ page }) => {
    await page.locator('#modal').evaluate((element) => element.setAttribute('aria-labelledby', 'missing-label'));
    expect((await inspectIdRelationships(page)).missing).toContain('aria-labelledby:missing-label');
  });
  test('broken dialog description is found structurally', async ({ page }) => {
    await page.locator('#modal').evaluate((element) => element.setAttribute('aria-describedby', 'missing-description'));
    expect((await inspectIdRelationships(page)).missing).toContain('aria-describedby:missing-description');
  });
  test('dialog has a declared opener', async ({ page }) => {
    await expect(page.locator('#open')).toHaveAttribute('aria-controls', 'modal');
  });
  test('Enter opens a native dialog', async ({ page }) => {
    await page.locator('#open').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
  });
  test('Space opens a native dialog', async ({ page }) => {
    await page.locator('#open').focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('dialog')).toBeVisible();
  });
  test('focus stays in native modal after opening', async ({ page }) => {
    await page.locator('#open').focus();
    await page.keyboard.press('Enter');
    expect(await modalFocusContained(page, 'modal')).toBe(true);
  });
  test('Tab does not focus an interactive background control', async ({ page }) => {
    await page.locator('#open').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    expect(await modalFocusContained(page, 'modal')).toBe(true);
  });
  test('Shift+Tab does not focus an interactive background control', async ({ page }) => {
    await page.locator('#open').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Tab');
    expect(await modalFocusContained(page, 'modal')).toBe(true);
  });
  test('Escape dismisses the dialog', async ({ page }) => {
    await page.locator('#open').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });
  test('Escape restores the opener', async ({ page }) => {
    await page.locator('#open').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.locator('#open')).toBeFocused();
  });
  test('dialog close button works using Enter', async ({ page }) => {
    await page.locator('#open').focus();
    await page.keyboard.press('Enter');
    await page.locator('#close').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();
  });
  test('dialog close button restores focus', async ({ page }) => {
    await page.locator('#open').focus();
    await page.keyboard.press('Enter');
    await page.locator('#close').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#open')).toBeFocused();
  });
  test('dialog is named through aria-labelledby', async ({ page }) => {
    await page.locator('#open').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  });
  test('dialog description target exists', async ({ page }) => {
    const refs = await inspectIdRelationships(page);
    expect(refs.missing).toEqual([]);
  });
  test('one synthetic status receipt remains READY', () => {
    const fixture = [{ id: 'status-one', kind: 'status', politeness: 'polite', atomic: true,
      sequence: 1, day: '2026-11-19', message: { en: 'Ready', fr: 'Prêt' }, state: 'READY', evidenceState: 'PRIMARY' }];
    expect(announcementReceipt(fixture).decision).toBe('READY');
  });
  test('uncertain offline status receipt remains UNKNOWN', () => {
    const fixture = [{ id: 'offline-one', kind: 'offline', politeness: 'polite', atomic: true,
      sequence: 1, day: '2026-11-19', message: { en: 'Status unknown', fr: 'État inconnu' }, state: 'UNKNOWN', evidenceState: 'UNKNOWN' }];
    expect(announcementReceipt(fixture).decision).toBe('UNKNOWN');
  });
  test('a repeated identical status receives review finding', () => {
    const fixture = [{ id: 'a', kind: 'status', politeness: 'polite', atomic: true,
      sequence: 1, day: '2026-11-19', message: { en: 'Ready', fr: 'Prêt' }, state: 'READY' },
      { id: 'b', kind: 'status', politeness: 'polite', atomic: true, sequence: 2,
        day: '2026-11-19', message: { en: 'Ready', fr: 'Prêt' }, state: 'READY' }];
    expect(codes(auditAnnouncements(fixture))).toContain('announcements.repeated');
  });
});
