import { expect, test } from '@playwright/test';
import { chooseLanguage, visit, VIEWPORTS, type Language } from '../a11y-input/helpers.ts';

for(const language of ['en','fr'] as const satisfies readonly Language[]){
  for(const viewport of VIEWPORTS){
    test(`question packet ${language} at ${viewport.name} CSS pixels`,async({page})=>{
      await page.setViewportSize({width:viewport.width,height:viewport.height});
      await chooseLanguage(page,language);
      await visit(page,'/question-packet',language);
      const heading=language==='en'?'Accessibility questions packet':'Fiche de questions sur l’accessibilité';
      await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
      const add=page.getByRole('button',{name:language==='en'?'Add stop':'Ajouter une étape'});
      await expect(add).toBeVisible();
      const box=await add.boundingBox();expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
      await add.click();
      await expect(page.getByRole('button',{name:language==='en'?'Save':'Enregistrer'})).toBeVisible();
      await expect(page.getByText(language==='en'?'UNKNOWN means no supported conclusion. A recorded answer is not a guarantee of accessibility, eligibility or safety.':'UNKNOWN signifie qu’aucune conclusion n’est étayée. Une réponse consignée ne garantit ni l’accessibilité, ni l’admissibilité, ni la sécurité.')).toBeVisible();
    });
  }
}
