import { expect, test } from "@playwright/test";
import { fixture, expectFocus, assertContainedFocus } from "./harness";

async function modal(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page, `<button id="open" aria-haspopup="dialog" aria-controls="settings">Open settings</button>
  <button id="background">Background action</button>
  <dialog id="settings" aria-labelledby="dialog-title">
    <h2 id="dialog-title">Settings</h2>
    <label for="name">Name</label><input id="name">
    <button id="save">Save</button><button id="close">Close</button>
  </dialog>
  <p id="result" role="status" aria-live="polite">Idle</p>
  <script>
    const opener=document.querySelector('#open'),dialog=document.querySelector('#settings');
    opener.addEventListener('click',()=>dialog.showModal());
    dialog.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const fields=[...dialog.querySelectorAll('input,button')];
      const first=fields[0],last=fields[fields.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    document.querySelector('#close').addEventListener('click',()=>dialog.close());
    document.querySelector('#save').addEventListener('click',()=>{document.querySelector('#result').textContent='Saved';dialog.close();});
  </script>`);
}
test.describe("P16 round 15 native modal keyboard lifecycle",()=>{
  test.beforeEach(async({page})=>modal(page));
  test("trigger is keyboard reachable",async({page})=>{
    await page.keyboard.press("Tab");
    await expectFocus(page,"open");
  });
  test("Enter opens modal and moves focus inside",async({page})=>{
    await page.locator("#open").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#settings")).toBeVisible();
    expect(await page.locator("#settings").evaluate(node=>node.contains(document.activeElement))).toBe(true);
  });
  test("Space opens modal from trigger",async({page})=>{
    await page.locator("#open").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#settings")).toBeVisible();
  });
  test("modal has a programmatic accessible name",async({page})=>{
    await page.locator("#open").click();
    await expect(page.locator("#settings")).toHaveAttribute("aria-labelledby","dialog-title");
    await expect(page.getByRole("heading",{name:"Settings"})).toBeVisible();
  });
  test("Escape closes modal",async({page})=>{
    await page.locator("#open").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#settings")).toBeHidden();
  });
  test("Escape restores focus to trigger",async({page})=>{
    await page.locator("#open").click();
    await page.keyboard.press("Escape");
    await expectFocus(page,"open");
  });
  test("close button closes modal",async({page})=>{
    await page.locator("#open").click();
    await page.locator("#close").click();
    await expect(page.locator("#settings")).toBeHidden();
  });
  test("close button returns focus to opener",async({page})=>{
    await page.locator("#open").click();
    await page.locator("#close").click();
    await expectFocus(page,"open");
  });
  test("Tab remains within modal",async({page})=>{
    await page.locator("#open").click();
    await page.locator("#close").focus();
    await assertContainedFocus(page,"#settings","Tab");
  });
  test("Shift Tab remains within modal",async({page})=>{
    await page.locator("#open").click();
    await page.locator("#name").focus();
    await assertContainedFocus(page,"#settings","Shift+Tab");
  });
  test("background control cannot receive focus while modal is open",async({page})=>{
    await page.locator("#open").click();
    await page.locator("#background").focus();
    expect(await page.locator("#settings").evaluate(node=>node.contains(document.activeElement))).toBe(true);
  });
  test("background click does not close native modal",async({page})=>{
    await page.locator("#open").click();
    await page.locator("#background").click({force:true});
    await expect(page.locator("#settings")).toBeVisible();
  });
  test("dialog content input remains editable",async({page})=>{
    await page.locator("#open").click();
    await page.locator("#name").fill("Alex");
    await expect(page.locator("#name")).toHaveValue("Alex");
  });
  test("dialog input can be reached with Tab",async({page})=>{
    await page.locator("#open").click();
    await page.locator("#name").focus();
    await expectFocus(page,"name");
    await page.keyboard.press("Tab");
    await expectFocus(page,"save");
  });
  test("save action announces result and closes modal",async({page})=>{
    await page.locator("#open").click();
    await page.locator("#save").click();
    await expect(page.locator("#result")).toHaveText("Saved");
    await expect(page.locator("#settings")).toBeHidden();
  });
  test("save action returns focus to opener",async({page})=>{
    await page.locator("#open").click();
    await page.locator("#save").click();
    await expectFocus(page,"open");
  });
  test("dialog stays closed after a second Escape",async({page})=>{
    await page.locator("#open").click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator("#settings")).toBeHidden();
  });
  test("modal can be opened repeatedly",async({page})=>{
    await page.locator("#open").click();
    await page.keyboard.press("Escape");
    await page.locator("#open").click();
    await expect(page.locator("#settings")).toBeVisible();
  });
  test("reopened modal receives focus inside",async({page})=>{
    await page.locator("#open").click();
    await page.keyboard.press("Escape");
    await page.locator("#open").click();
    expect(await page.locator("#settings").evaluate(node=>node.contains(document.activeElement))).toBe(true);
  });
  test("modal trigger exposes expanded state while open",async({page})=>{
    await page.locator("#open").click();
    await expect(page.locator("#open")).toHaveAttribute("aria-haspopup","dialog");
  });
});
