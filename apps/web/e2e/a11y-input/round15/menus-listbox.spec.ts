import { expect, test } from "@playwright/test";
import { assertTarget, assertWidgetSemantics, expectFocus, expectOneTabStop, fixture, inspectWidgets } from "./harness";

async function menuFixture(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page, `<button id="menu-trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="actions">Actions</button>
  <div id="actions" role="menu" aria-label="Actions" hidden>
    <button id="open" role="menuitem" tabindex="-1">Open</button>
    <button id="rename" role="menuitem" tabindex="-1">Rename</button>
    <button id="remove" role="menuitem" tabindex="-1">Remove</button>
  </div>
  <p id="result" role="status" aria-live="polite">No action</p>
  <script>
    const trigger=document.querySelector('#menu-trigger'),menu=document.querySelector('#actions');
    const items=[...menu.querySelectorAll('[role=menuitem]')];
    const open=(index=0)=>{menu.hidden=false;trigger.setAttribute('aria-expanded','true');items.forEach((item,i)=>item.tabIndex=i===index?0:-1);items[index].focus();};
    const close=()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();};
    trigger.addEventListener('click',()=>menu.hidden?open():close());
    trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='Enter'||event.key===' '){event.preventDefault();open(0);}else if(event.key==='ArrowUp'){event.preventDefault();open(items.length-1);}});
    menu.addEventListener('keydown',event=>{
      const index=items.indexOf(document.activeElement);if(index<0)return;
      if(event.key==='Escape'){event.preventDefault();close();return;}
      let next=index;
      if(event.key==='ArrowDown')next=(index+1)%items.length;
      else if(event.key==='ArrowUp')next=(index+items.length-1)%items.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=items.length-1;
      else if(event.key==='Tab'){close();return;}
      else return;
      event.preventDefault();items.forEach((item,i)=>item.tabIndex=i===next?0:-1);items[next].focus();
    });
    items.forEach(item=>item.addEventListener('click',()=>{document.querySelector('#result').textContent=item.textContent+' selected';close();}));
  </script>`);
}
async function listboxFixture(page: import("@playwright/test").Page, multi = false): Promise<void> {
  await fixture(page, `<div id="choices" role="listbox" aria-label="Preferred contact" tabindex="-1" aria-multiselectable="${multi}">
    <div id="email" role="option" aria-selected="true" tabindex="0">Email</div>
    <div id="phone" role="option" aria-selected="false" tabindex="-1">Phone</div>
    <div id="mail" role="option" aria-selected="false" tabindex="-1">Mail</div>
  </div><p id="selection" role="status" aria-live="polite">Email</p>
  <script>
    const box=document.querySelector('#choices'),items=[...box.querySelectorAll('[role=option]')],multi=box.getAttribute('aria-multiselectable')==='true';
    let current=0;
    const focus=(index)=>{current=index;items.forEach((item,i)=>item.tabIndex=i===index?0:-1);items[index].focus();};
    const select=(index,add=false)=>{if(!multi)items.forEach((item,i)=>item.setAttribute('aria-selected',String(i===index)));else if(!add)items[index].setAttribute('aria-selected',String(items[index].getAttribute('aria-selected')!=='true'));document.querySelector('#selection').textContent=items.filter(item=>item.getAttribute('aria-selected')==='true').map(item=>item.textContent).join(', ');};
    box.addEventListener('focusin',event=>{
      const index=items.indexOf(event.target);
      if(index>=0)current=index;
    });
    box.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowRight'){event.preventDefault();focus((current+1)%items.length);}
      else if(event.key==='ArrowUp'||event.key==='ArrowLeft'){event.preventDefault();focus((current+items.length-1)%items.length);}
      else if(event.key==='Home'){event.preventDefault();focus(0);}
      else if(event.key==='End'){event.preventDefault();focus(items.length-1);}
      else if(event.key===' '||event.key==='Enter'){event.preventDefault();select(current,event.ctrlKey);}
      else if(event.key.length===1&&/[a-z]/i.test(event.key)){const found=items.findIndex(item=>item.textContent.toLowerCase().startsWith(event.key.toLowerCase()));if(found>=0)focus(found);}
    });
    items.forEach((item,index)=>item.addEventListener('click',()=>{focus(index);select(index);}));
    box.addEventListener('focus',()=>{if(!items.some(item=>item.tabIndex===0))focus(0);});
  </script>`);
}
test.describe("P16 round 15 menu keyboard contract",()=>{
  test.beforeEach(async({page})=>menuFixture(page));
  test("menu trigger is named and announces popup",async({page})=>{
    await expect(page.locator("#menu-trigger")).toHaveAttribute("aria-haspopup","menu");
    await expect(page.locator("#menu-trigger")).toHaveAttribute("aria-expanded","false");
  });
  test("ArrowDown opens menu at first item",async({page})=>{
    await page.locator("#menu-trigger").focus();await page.keyboard.press("ArrowDown");
    await expectFocus(page,"open");await expect(page.locator("#actions")).toBeVisible();
  });
  test("ArrowUp opens menu at final item",async({page})=>{
    await page.locator("#menu-trigger").focus();await page.keyboard.press("ArrowUp");
    await expectFocus(page,"remove");
  });
  test("Enter opens menu",async({page})=>{
    await page.locator("#menu-trigger").focus();await page.keyboard.press("Enter");
    await expectFocus(page,"open");
  });
  test("Space opens menu",async({page})=>{
    await page.locator("#menu-trigger").focus();await page.keyboard.press("Space");
    await expectFocus(page,"open");
  });
  test("ArrowDown moves between menu items",async({page})=>{
    await page.locator("#menu-trigger").click();await page.keyboard.press("ArrowDown");
    await expectFocus(page,"rename");
  });
  test("ArrowUp moves between menu items",async({page})=>{
    await page.locator("#menu-trigger").click();await page.keyboard.press("ArrowUp");
    await expectFocus(page,"remove");
  });
  test("menu navigation wraps at end",async({page})=>{
    await page.locator("#menu-trigger").click();await page.locator("#remove").focus();
    await page.keyboard.press("ArrowDown");await expectFocus(page,"open");
  });
  test("menu navigation wraps at beginning",async({page})=>{
    await page.locator("#menu-trigger").click();await page.locator("#open").focus();
    await page.keyboard.press("ArrowUp");await expectFocus(page,"remove");
  });
  test("Home moves to first menu item",async({page})=>{
    await page.locator("#menu-trigger").click();await page.locator("#remove").focus();
    await page.keyboard.press("Home");await expectFocus(page,"open");
  });
  test("End moves to last menu item",async({page})=>{
    await page.locator("#menu-trigger").click();await page.keyboard.press("End");
    await expectFocus(page,"remove");
  });
  test("Escape closes menu and restores trigger focus",async({page})=>{
    await page.locator("#menu-trigger").click();await page.keyboard.press("Escape");
    await expect(page.locator("#actions")).toBeHidden();await expectFocus(page,"menu-trigger");
  });
  test("Tab closes menu and restores focus",async({page})=>{
    await page.locator("#menu-trigger").click();await page.keyboard.press("Tab");
    await expect(page.locator("#actions")).toBeHidden();await expect(page.locator("#menu-trigger")).toHaveAttribute("aria-expanded","false");
  });
  test("menu exposes one roving tab stop",async({page})=>{
    await page.locator("#menu-trigger").click();await expectOneTabStop(page,"#actions [role=menuitem]");
    await assertWidgetSemantics(page);
  });
  test("menu items have touch-sized targets",async({page})=>{
    await page.locator("#menu-trigger").click();
    for(const id of ["open","rename","remove"])await assertTarget(page,`#${id}`);
  });
  test("activating menu item announces action and closes menu",async({page})=>{
    await page.locator("#menu-trigger").click();await page.locator("#rename").click();
    await expect(page.locator("#result")).toHaveText("Rename selected");
    await expect(page.locator("#actions")).toBeHidden();
  });
  test("menu has one selected navigation focus at each step",async({page})=>{
    await page.locator("#menu-trigger").click();
    for(const key of ["ArrowDown","ArrowDown","ArrowUp","Home","End"]){
      await page.keyboard.press(key);await expectOneTabStop(page,"#actions [role=menuitem]");
    }
  });
  test("unnamed menu is rejected",async({page})=>{
    await page.locator("#actions").evaluate(node => node.removeAttribute("aria-label"));
    const result=await inspectWidgets(page);expect(result.issues.map(x=>x.code)).toContain("menu-name");
  });
  test("menu with no menu items is rejected",async({page})=>{
    await page.locator("#actions").locator("[role=menuitem]").evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
    const result=await inspectWidgets(page);expect(result.issues.map(x=>x.code)).toContain("menu-children");
  });
  test("menu with two tab stops is rejected",async({page})=>{
    await page.locator("#menu-trigger").click();
    await page.locator("#rename").evaluate(node => (node as HTMLElement).tabIndex = 0);
    const result=await inspectWidgets(page);expect(result.issues.map(x=>x.code)).toContain("menu-roving-focus");
  });
  test("unnamed menu item is rejected",async({page})=>{
    await page.locator("#rename").textContent().then(async()=>page.locator("#rename").evaluate(node=>node.textContent=""));
    const result=await inspectWidgets(page);expect(result.issues.map(x=>x.code)).toContain("menuitem-name");
  });
});

