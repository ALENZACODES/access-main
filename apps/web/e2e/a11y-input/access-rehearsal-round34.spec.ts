import { expect, test } from '@playwright/test';

/** Live regression checks for the mounted, device-local rehearsal. */
test.describe('P16 device-local access rehearsal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/access-rehearsal', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Access rehearsal', level: 1 })).toBeVisible();
  });

  test('the page has one primary heading and a main landmark', async ({ page }) => {
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  test('new visits never claim location evidence', async ({ page }) => {
    await expect(page.getByText('No steps yet.')).toBeVisible();
    await expect(page.getByLabel('Information status')).toHaveValue('unknown');
    await expect(page.getByText('Nothing is sent or automatically saved.')).toBeVisible();
  });

  test('required bilingual fields expose validation feedback', async ({ page }) => {
    await page.getByRole('button', { name: 'Add step' }).click();
    await expect(page.getByRole('alert')).toContainText('Review the indicated fields.');
    await expect(page.getByLabel('Step name in English')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Step name in French')).toHaveAttribute('aria-invalid', 'true');
  });

  test('adding a bilingual step preserves UNKNOWN without a source', async ({ page }) => {
    await page.getByLabel('Step name in English').fill('Main entrance');
    await page.getByLabel('Step name in French').fill('Entrée principale');
    await page.getByLabel('Details in English').fill('Ask about the doorway');
    await page.getByLabel('Details in French').fill('Demander des renseignements sur la porte');
    await page.getByRole('button', { name: 'Add step' }).click();
    await expect(page.getByText('Main entrance').first()).toBeVisible();
    await expect(page.getByLabel('Information status')).toHaveValue('unknown');
  });

  test('keyboard switch controls are at least 44 by 44 pixels', async ({ page }) => {
    const labels = ['Previous', 'Next', 'Select', 'Cancel', 'Reset'];
    for (const label of labels) {
      const control = page.getByRole('button', { name: label, exact: true }).last();
      const box = await control.boundingBox();
      expect(box, `${label} has a rendered target`).not.toBeNull();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('form controls remain in the keyboard Tab sequence', async ({ page }) => {
    const label = page.getByLabel('Journey name');
    await label.focus();
    await expect(label).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Step name in English')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(label).toBeFocused();
  });

  test('switch Next is enabled after a new step is added', async ({ page }) => {
    await page.getByLabel('Step name in English').fill('Exit');
    await page.getByLabel('Step name in French').fill('Sortie');
    await page.getByLabel('Details in English').fill('Check the door');
    await page.getByLabel('Details in French').fill('Examiner la porte');
    await page.getByRole('button', { name: 'Add step' }).click();
    const next = page.getByRole('button', { name: 'Next', exact: true });
    await expect(next).toBeEnabled();
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Exit' }).first()).toBeVisible();
  });

  test('Cancel clears the active scan target', async ({ page }) => {
    await page.getByLabel('Step name in English').fill('Exit');
    await page.getByLabel('Step name in French').fill('Sortie');
    await page.getByLabel('Details in English').fill('Check the door');
    await page.getByLabel('Details in French').fill('Examiner la porte');
    await page.getByRole('button', { name: 'Add step' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
    await expect(page.getByText('No step selected').first()).toBeVisible();
  });

  test('the user can request a local CSV report', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export diagnostic CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('access-rehearsal-local-rehearsal-en.csv');
  });

  test('the user can request a local JSON report', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export diagnostic JSON' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('access-rehearsal-local-rehearsal-en.json');
  });

  test('repeated screen visits start without saved journey steps', async ({ page }) => {
    await page.getByLabel('Step name in English').fill('Exit');
    await page.getByLabel('Step name in French').fill('Sortie');
    await page.getByLabel('Details in English').fill('Check the door');
    await page.getByLabel('Details in French').fill('Examiner la porte');
    await page.getByRole('button', { name: 'Add step' }).click();
    await page.reload();
    await expect(page.getByText('No steps yet.')).toBeVisible();
  });
});

test('Home page offers a keyboard-accessible entry to the rehearsal', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const link = page.getByRole('link', { name: /Access rehearsal/i });
  await expect(link).toBeVisible();
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/access-rehearsal/);
});
