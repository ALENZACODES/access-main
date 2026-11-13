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
  await expect(page.getByRole("note").filter({ hasText: "Prototype. Every record is unverified" })).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1, name: "About" })).toBeFocused();
  await page.goto("/");
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "About" })).toBeVisible();
  await expect(page.getByText("0 records stored on this device")).toBeVisible();
});

test("french shell persists and returns to english", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.getByRole("link", { name: "Accueil" })).toBeVisible();
  const note = page.getByRole("note").filter({ hasText: "Traduction provisoire" });
  await expect(note).toBeVisible();
  await expect(note.locator("xpath=ancestor::main")).toHaveCount(1);
  const frenchResults = await new AxeBuilder({ page }).analyze();
  expect(frenchResults.violations, JSON.stringify(frenchResults.violations, null, 2)).toEqual([]);
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

  await page.goto("/places");
  await expect(page.getByText("This part of the App is not available yet. No records are shown.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Text to look for" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Search" })).toBeDisabled();
  await expect(page.getByText("access-maps")).toBeHidden();

  await page.goto("/finders");
  await expect(page.getByRole("radio", { name: "Washroom" })).toBeDisabled();
  await page.goto("/journey");
  await expect(page.getByRole("button", { name: "Plan this journey" })).toBeDisabled();
  await page.goto("/help");
  await expect(page.getByRole("button", { name: "Search" })).toBeDisabled();
});

async function seedCachedRecord(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("access-app");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("cacheEntries", "readwrite");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.objectStore("cacheEntries").put({
          id: "rec-e2e",
          kind: "place",
          title: "Unverified sample",
          stored_at: "2026-11-13T12:00:00.000Z",
          provenance: {
            source_name: "Example open data",
            source_url: "https://example.test/data",
            licence: "Open Government Licence – Toronto",
            licence_url: null,
            source_date: "2026-11-01",
            retrieved_at: "2026-11-13T12:00:00.000Z",
            tier: 0,
            prototype_label: "SEEDED-OPEN-DATA",
            freshness: "unknown",
          },
          contains_live_status: false,
          payload: {},
        });
      };
    });
  });
}

async function expectClearCacheFocus(
  page: Page,
  copy: { clear: string; title: string; body: string; cancel: string; confirm: string; cleared: string },
) {
  await page.goto("/data-status");
  const clear = page.getByRole("button", { name: copy.clear, exact: true });
  await expect(clear).toBeDisabled();
  await seedCachedRecord(page);
  await page.reload();
  await expect(clear).toBeEnabled();
  await clear.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading", { name: copy.title })).toBeVisible();
  await expect(dialog.getByRole("button", { name: copy.cancel, exact: true })).toBeFocused();
  const describedBy = await dialog.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toContainText(copy.body);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(clear).toBeFocused();
  await expect(page.getByText("Unverified sample")).toBeVisible();

  await clear.click();
  await page.getByRole("alertdialog").getByRole("button", { name: copy.cancel, exact: true }).click();
  await expect(clear).toBeFocused();

  await clear.click();
  await page.getByRole("alertdialog").getByRole("button", { name: copy.confirm, exact: true }).click();
  const cleared = page.getByText(copy.cleared);
  await expect(cleared).toBeVisible();
  await expect(cleared).toBeFocused();
  await expect(page.getByText("Unverified sample")).toHaveCount(0);
  await expect(clear).toBeDisabled();
}

test("clearing the cache returns focus to the trigger or the status", async ({ page }) => {
  await expectClearCacheFocus(page, {
    clear: "Remove cached records",
    title: "Remove cached records?",
    body: "This deletes cached records and waiting reports on this device.",
    cancel: "Keep records",
    confirm: "Remove records",
    cleared: "Cached records were removed from this device.",
  });
});

test("French clear-cache dialog returns focus to the trigger or the status", async ({ page }) => {
  await page.goto("/data-status");
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expectClearCacheFocus(page, {
    clear: "Retirer les enregistrements en cache",
    title: "Retirer les enregistrements en cache ?",
    body: "Cela supprime les enregistrements en cache et les signalements en attente sur cet appareil.",
    cancel: "Garder les enregistrements",
    confirm: "Retirer les enregistrements",
    cleared: "Les enregistrements en cache ont été retirés de cet appareil.",
  });
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
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
