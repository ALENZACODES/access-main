import { expect, test } from "@playwright/test";
import { assertTarget, assertWidgetSemantics, expectFocus, fixture, inspectWidgets } from "./harness";
import { expectOneTabStop } from "./patterns";

async function treeFixture(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page, `<div id="tree" role="tree" aria-label="Folders">
    <div id="folder-a" role="treeitem" aria-expanded="false" aria-level="1" tabindex="0">Projects</div>
    <div id="folder-b" role="treeitem" aria-expanded="false" aria-level="1" tabindex="-1">Archive</div>
    <div id="folder-c" role="treeitem" aria-level="1" tabindex="-1">Shared</div>
  </div><script>
    const tree=document.querySelector('#tree'),items=[...tree.querySelectorAll('[role=treeitem]')];let current=0;
    const focus=i=>{current=i;items.forEach((item,n)=>item.tabIndex=n===i?0:-1);items[i].focus();};
    tree.addEventListener('keydown',event=>{
      const i=items.indexOf(document.activeElement);if(i<0)return;
      if(event.key==='ArrowDown'){event.preventDefault();focus(Math.min(items.length-1,i+1));}
      else if(event.key==='ArrowUp'){event.preventDefault();focus(Math.max(0,i-1));}
      else if(event.key==='Home'){event.preventDefault();focus(0);}
      else if(event.key==='End'){event.preventDefault();focus(items.length-1);}
      else if(event.key==='ArrowRight'){const item=items[i];if(item.getAttribute('aria-expanded')==='false'){item.setAttribute('aria-expanded','true');}else if(item.getAttribute('aria-expanded')==='true'&&items[i+1])focus(i+1);}
      else if(event.key==='ArrowLeft'){const item=items[i];if(item.getAttribute('aria-expanded')==='true')item.setAttribute('aria-expanded','false');}
      else if(event.key==='Enter'||event.key===' '){event.preventDefault();itemSelect(items[i]);}
    });
    function itemSelect(item){items.forEach(node=>node.setAttribute('aria-selected',String(node===item)));item.setAttribute('aria-current','true');}
  </script>`);
}
async function gridFixture(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page, `<div id="grid" role="grid" aria-label="Schedule" aria-rowcount="2" aria-colcount="3">
    <div role="row" aria-rowindex="1"><button id="cell-a" role="gridcell" tabindex="0" aria-colindex="1">A1</button><button id="cell-b" role="gridcell" tabindex="-1" aria-colindex="2">B1</button><button id="cell-c" role="gridcell" tabindex="-1" aria-colindex="3">C1</button></div>
    <div role="row" aria-rowindex="2"><button id="cell-d" role="gridcell" tabindex="-1" aria-colindex="1">A2</button><button id="cell-e" role="gridcell" tabindex="-1" aria-colindex="2">B2</button><button id="cell-f" role="gridcell" tabindex="-1" aria-colindex="3">C2</button></div>
  </div><script>
    const grid=document.querySelector('#grid'),cells=[...grid.querySelectorAll('[role=gridcell]')];let row=0,col=0;
    const move=(r,c)=>{row=Math.max(0,Math.min(1,r));col=Math.max(0,Math.min(2,c));const index=row*3+col;cells.forEach((cell,i)=>cell.tabIndex=i===index?0:-1);cells[index].focus();};
    grid.addEventListener('keydown',event=>{
      if(event.key==='ArrowRight'){event.preventDefault();move(row,col+1);}
      else if(event.key==='ArrowLeft'){event.preventDefault();move(row,col-1);}
      else if(event.key==='ArrowDown'){event.preventDefault();move(row+1,col);}
      else if(event.key==='ArrowUp'){event.preventDefault();move(row-1,col);}
      else if(event.key==='Home'){event.preventDefault();move(row,0);}
      else if(event.key==='End'){event.preventDefault();move(row,2);}
      else if(event.key==='PageDown'){event.preventDefault();move(1,col);}
      else if(event.key==='PageUp'){event.preventDefault();move(0,col);}
    });
    cells.forEach((cell,index)=>cell.addEventListener('focus',()=>{row=Math.floor(index/3);col=index%3;}));
  </script>`);
}
test.describe("P16 round 15 tree keyboard contract",()=>{
  test.beforeEach(async({page})=>treeFixture(page));
  test("tree has a name, items and one tab stop",async({page})=>{await assertWidgetSemantics(page);await expectOneTabStop(page,"#tree [role=treeitem]");});
  test("ArrowDown moves to next tree item",async({page})=>{await page.locator("#folder-a").focus();await page.keyboard.press("ArrowDown");await expectFocus(page,"folder-b");});
  test("ArrowUp moves to previous tree item",async({page})=>{await page.locator("#folder-b").focus();await page.keyboard.press("ArrowUp");await expectFocus(page,"folder-a");});
  test("Home moves to first visible item",async({page})=>{await page.locator("#folder-c").focus();await page.keyboard.press("Home");await expectFocus(page,"folder-a");});
  test("End moves to last visible item",async({page})=>{await page.locator("#folder-a").focus();await page.keyboard.press("End");await expectFocus(page,"folder-c");});
  test("Right expands a collapsed branch",async({page})=>{await page.locator("#folder-a").focus();await page.keyboard.press("ArrowRight");await expect(page.locator("#folder-a")).toHaveAttribute("aria-expanded","true");});
  test("Left collapses an expanded branch",async({page})=>{await page.locator("#folder-a").focus();await page.keyboard.press("ArrowRight");await page.keyboard.press("ArrowLeft");await expect(page.locator("#folder-a")).toHaveAttribute("aria-expanded","false");});
  test("Right on expanded branch moves to child when present",async({page})=>{await page.locator("#folder-a").evaluate(node=>node.setAttribute("aria-expanded","true"));await page.keyboard.press("ArrowRight");await expectFocus(page,"folder-b");});
  test("Left on collapsed branch keeps focus",async({page})=>{await page.locator("#folder-a").focus();await page.keyboard.press("ArrowLeft");await expectFocus(page,"folder-a");});
  test("Enter selects focused item",async({page})=>{await page.locator("#folder-b").focus();await page.keyboard.press("Enter");await expect(page.locator("#folder-b")).toHaveAttribute("aria-selected","true");});
  test("Space selects focused item",async({page})=>{await page.locator("#folder-c").focus();await page.keyboard.press("Space");await expect(page.locator("#folder-c")).toHaveAttribute("aria-selected","true");});
  test("tree items expose 44px targets",async({page})=>{for(const id of ["folder-a","folder-b","folder-c"])await assertTarget(page,`#${id}`);});
  test("unnamed tree is reported",async({page})=>{await page.locator("#tree").removeAttribute("aria-label");expect((await inspectWidgets(page)).issues.map(x=>x.code)).toContain("tree-name");});
  test("empty tree is reported",async({page})=>{await page.locator("#tree [role=treeitem]").evaluateAll(nodes=>nodes.forEach(node=>node.remove()));expect((await inspectWidgets(page)).issues.map(x=>x.code)).toContain("tree-children");});
  test("two tree tab stops are reported",async({page})=>{await page.locator("#folder-b").evaluate(node=>(node as HTMLElement).tabIndex=0);expect((await inspectWidgets(page)).issues.map(x=>x.code)).toContain("tree-roving-focus");});
  test("unnamed tree item is reported",async({page})=>{await page.locator("#folder-b").evaluate(node=>node.textContent="");expect((await inspectWidgets(page)).issues.map(x=>x.code)).toContain("treeitem-name");});
  test("invalid expanded state is reported",async({page})=>{await page.locator("#folder-a").setAttribute("aria-expanded","sometimes");expect((await inspectWidgets(page)).issues.map(x=>x.code)).toContain("treeitem-expanded-state");});
  test("roving tabindex remains unique after long traversal",async({page})=>{await page.locator("#folder-a").focus();for(let i=0;i<24;i++)await page.keyboard.press(i%2?"ArrowUp":"ArrowDown");await expectOneTabStop(page,"#tree [role=treeitem]");});
  test("tree focus remains inside tree during arrow navigation",async({page})=>{await page.locator("#folder-a").focus();for(const key of ["ArrowDown","ArrowDown","ArrowUp","Home","End"]) {await page.keyboard.press(key);expect(await page.locator("#tree").evaluate(node=>node.contains(document.activeElement))).toBe(true);}});
  test("selection is not changed by arrow movement",async({page})=>{await page.locator("#folder-a").focus();await page.keyboard.press("ArrowDown");await expect(page.locator("[aria-selected=true]")).toHaveCount(0);});
  test("selecting another tree item replaces prior selection",async({page})=>{await page.locator("#folder-a").focus();await page.keyboard.press("Enter");await page.locator("#folder-b").focus();await page.keyboard.press("Enter");await expect(page.locator("[aria-selected=true]")).toHaveCount(1);await expect(page.locator("#folder-b")).toHaveAttribute("aria-selected","true");});
  test("tree remains labelled when selection changes",async({page})=>{await page.locator("#folder-c").focus();await page.keyboard.press("Enter");await expect(page.locator("#tree")).toHaveAttribute("aria-label","Folders");});
});