test.describe("P16 round 15 listbox keyboard contract",()=>{
  test.beforeEach(async({page})=>listboxFixture(page));
  test("listbox has a name and options with selection state",async({page})=>{await assertWidgetSemantics(page);});
  test("ArrowDown moves active option",async({page})=>{await page.locator("#choices").focus();await page.keyboard.press("ArrowDown");await expectFocus(page,"phone");});
  test("ArrowUp moves active option",async({page})=>{await page.locator("#choices").focus();await page.keyboard.press("ArrowUp");await expectFocus(page,"mail");});
  test("ArrowRight moves to next option",async({page})=>{await page.locator("#choices").focus();await page.keyboard.press("ArrowRight");await expectFocus(page,"phone");});
  test("ArrowLeft moves to previous option",async({page})=>{await page.locator("#phone").focus();await page.keyboard.press("ArrowLeft");await expectFocus(page,"email");});
  test("Home moves to first option",async({page})=>{await page.locator("#mail").focus();await page.keyboard.press("Home");await expectFocus(page,"email");});
  test("End moves to last option",async({page})=>{await page.locator("#email").focus();await page.keyboard.press("End");await expectFocus(page,"mail");});
  test("Space selects focused option",async({page})=>{await page.locator("#choices").focus();await page.keyboard.press("ArrowDown");await page.keyboard.press("Space");await expect(page.locator("#phone")).toHaveAttribute("aria-selected","true");});
  test("Enter selects focused option",async({page})=>{await page.locator("#choices").focus();await page.keyboard.press("End");await page.keyboard.press("Enter");await expect(page.locator("#mail")).toHaveAttribute("aria-selected","true");});
  test("single select keeps one selected option",async({page})=>{await page.locator("#choices").focus();await page.keyboard.press("ArrowDown");await page.keyboard.press("Space");await expect(page.locator("#choices [aria-selected=true]")).toHaveCount(1);});
  test("selection status updates",async({page})=>{await page.locator("#choices").focus();await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");await expect(page.locator("#selection")).toHaveText("Phone");});
  test("typeahead selects matching initial",async({page})=>{await page.locator("#choices").focus();await page.keyboard.press("m");await expectFocus(page,"mail");});
  test("listbox has a single tab stop",async({page})=>{await expectOneTabStop(page,"#choices [role=option]");});
  test("listbox options have 44px targets",async({page})=>{for(const id of ["email","phone","mail"])await assertTarget(page,`#${id}`);});
  test("unnamed listbox is rejected",async({page})=>{await page.locator("#choices").evaluate(node => node.removeAttribute("aria-label"));const result=await inspectWidgets(page);expect(result.issues.map(x=>x.code)).toContain("listbox-name");});
  test("listbox with no options is rejected",async({page})=>{await page.locator("#choices [role=option]").evaluateAll(nodes=>nodes.forEach(node=>node.remove()));const result=await inspectWidgets(page);expect(result.issues.map(x=>x.code)).toContain("listbox-children");});
  test("option without accessible name is rejected",async({page})=>{await page.locator("#phone").textContent().then(async()=>page.locator("#phone").evaluate(node=>node.textContent=""));const result=await inspectWidgets(page);expect(result.issues.map(x=>x.code)).toContain("option-name");});
  test("option without selected state is rejected",async({page})=>{await page.locator("#phone").evaluate(node => node.removeAttribute("aria-selected"));const result=await inspectWidgets(page);expect(result.issues.map(x=>x.code)).toContain("option-selected-state");});
  test("multiple selected options are rejected in single-select listbox",async({page})=>{await page.locator("#phone").evaluate(node => node.setAttribute("aria-selected","true"));const result=await inspectWidgets(page);expect(result.issues.map(x=>x.code)).toContain("listbox-selection-count");});
  test("multiselect listbox permits several selected options",async({page})=>{await listboxFixture(page,true);await page.locator("#phone").evaluate(node => node.setAttribute("aria-selected","true"));expect((await inspectWidgets(page)).issues).toEqual([]);});
});
