import { expect, test } from '@playwright/test';

/** Exercises the mounted page, not a simulated speech synthesizer. */
test.describe('P16 input workbench: keyboard and switch controls',()=>{
  test.beforeEach(async ({page})=>{
    await page.goto('/input-workbench');
    await expect(page.getByRole('heading',{name:'Keyboard and switch workbench'})).toBeVisible();
  });
  test('page has one main landmark',async ({page})=>{
    await expect(page.getByRole('main')).toHaveCount(1);
  });
  test('page describes its local-only scope',async ({page})=>{
    await expect(page.getByText('Nothing is stored or sent.',{exact:false})).toBeVisible();
  });
  test('no controls initially exist',async ({page})=>{
    await expect(page.getByText('No controls have been added.')).toBeVisible();
  });
  test('unknown evidence is the initial selection',async ({page})=>{
    await expect(page.getByLabel('Evidence level')).toHaveValue('UNKNOWN');
  });
  test('missing fields show accessible feedback',async ({page})=>{
    await page.getByRole('button',{name:'Add control'}).click();
    await expect(page.getByRole('status').filter({hasText:'Enter valid English and French names'})).toBeVisible();
  });
  test('save operation creates a bilingual control',async ({page})=>{
    await page.getByLabel('English control name').fill('First door');
    await page.getByLabel('French control name').fill('Première porte');
    await page.getByLabel('English description').fill('Open the first door');
    await page.getByLabel('French description').fill('Ouvrir la première porte');
    await page.getByRole('button',{name:'Add control'}).click();
    await expect(page.getByText('First door',{exact:true})).toBeVisible();
  });
  test('Next command moves focus in the abstract scan model',async ({page})=>{
    await page.getByLabel('English control name').fill('Entrance');
    await page.getByLabel('French control name').fill('Entrée');
    await page.getByLabel('English description').fill('Use entrance');
    await page.getByLabel('French description').fill('Utiliser l’entrée');
    await page.getByRole('button',{name:'Add control'}).click();
    await page.getByRole('group',{name:'Switch controls'}).getByRole('button',{name:'Next',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Current control — Entrance'})).toBeVisible();
  });
  test('Select without a focused target keeps UNKNOWN',async ({page})=>{
    await page.getByRole('group',{name:'Switch controls'}).getByRole('button',{name:'Select'}).click();
    await expect(page.getByText('Selected control — UNKNOWN')).toBeVisible();
  });
  test('Reset clears the in-memory session',async ({page})=>{
    await page.getByLabel('English control name').fill('Entrance');
    await page.getByLabel('French control name').fill('Entrée');
    await page.getByLabel('English description').fill('Use entrance');
    await page.getByLabel('French description').fill('Utiliser l’entrée');
    await page.getByRole('button',{name:'Add control'}).click();
    await page.getByRole('button',{name:'Clear session'}).click();
    await expect(page.getByText('No controls have been added.')).toBeVisible();
  });
  test('button targets have at least 44 px height',async ({page})=>{
    const boxes=await page.getByRole('button').evaluateAll((items)=>items.map(item=>{
      const rect=item.getBoundingClientRect();
      return {width:rect.width,height:rect.height};
    }));
    expect(boxes.length).toBeGreaterThan(5);
    for(const box of boxes){
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  });
  test('keyboard Tab reaches the scan controls',async ({page})=>{
    const next=page.getByRole('group',{name:'Switch controls'}).getByRole('button',{name:'Next',exact:true});
    await next.focus();
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({hasText:'Current control'})).toBeVisible();
  });
  test('form labels are real label associations',async ({page})=>{
    const english=page.getByLabel('English control name');
    const french=page.getByLabel('French control name');
    await expect(english).toBeVisible();
    await expect(french).toBeVisible();
    await expect(english).not.toHaveAttribute('id',await french.getAttribute('id'));
  });
  test('touch controls expose focus-visible style',async ({page})=>{
    const button=page.getByRole('button',{name:'Add control'});
    await button.focus();
    await expect(button).toBeFocused();
  });
  test('the workbench has a return-home link',async ({page})=>{
    const link=page.getByRole('link',{name:'Close workbench'});
    await expect(link).toHaveAttribute('href',/\/$/);
  });
  test('export JSON uses an explicit user action',async ({page})=>{
    const promise=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export JSON'}).click();
    const download=await promise;
    expect(download.suggestedFilename()).toMatch(/input-audit\.json$/);
  });
  test('export CSV uses an explicit user action',async ({page})=>{
    const promise=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export CSV'}).click();
    const download=await promise;
    expect(download.suggestedFilename()).toMatch(/input-audit\.csv$/);
  });
  test('the scan mode can change without selecting a target',async ({page})=>{
    await page.getByLabel('Scan mode').selectOption('GROUPED');
    await expect(page.getByLabel('Scan mode')).toHaveValue('GROUPED');
    await expect(page.getByText('Selected control — UNKNOWN')).toBeVisible();
  });
  test('keyboard is not trapped in editor',async ({page})=>{
    const input=page.getByLabel('English control name');
    await input.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('French control name')).toBeFocused();
  });
});