test.describe("P16 round 15 grid keyboard contract",()=>{
  test.beforeEach(async({page})=>gridFixture(page));
  test("grid has a name, rows and cells",async({page})=>{await assertWidgetSemantics(page);});
  test("Right moves to next cell",async({page})=>{await page.locator("#cell-a").focus();await page.keyboard.press("ArrowRight");await expectFocus(page,"cell-b");});
  test("Left moves to previous cell",async({page})=>{await page.locator("#cell-b").focus();await page.keyboard.press("ArrowLeft");await expectFocus(page,"cell-a");});
  test("Down moves to same column next row",async({page})=>{await page.locator("#cell-b").focus();await page.keyboard.press("ArrowDown");await expectFocus(page,"cell-e");});
  test("Up moves to same column prior row",async({page})=>{await page.locator("#cell-e").focus();await page.keyboard.press("ArrowUp");await expectFocus(page,"cell-b");});
  test("Home moves to first cell in row",async({page})=>{await page.locator("#cell-c").focus();await page.keyboard.press("Home");await expectFocus(page,"cell-a");});
  test("End moves to last cell in row",async({page})=>{await page.locator("#cell-a").focus();await page.keyboard.press("End");await expectFocus(page,"cell-c");});
  test("PageDown moves to final row same column",async({page})=>{await page.locator("#cell-b").focus();await page.keyboard.press("PageDown");await expectFocus(page,"cell-e");});
  test("PageUp moves to first row same column",async({page})=>{await page.locator("#cell-e").focus();await page.keyboard.press("PageUp");await expectFocus(page,"cell-b");});
  test("grid has one sequential tab stop",async({page})=>{await expect(page.locator("#grid [tabindex=0]")).toHaveCount(1);});
  test("grid cells have 44px targets",async({page})=>{for(const id of ["cell-a","cell-b","cell-c","cell-d","cell-e","cell-f"])await assertTarget(page,`#${id}`);});
  test("unnamed grid is reported",async({page})=>{await page.locator("#grid").removeAttribute("aria-label");expect((await inspectWidgets(page)).issues.map(x=>x.code)).toContain("grid-name");});
  test("grid without rows is reported",async({page})=>{await page.locator("#grid [role=row]").evaluateAll(nodes=>nodes.forEach(node=>node.remove()));expect((await inspectWidgets(page)).issues.map(x=>x.code)).toContain("grid-rows");});
  test("grid row without cells is reported",async({page})=>{await page.locator("#grid [role=row]").first().evaluate(node=>node.replaceChildren());expect((await inspectWidgets(page)).issues.map(x=>x.code)).toContain("grid-row-cells");});
  test("grid keeps focus inside during movement",async({page})=>{await page.locator("#cell-a").focus();for(const key of ["ArrowRight","ArrowDown","ArrowLeft","ArrowUp","End","Home"]) {await page.keyboard.press(key);expect(await page.locator("#grid").evaluate(node=>node.contains(document.activeElement))).toBe(true);}});
  test("grid clamps movement at top boundary",async({page})=>{await page.locator("#cell-a").focus();await page.keyboard.press("ArrowUp");await expectFocus(page,"cell-a");});
  test("grid clamps movement at bottom boundary",async({page})=>{await page.locator("#cell-f").focus();await page.keyboard.press("ArrowDown");await expectFocus(page,"cell-f");});
  test("grid clamps movement at left boundary",async({page})=>{await page.locator("#cell-a").focus();await page.keyboard.press("ArrowLeft");await expectFocus(page,"cell-a");});
  test("grid clamps movement at right boundary",async({page})=>{await page.locator("#cell-c").focus();await page.keyboard.press("ArrowRight");await expectFocus(page,"cell-c");});
  test("one cell is tabbable after repeated movement",async({page})=>{await page.locator("#cell-a").focus();for(let i=0;i<20;i++)await page.keyboard.press(["ArrowRight","ArrowDown","ArrowLeft","ArrowUp"][i%4]);await expect(page.locator("#grid [tabindex=0]")).toHaveCount(1);});
});
