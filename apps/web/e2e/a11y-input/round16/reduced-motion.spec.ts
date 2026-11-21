import { expect, test } from "@playwright/test";
import { fixture, preferenceSnapshot } from "./visual-harness";

async function motionPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<button id="toggle" aria-expanded="false" aria-controls="panel">Show details</button>
  <section id="panel" hidden>Details</section><p id="status" role="status" aria-live="polite">Ready</p>
  <div id="animated" class="animated" aria-hidden="true"></div>
  <script>
    const button=document.querySelector('#toggle'),panel=document.querySelector('#panel');
    button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));panel.hidden=!open;document.querySelector('#status').textContent=open?'Details shown':'Details hidden';});
  </script>`,
  `.animated{width:40px;height:40px;background:#333;animation:slide 2s infinite alternate}
   @keyframes slide{from{transform:translateX(0)}to{transform:translateX(80px)}}
   @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}`);
}
test.describe("P16 round 16 reduced-motion preference",()=>{
  test.beforeEach(async({page})=>{await motionPage(page);await page.emulateMedia({reducedMotion:"reduce"});});
  test("browser reports reduced motion preference",async({page})=>{
    expect((await preferenceSnapshot(page)).reducedMotion).toBe(true);
  });
  test("animation duration is minimized",async({page})=>{
    const duration=await page.locator("#animated").evaluate(node=>getComputedStyle(node).animationDuration);
    expect(duration).toMatch(/0\.01ms|0s/);
  });
  test("animation iteration is limited",async({page})=>{
    const count=await page.locator("#animated").evaluate(node=>getComputedStyle(node).animationIterationCount);
    expect(count).toBe("1");
  });
  test("scroll behaviour is not smooth",async({page})=>{
    const value=await page.locator("html").evaluate(node=>getComputedStyle(node).scrollBehavior);
    expect(value).toBe("auto");
  });
  test("transition duration is minimized",async({page})=>{
    const value=await page.locator("#toggle").evaluate(node=>getComputedStyle(node).transitionDuration);
    expect(value.split(",").every(part=>parseFloat(part)<=0.01)).toBe(true);
  });
  test("disclosure remains operable with reduced motion",async({page})=>{
    await page.locator("#toggle").focus();await page.keyboard.press("Enter");
    await expect(page.locator("#panel")).toBeVisible();
  });
  test("disclosure state remains exposed",async({page})=>{
    await page.locator("#toggle").click();await expect(page.locator("#toggle")).toHaveAttribute("aria-expanded","true");
  });
  test("status update remains available",async({page})=>{
    await page.locator("#toggle").click();await expect(page.getByRole("status")).toHaveText("Details shown");
  });
  test("reduced motion does not change keyboard focus",async({page})=>{
    await page.locator("#toggle").focus();await expect(page.locator("#toggle")).toBeFocused();
  });
  test("reduced motion does not disable the control",async({page})=>{
    await expect(page.locator("#toggle")).toBeEnabled();
  });
  test("preference can be switched back to no preference",async({page})=>{
    await page.emulateMedia({reducedMotion:"no-preference"});
    expect((await preferenceSnapshot(page)).reducedMotion).toBe(false);
  });
  test("reduced motion can be reapplied after a preference change",async({page})=>{
    await page.emulateMedia({reducedMotion:"no-preference"});
    await page.emulateMedia({reducedMotion:"reduce"});
    expect((await preferenceSnapshot(page)).reducedMotion).toBe(true);
  });
  test("content remains readable when animation is suppressed",async({page})=>{
    await expect(page.locator("#status")).toHaveText("Ready");
    await expect(page.locator("#toggle")).toHaveText("Show details");
  });
  test("animated decoration is not exposed as an interactive control",async({page})=>{
    await expect(page.locator("#animated")).toHaveAttribute("aria-hidden","true");
  });
  test("reduced motion still permits user scrolling",async({page})=>{
    await page.locator("#panel").evaluate(node=>node.after(Object.assign(document.createElement("div"),{style:"height:1200px"})));
    await page.evaluate(()=>window.scrollTo(0,500));
    expect(await page.evaluate(()=>window.scrollY)).toBeGreaterThan(0);
  });
  test("keyboard action does not depend on animation completion",async({page})=>{
    await page.locator("#toggle").focus();await page.keyboard.press("Space");
    await expect(page.locator("#panel")).toBeVisible();
  });
  test("status remains polite",async({page})=>{
    await expect(page.getByRole("status")).toHaveAttribute("aria-live","polite");
  });
  test("reduced motion works at narrow viewport",async({page})=>{
    await page.setViewportSize({width:320,height:720});
    await expect(page.locator("#toggle")).toBeVisible();
  });
  test("reduced motion works at desktop viewport",async({page})=>{
    await page.setViewportSize({width:1280,height:900});
    await expect(page.locator("#toggle")).toBeVisible();
  });
  test("reduced motion does not change document language",async({page})=>{
    await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
});
