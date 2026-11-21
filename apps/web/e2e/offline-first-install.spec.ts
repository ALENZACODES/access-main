import { expect, test } from "@playwright/test";

const labels = {
  en: {
    openSheet: "Open question sheet", sheet: "Personal offline question sheet",
    ask: "Question to ask", add: "Add question", closeSheet: "Close question sheet",
    openBrief: "Open coordination brief", brief: "Offline coordination brief",
    name: "Checkpoint name", addStep: "Add checkpoint", closeBrief: "Close coordination brief",
    openComparison: "Open snapshot comparison", comparison: "Compare local region listings",
    baseline: "Baseline snapshot", candidate: "Comparison A JSON", compare: "Compare snapshots",
    question: "Which entrance has a level approach?", checkpoint: "Call the front desk",
  },
  fr: {
    openSheet: "Ouvrir la fiche de questions", sheet: "Fiche de questions hors ligne",
    ask: "Question à poser", add: "Ajouter une question", closeSheet: "Fermer la fiche de questions",
    openBrief: "Ouvrir la fiche de coordination", brief: "Fiche de coordination hors ligne",
    name: "Nom du point de contrôle", addStep: "Ajouter un point de contrôle", closeBrief: "Fermer la fiche de coordination",
    openComparison: "Ouvrir la comparaison des instantanés", comparison: "Comparer les listes régionales locales",
    baseline: "Instantané de référence", candidate: "JSON de comparaison A", compare: "Comparer les instantanés",
    question: "Quelle entrée est de plain-pied\u202f?", checkpoint: "Appeler l’accueil",
  },
} as const;

for (const language of ["en", "fr"] as const) {
  test.describe(language, () => {
    test.use({ locale: `${language}-CA`, serviceWorkers: "allow" });

    test("the three planning tools work on the first offline visit", async ({ page, context }) => {
      const copy = labels[language];

      // Only the shell is visited online. Replacing this tab discards its module registry.
      await page.goto("/");
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      const initialScripts = await page.evaluate(async () => {
        const names = (await caches.keys()).filter((name) => name.includes("precache"));
        const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
        return requests.flat().map(({ url }) => new URL(url).pathname).filter((path) => path.endsWith(".js"));
      });
      expect(initialScripts.length).toBeGreaterThan(0);
      await context.setOffline(true);
      const offline = await context.newPage();
      const scriptPaths = new Set<string>();
      offline.on("request", (request) => {
        if (request.resourceType() === "script") scriptPaths.add(new URL(request.url()).pathname);
      });
      await page.close();
      const navigation = await offline.goto("/offline");
      expect(navigation?.fromServiceWorker()).toBe(true);
      expect(await offline.evaluate(() => navigator.onLine)).toBe(false);
      await expect(offline.locator("html")).toHaveAttribute("lang", language);

      await offline.getByRole("button", { name: copy.openSheet, exact: true }).click();
      const sheet = offline.getByRole("region", { name: copy.sheet, exact: true });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("textbox", { name: copy.ask, exact: true }).fill(copy.question);
      await sheet.getByRole("button", { name: copy.add, exact: true }).click();
      await expect(sheet.getByText(copy.question, { exact: true })).toBeVisible();
      await offline.getByRole("button", { name: copy.closeSheet, exact: true }).click();

      await offline.getByRole("button", { name: copy.openBrief, exact: true }).click();
      const brief = offline.getByRole("region", { name: copy.brief, exact: true });
      await expect(brief).toBeVisible();
      await brief.getByRole("textbox", { name: copy.name, exact: true }).fill(copy.checkpoint);
      await brief.getByRole("textbox", { name: copy.ask, exact: true }).fill(copy.question);
      await brief.getByRole("button", { name: copy.addStep, exact: true }).click();
      await expect(brief.getByRole("listitem").filter({ hasText: copy.checkpoint })).toContainText("UNKNOWN");
      await offline.getByRole("button", { name: copy.closeBrief, exact: true }).click();

      await offline.getByRole("button", { name: copy.openComparison, exact: true }).click();
      await expect(offline.getByRole("heading", { name: copy.comparison, exact: true })).toBeVisible();
      // These are hand-entered listing documents. No regional pack was downloaded.
      const baseline = {
        schema: "offline-region-snapshot-v1", regionId: "personal", label: "A", takenOn: "2025-01-15", cells: [],
      };
      const comparison = {
        ...baseline, label: "B", cells: [{
          id: "entry-hall", bytes: 64, provenance: { source: "Personal notes", licence: "UNKNOWN", date: baseline.takenOn },
        }],
      };
      await offline.getByRole("textbox", { name: copy.baseline, exact: true }).fill(JSON.stringify(baseline));
      await offline.getByRole("textbox", { name: copy.candidate, exact: true }).fill(JSON.stringify(comparison));
      await offline.getByRole("button", { name: copy.compare, exact: true }).click();
      await expect(offline.getByText("entry-hall", { exact: true })).toBeVisible();

      // Runtime caching or a browser HTTP-cache hit cannot substitute for an install entry.
      expect(scriptPaths.size).toBeGreaterThan(0);
      expect([...scriptPaths].filter((path) => !initialScripts.includes(path))).toEqual([]);
    });
  });
}
