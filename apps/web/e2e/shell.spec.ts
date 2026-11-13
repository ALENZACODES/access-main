import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ROUTES = ["/", "/about", "/onboarding", "/profile", "/data-status", "/places", "/journey", "/finders", "/navigator", "/games", "/help"];

async function expectOneHeading(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const mark = () => {
      (window as unknown as { __geo?: boolean }).__geo = true;
    };
    navigator.geolocation.getCurrentPosition = mark as Geolocation["getCurrentPosition"];
    navigator.geolocation.watchPosition = (() => {
      mark();
      return 0;
    }) as Geolocation["watchPosition"];
  });
  page.on("request", (request) => {
    const { hostname } = new URL(request.url());
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      throw new Error(`Unexpected request to ${request.url()}`);
    }
  });
});

test("home shows the prototype, the build, and a skip link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "the App" })).toBeVisible();
  await expect(page.getByText("Prototype. A record is unverified")).toBeVisible();
  await expect(page.getByText("No organisation, including Spinal Cord Injury Ontario, has endorsed the App.").first()).toBeVisible();
  await expect(page.getByText("Build e2e").first()).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await expectOneHeading(page);
});

test("about is reachable by keyboard and by a link", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "About", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { level: 1, name: "About" })).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "About" })).toBeVisible();
  await expect(page.getByText("0 records stored on this device")).toBeVisible();
});

test("french shell persists and returns to english", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.getByRole("link", { name: "Accueil" })).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "Traduction provisoire" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Accueil" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("module pages do not invent places and axe is clean", async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    await expectOneHeading(page);
    await expect(page.getByText("Toronto City Hall")).toHaveCount(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${route} ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
  }
  expect(await page.evaluate(() => (window as unknown as { __geo?: boolean }).__geo ?? false)).toBe(false);
});

test("narrow and enlarged text do not force horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/profile");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const offenders: string[] = [];
    for (const element of document.querySelectorAll("body *")) {
      const box = element.getBoundingClientRect();
      if (box.right > root.clientWidth + 1 || box.left < -1) {
        offenders.push(`${element.tagName}.${element.className} ${Math.round(box.left)}..${Math.round(box.right)}`);
      }
    }
    return { scroll: root.scrollWidth, client: root.clientWidth, offenders: offenders.slice(0, 12) };
  });
  expect(overflow.offenders, JSON.stringify(overflow)).toEqual([]);
});
