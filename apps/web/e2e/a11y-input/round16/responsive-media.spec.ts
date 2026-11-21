import { expect, test } from "@playwright/test";
import { fixture, expectNoHorizontalOverflow, box } from "./visual-harness";

test.describe("P16 round 16 responsive media and data",()=>{
  test("responsive image remains within 320 pixel viewport",async({page})=>{
    await fixture(page,`<img id="photo" alt="Map preview" width="1600" height="900" style="max-width:100%;height:auto" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='900'%3E%3Crect width='1600' height='900' fill='gray'/%3E%3C/svg%3E`);
    await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);expect((await box(page,"#photo")).width).toBeLessThanOrEqual(288);
  });
  test("responsive image retains its aspect ratio",async({page})=>{
    await fixture(page,`<img id="photo" alt="Map preview" width="1600" height="900" style="max-width:100%;height:auto" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='900'%3E%3Crect width='1600' height='900' fill='gray'/%3E%3C/svg%3E`);
    const b=await box(page,"#photo");expect(b.width/b.height).toBeCloseTo(16/9,1);
  });
  test("video placeholder scales to the viewport",async({page})=>{
    await fixture(page,`<div id="video" role="img" aria-label="Video preview" style="width:1280px;max-width:100%;aspect-ratio:16/9;background:#333"></div>`);
    await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);expect((await box(page,"#video")).width).toBeLessThanOrEqual(288);
  });
  test("SVG chart scales without horizontal page scroll",async({page})=>{
    await fixture(page,`<svg id="chart" viewBox="0 0 1000 400" width="1000" height="400" style="max-width:100%;height:auto" role="img" aria-label="Monthly chart"><rect width="1000" height="400"/></svg>`);
    await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("canvas wrapper stays within viewport",async({page})=>{
    await fixture(page,`<div id="canvas-wrap" style="max-width:100%;overflow:auto"><canvas width="1200" height="600"></canvas></div>`);
    await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("table wrapper is keyboard reachable",async({page})=>{
    await fixture(page,`<div id="table" role="region" aria-label="Results" tabindex="0" style="max-width:100%;overflow:auto"><table style="min-width:800px"><tr><th>Name</th><th>Location</th></tr><tr><td>One</td><td>Two</td></tr></table></div>`);
    await page.locator("#table").focus();await expect(page.locator("#table")).toBeFocused();
  });
  test("table wrapper preserves header semantics",async({page})=>{
    await fixture(page,`<div role="region" aria-label="Results" tabindex="0" style="max-width:100%;overflow:auto"><table><tr><th scope="col">Name</th><th scope="col">Location</th></tr><tr><td>One</td><td>Two</td></tr></table></div>`);
    await expect(page.getByRole("columnheader")).toHaveCount(2);
  });
  test("data cards stack on narrow viewport",async({page})=>{
    await fixture(page,`<div id="cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px"><article class="card">One</article><article class="card">Two</article></div>`);
    await page.setViewportSize({width:320,height:720});const a=await box(page,".card:nth-child(1)"),b=await box(page,".card:nth-child(2)");expect(b.y).toBeGreaterThan(a.y);
  });
  test("data cards align side by side on desktop",async({page})=>{
    await fixture(page,`<div id="cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px"><article class="card">One</article><article class="card">Two</article></div>`);
    await page.setViewportSize({width:1280,height:900});const a=await box(page,".card:nth-child(1)"),b=await box(page,".card:nth-child(2)");expect(b.x).toBeGreaterThan(a.x);
  });
  test("media alt text remains available after resizing",async({page})=>{
    await fixture(page,`<img alt="Route diagram" width="1200" height="600" style="max-width:100%;height:auto" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='600'%3E%3Crect width='1200' height='600'/%3E%3C/svg%3E`);
    await page.setViewportSize({width:320,height:720});await expect(page.getByRole("img",{name:"Route diagram"})).toHaveCount(1);
  });
  test("media does not change the document heading",async({page})=>{
    await fixture(page,`<img alt="Route diagram" width="1200" height="600" style="max-width:100%;height:auto" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='600'%3E%3Crect width='1200' height='600'/%3E%3C/svg%3E`);
    await page.setViewportSize({width:320,height:720});await expect(page.getByRole("heading",{level:1})).toHaveCount(1);
  });
  test("media reflow preserves page language",async({page})=>{
    await fixture(page,`<img alt="Preview" width="1200" height="600" style="max-width:100%;height:auto" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='600'%3E%3Crect width='1200' height='600'/%3E%3C/svg%3E`);
    await page.setViewportSize({width:320,height:720});await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
  test("media container can be scrolled without moving keyboard focus",async({page})=>{
    await fixture(page,`<button id="before">Before</button><div id="scroll" tabindex="0" role="region" aria-label="Wide diagram" style="max-width:100%;overflow:auto"><div style="width:900px;height:80px">Wide</div></div><button id="after">After</button>`);
    await page.locator("#before").focus();await page.locator("#scroll").evaluate(node=>node.scrollLeft=100);await expect(page.locator("#before")).toBeFocused();
  });
  test("responsive media does not overlap primary action",async({page})=>{
    await fixture(page,`<img id="image" alt="Preview" width="1200" height="600" style="max-width:100%;height:auto" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='600'%3E%3Crect width='1200' height='600'/%3E%3C/svg%3E"><button id="action">Continue</button>`);
    await page.setViewportSize({width:320,height:720});const image=await box(page,"#image"),button=await box(page,"#action");expect(button.top).toBeGreaterThanOrEqual(image.bottom);
  });
});
